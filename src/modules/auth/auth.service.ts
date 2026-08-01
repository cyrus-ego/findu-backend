import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHmac, createPublicKey, verify as verifySignature } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
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
import { toAuthTokenResponse } from './dto/auth-response.dto';
import { isOAuthClientConfigured } from './oauth.util';
import { FacebookTokenType } from './dto/facebook-auth.dto';

/** Mã bypass tạm thời, chỉ dùng khi dev hoặc bật ALLOW_OTP_BYPASS=true */
const OTP_BYPASS_CODE = '000000';

interface FacebookJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
  [key: string]: unknown;
}

interface FacebookLimitedClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  user_id?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  email?: string;
  name?: string;
  picture?: string | { data?: { url?: string } };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private facebookJwksCache?: { keys: FacebookJwk[]; expiresAt: number };

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
    if (exists) {
      if (exists.isEmailVerified) {
        throw new EmailAlreadyExistsException();
      }
      // Email đã đăng ký nhưng chưa xác thực → cập nhật lại thông tin
      const passwordHash = await hashPassword(dto.password);
      await this.userService.updateByEmail(dto.email, {
        ...dto,
        password: passwordHash,
        isEmailVerified: false,
      });
      await this.sendVerificationOtp(dto.email);
      return {
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.',
        email: dto.email,
      };
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.userService.create({
      ...dto,
      password: passwordHash,
      isEmailVerified: false,
    });

    await this.sendVerificationOtp(user.email);

    return {
      message: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.',
      email: user.email,
    };
  }

  /** Gửi OTP xác thực email — lưu OTP trước; gửi mail không chặn HTTP response */
  async sendVerificationOtp(email: string): Promise<void> {
    const otp = this.generateOtp();
    await this.otpRepository.createOtp(email, otp, 'verify-email');
    void this.mailService.sendOtpEmail(email, otp).catch((err) => {
      this.logger.warn(`Gửi email OTP thất bại cho ${email}: ${String(err)}`);
    });
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

    // User đăng ký qua OAuth không có password — không cho login bằng email/pass
    if (!user.password) throw new InvalidCredentialsException();

    const valid = await comparePassword(dto.password, user.password);
    if (!valid) throw new InvalidCredentialsException();

    if (user.isBanned) {
      throw new ForbiddenException('Tài khoản của bạn đã bị khóa');
    }

    if (!user.isEmailVerified) {
      // Gửi lại OTP nếu chưa xác thực — lỗi gửi mail không nên block login flow
      try {
        await this.sendVerificationOtp(user.email);
      } catch (err) {
        this.logger.warn(`Không thể gửi lại OTP cho ${user.email}: ${String(err)}`);
      }
      throw new BadRequestException('Email chưa được xác thực. Chúng tôi đã gửi lại mã OTP.');
    }

    // Cập nhật lastSeenAt
    await this.userService.updateById(String(user._id), { lastSeenAt: new Date() });

    return this.generateTokens(user);
  }

  /** Đăng nhập Facebook bằng access token hoặc Limited Login OIDC token. */
  async facebookLoginWithToken(
    token: string,
    tokenType: FacebookTokenType = FacebookTokenType.CLASSIC,
    nonce?: string,
  ) {
    const facebookAppId = this.config.get<string>('FACEBOOK_APP_ID')?.trim();
    if (!facebookAppId || !isOAuthClientConfigured(facebookAppId)) {
      throw new BadRequestException('Facebook OAuth chưa được cấu hình trên server');
    }

    if (tokenType === FacebookTokenType.LIMITED) {
      if (!nonce?.trim()) {
        throw new BadRequestException('nonce là bắt buộc khi dùng Facebook Limited Login');
      }
      return this.facebookLoginWithLimitedToken(token, facebookAppId, nonce);
    }

    const facebookAppSecret = this.config.get<string>('FACEBOOK_APP_SECRET')?.trim();
    if (!facebookAppSecret || !isOAuthClientConfigured(facebookAppSecret)) {
      throw new BadRequestException('Facebook OAuth chưa được cấu hình trên server');
    }

    return this.facebookLoginWithClassicAccessToken(token, facebookAppId, facebookAppSecret);
  }

  private async facebookLoginWithClassicAccessToken(
    accessToken: string,
    facebookAppId: string,
    facebookAppSecret: string,
  ) {
    await this.verifyFacebookAccessToken(accessToken, facebookAppId, facebookAppSecret);

    let fbUser: {
      id?: string;
      name?: string;
      email?: string;
      picture?: { data?: { url?: string } };
    };

    try {
      const params = new URLSearchParams({
        fields: 'id,name,email,picture',
        access_token: accessToken,
        appsecret_proof: this.generateAppSecretProof(accessToken, facebookAppSecret),
      });
      const res = await fetch(`https://graph.facebook.com/me?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Facebook Graph API error: ${body}`);
        throw new UnauthorizedException('Facebook access token không hợp lệ hoặc đã hết hạn');
      }
      fbUser = await res.json();
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`Facebook token verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Không thể xác thực Facebook access token');
    }

    if (!fbUser.id) {
      throw new UnauthorizedException('Không lấy được thông tin từ tài khoản Facebook');
    }

    return this.oauthLogin({
      email: fbUser.email || `fb_${fbUser.id}@strangerconfide.local`,
      name: fbUser.name || fbUser.id,
      avatar: fbUser.picture?.data?.url,
      provider: 'facebook',
      providerId: fbUser.id,
    });
  }

  /**
   * Limited Login trả về OIDC token thay vì Graph API access token. Token được
   * xác minh bằng JWKS của Facebook, audience của app và nonce của login request.
   */
  private async facebookLoginWithLimitedToken(token: string, appId: string, nonce: string) {
    const claims = await this.verifyFacebookLimitedToken(token, appId, nonce);
    const facebookId = claims.sub || claims.user_id;
    if (!facebookId) {
      throw new UnauthorizedException('Không lấy được thông tin từ tài khoản Facebook');
    }

    const avatar = typeof claims.picture === 'string' ? claims.picture : claims.picture?.data?.url;

    return this.oauthLogin({
      email: claims.email || `fb_${facebookId}@strangerconfide.local`,
      name: claims.name || facebookId,
      avatar,
      provider: 'facebook',
      providerId: facebookId,
    });
  }

  private async verifyFacebookLimitedToken(
    token: string,
    appId: string,
    expectedNonce: string,
  ): Promise<FacebookLimitedClaims> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Malformed JWT');

      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as {
        alg?: string;
        kid?: string;
      };
      const claims = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8'),
      ) as FacebookLimitedClaims;

      if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported JWT header');

      const jwk = await this.getFacebookSigningKey(header.kid);
      const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
      const signatureValid = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8'),
        publicKey,
        Buffer.from(parts[2], 'base64url'),
      );
      if (!signatureValid) throw new Error('Invalid JWT signature');

      const now = Math.floor(Date.now() / 1000);
      const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== 'https://www.facebook.com') throw new Error('Invalid issuer');
      if (!audiences.includes(appId)) throw new Error('Invalid audience');
      if (typeof claims.exp !== 'number' || claims.exp <= now) throw new Error('Expired token');
      if (typeof claims.iat !== 'number' || claims.iat > now + 300) {
        throw new Error('Invalid issued-at time');
      }
      if (!claims.nonce || claims.nonce !== expectedNonce) throw new Error('Invalid nonce');

      return claims;
    } catch (err) {
      this.logger.warn(`Facebook Limited Login verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Facebook Limited Login token không hợp lệ hoặc đã hết hạn');
    }
  }

  private async getFacebookSigningKey(kid: string): Promise<FacebookJwk> {
    let keys = await this.getFacebookJwks();
    let key = keys.find((candidate) => candidate.kid === kid);

    // Facebook có thể vừa rotate key; refresh ngay một lần nếu cache chưa có kid.
    if (!key) {
      this.facebookJwksCache = undefined;
      keys = await this.getFacebookJwks();
      key = keys.find((candidate) => candidate.kid === kid);
    }

    if (!key || key.kty !== 'RSA') throw new Error('Facebook signing key not found');
    return key;
  }

  private async getFacebookJwks(): Promise<FacebookJwk[]> {
    if (this.facebookJwksCache && this.facebookJwksCache.expiresAt > Date.now()) {
      return this.facebookJwksCache.keys;
    }

    const res = await fetch('https://www.facebook.com/.well-known/oauth/openid/jwks/');
    if (!res.ok) throw new Error(`Facebook JWKS request failed (${res.status})`);

    const payload = (await res.json()) as { keys?: FacebookJwk[] };
    if (!Array.isArray(payload.keys) || payload.keys.length === 0) {
      throw new Error('Facebook JWKS response is empty');
    }

    this.facebookJwksCache = {
      keys: payload.keys,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };
    return payload.keys;
  }

  private async verifyFacebookAccessToken(
    accessToken: string,
    appId: string,
    appSecret: string,
  ): Promise<void> {
    const params = new URLSearchParams({
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    });

    try {
      const res = await fetch(`https://graph.facebook.com/debug_token?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        this.logger.warn(`Facebook debug_token error: ${body}`);
        throw new UnauthorizedException('Facebook access token không hợp lệ hoặc đã hết hạn');
      }

      const payload = (await res.json()) as {
        data?: { app_id?: string; is_valid?: boolean; type?: string };
      };
      const tokenInfo = payload.data;
      if (!tokenInfo?.is_valid || tokenInfo.app_id !== appId || tokenInfo.type !== 'USER') {
        throw new UnauthorizedException('Facebook access token không hợp lệ hoặc đã hết hạn');
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`Facebook token debug failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Không thể xác thực Facebook access token');
    }
  }

  private generateAppSecretProof(accessToken: string, appSecret: string): string {
    return createHmac('sha256', appSecret).update(accessToken).digest('hex');
  }

  /** Đăng nhập Google bằng idToken (mobile / native SDK) */
  async googleLoginWithIdToken(idToken: string) {
    const clientIds = this.getGoogleClientIds();
    if (clientIds.length === 0) {
      throw new BadRequestException('Google OAuth chưa được cấu hình trên server');
    }

    const client = new OAuth2Client();
    let payload:
      | {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        }
      | undefined;

    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: clientIds,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google idToken verify failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Google ID token không hợp lệ hoặc đã hết hạn');
    }

    if (!payload?.email) {
      throw new UnauthorizedException('Không lấy được email từ tài khoản Google');
    }

    if (payload.email_verified === false) {
      throw new UnauthorizedException('Email Google chưa được xác thực');
    }

    return this.oauthLogin({
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      avatar: payload.picture,
      provider: 'google',
      providerId: payload.sub,
    });
  }

  private getGoogleClientIds(): string[] {
    const ids = new Set<string>();
    const primary = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (primary) ids.add(primary);

    const extra = this.config.get<string>('GOOGLE_CLIENT_IDS', '');
    for (const id of extra
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      ids.add(id);
    }

    return [...ids];
  }

  /** Đăng nhập qua OAuth (Google / Facebook) */
  async oauthLogin(oauthUser: {
    email: string;
    name: string;
    avatar?: string;
    provider: string;
    providerId?: string;
  }) {
    let user =
      oauthUser.provider === 'facebook' && oauthUser.providerId
        ? await this.userService.findByFacebookId(oauthUser.providerId)
        : null;
    user ??= await this.userService.findByEmail(oauthUser.email);

    if (!user) {
      user = await this.userService.create({
        email: oauthUser.email,
        displayName: oauthUser.name,
        avatar: oauthUser.avatar,
        provider: oauthUser.provider as any,
        facebookId: oauthUser.provider === 'facebook' ? oauthUser.providerId : undefined,
        password: '',
        isEmailVerified: true, // OAuth đã xác thực email
      });
    } else if (oauthUser.provider === 'facebook' && oauthUser.providerId && !user.facebookId) {
      const linked = await this.userService.updateById(String(user._id), {
        facebookId: oauthUser.providerId,
      });
      if (linked) user = linked;
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

    return toAuthTokenResponse(user, { accessToken, refreshToken });
  }

  /** Tạo mã OTP 6 số ngẫu nhiên */
  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
