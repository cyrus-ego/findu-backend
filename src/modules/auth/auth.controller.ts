import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Rate limit: 5 request/phút để chống spam tài khoản
   */
  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/verify-email
   * Xác thực OTP gửi qua email
   * Rate limit: 10 lần/phút
   */
  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto);
  }

  /**
   * POST /auth/resend-otp
   * Gửi lại OTP xác thực
   * Rate limit: 3 lần/phút để chống spam email
   */
  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  async resendOtp(@Body() dto: ResendOtpDto) {
    await this.authService.sendVerificationOtp(dto.email);
    return { message: 'OTP đã được gửi lại. Kiểm tra hộp thư của bạn.' };
  }

  /**
   * POST /auth/login
   * Rate limit: 10 lần/phút chống brute force
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * POST /auth/refresh
   * Làm mới access token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  /**
   * GET /auth/me
   * Lấy thông tin user đang đăng nhập (protected)
   */
  @Get('me')
  getMe(@CurrentUser() user: UserDocument) {
    return {
      id: String(user._id),
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
    };
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleAuth() {
    // Passport redirect tự động đến Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const tokens = await this.authService.oauthLogin(req.user);
    // Redirect về frontend với tokens trong query string
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ─── Facebook OAuth ──────────────────────────────────────────────────────────

  @Public()
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  facebookAuth() {
    // Passport redirect tự động đến Facebook
  }

  @Public()
  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  async facebookCallback(@Req() req: any, @Res() res: Response) {
    const tokens = await this.authService.oauthLogin(req.user);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
    res.redirect(`${frontendUrl}/auth/callback?${params.toString()}`);
  }
}
