import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { OtpRepository } from './otp.repository';
import { MailService } from './mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { comparePassword, hashPassword } from '../../common/utils/hash.util';
import {
  InvalidCredentialsException,
  EmailAlreadyExistsException,
} from '../../common/exceptions/app.exceptions';
import { UserDocument } from '../user/entities/user.schema';

/** Mã bypass tạm thời — OTP email sẽ hoàn thiện sau */
const OTP_BYPASS_CODE = '000000';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly otpRepository: OtpRepository,
    private readonly mailService: MailService,
  ) {}

  /** Đăng ký tài khoản và gửi OTP xác thực */
  async register(dto: RegisterDto) {
    const exists = await this.userService.findByEmail(dto.email);
    if (exists) throw new EmailAlreadyExistsException();

    const passwordHash = await hashPassword(dto.password);
    const user = await this.userService.create({
      ...dto,
      password: passwordHash,
      isEmailVerified: false,
    });

    // Tạo và gửi OTP
    await this.sendVerificationOtp(user.email);

    return {
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.',
      email: user.email,
    };
  }

  /** Gửi OTP xác thực email */
  async sendVerificationOtp(email: string): Promise<void> {
    const otp = this.generateOtp();
    await this.otpRepository.createOtp(email, otp, 'verify-email');
    await this.mailService.sendOtpEmail(email, otp);
  }

  /** Xác thực email bằng OTP (hoặc mã bypass 000000 khi dev) */
  async verifyEmail(dto: VerifyEmailDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new BadRequestException('Không tìm thấy tài khoản với email này');
    }

    if (this.isOtpBypassCode(dto.otp)) {
      if (!this.isOtpBypassAllowed()) {
        throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
      }
      this.logger.warn(`OTP bypass (000000) cho ${dto.email}`);
    } else {
      const record = await this.otpRepository.findValid(dto.email, dto.otp, 'verify-email');
      if (!record) {
        throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
      }
      await this.otpRepository.markUsed(String(record._id));
    }

    if (!user.isEmailVerified) {
      await this.userService.updateByEmail(dto.email, { isEmailVerified: true });
    }

    const verifiedUser = await this.userService.findByEmail(dto.email);
    if (!verifiedUser) throw new UnauthorizedException();

    return this.generateTokens(verifiedUser);
  }

  private isOtpBypassCode(otp: string): boolean {
    return otp === OTP_BYPASS_CODE;
  }

  /** Chỉ cho bypass ở dev hoặc khi bật ALLOW_OTP_BYPASS=true */
  private isOtpBypassAllowed(): boolean {
    if (this.config.get<string>('ALLOW_OTP_BYPASS') === 'true') return true;
    return this.config.get<string>('NODE_ENV', 'development') !== 'production';
  }

  /** Đăng nhập bằng email + password */
  async login(dto: LoginDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) throw new InvalidCredentialsException();

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) throw new InvalidCredentialsException();

    if (user.isBanned) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    if (!user.isEmailVerified) {
      // Gửi lại OTP nếu chưa xác thực
      await this.sendVerificationOtp(user.email);
      throw new BadRequestException('Email chưa được xác thực. Chúng tôi đã gửi lại mã OTP.');
    }

    // Cập nhật lastSeenAt
    await this.userService.updateById(String(user._id), { lastSeenAt: new Date() });

    return this.generateTokens(user);
  }

  /** Đăng nhập qua OAuth (Google / Facebook) */
  async oauthLogin(oauthUser: {
    email: string;
    name: string;
    avatar?: string;
    provider: string;
  }) {
    let user = await this.userService.findByEmail(oauthUser.email);
    if (!user) {
      user = await this.userService.create({
        email: oauthUser.email,
        displayName: oauthUser.name,
        avatar: oauthUser.avatar,
        provider: oauthUser.provider as any,
        password: '',
        isEmailVerified: true, // OAuth đã xác thực email
      });
    }

    if (user.isBanned) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    await this.userService.updateById(String(user._id), { lastSeenAt: new Date() });
    return this.generateTokens(user);
  }

  /** Làm mới access token bằng refresh token */
  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string; email: string }>(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.userService.findById(payload.sub);
      if (!user) throw new UnauthorizedException();

      if (user.isBanned) throw new ForbiddenException('Tài khoản đã bị khóa');

      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ hoặc đã hết hạn');
    }
  }

  /** Tạo cặp access + refresh token */
  private generateTokens(user: UserDocument) {
    const payload = { sub: String(user._id), email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN', '15m'),
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: String(user._id),
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  /** Tạo mã OTP 6 số ngẫu nhiên */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
