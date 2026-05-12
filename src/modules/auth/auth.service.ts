import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user/user.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { comparePassword, hashPassword } from '../../common/utils/hash.util';
import {
  InvalidCredentialsException,
  EmailAlreadyExistsException,
} from '../../common/exceptions/app.exceptions';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.userService.findByEmail(dto.email);
    if (exists) throw new EmailAlreadyExistsException();

    const passwordHash = await hashPassword(dto.password);
    const user = await this.userService.create({ ...dto, password: passwordHash });

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) throw new InvalidCredentialsException();

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) throw new InvalidCredentialsException();

    return this.generateTokens(user);
  }

  async oauthLogin(oauthUser: { email: string; name: string; avatar?: string; provider: string }) {
    let user = await this.userService.findByEmail(oauthUser.email);
    if (!user) {
      user = await this.userService.create({
        email: oauthUser.email,
        displayName: oauthUser.name,
        avatar: oauthUser.avatar,
        provider: oauthUser.provider as any,
        password: '',
        isEmailVerified: true,
      });
    }
    return this.generateTokens(user);
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.userService.findById(payload.sub);
      if (!user) throw new UnauthorizedException();
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
  }

  private generateTokens(user: any) {
    const payload = { sub: user._id, email: user.email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d'),
      }),
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
      },
    };
  }
}
