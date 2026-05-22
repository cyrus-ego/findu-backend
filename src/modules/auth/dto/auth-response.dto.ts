import { ApiProperty } from '@nestjs/swagger';
import { UserDocument } from '../../user/entities/user.schema';

export class AuthUserDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012345' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Stranger' })
  displayName: string;

  @ApiProperty({ example: '' })
  avatar: string;

  @ApiProperty({ example: 'user', enum: ['user', 'vip', 'admin'] })
  role: string;

  @ApiProperty({ example: true })
  isEmailVerified: boolean;
}

export class AuthTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT access token — header Authorization: Bearer <token>',
  })
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token — POST /api/auth/refresh',
  })
  refreshToken: string;

  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class RegisterResponseDto {
  @ApiProperty({ example: 'Đăng ký thành công. Vui lòng kiểm tra email để xác thực.' })
  message: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;
}

export function toAuthUser(user: UserDocument): AuthUserDto {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar || '',
    role: user.role,
    isEmailVerified: user.isEmailVerified,
  };
}

export function toAuthTokenResponse(
  user: UserDocument,
  tokens: { accessToken: string; refreshToken: string },
): AuthTokenResponseDto {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: toAuthUser(user),
  };
}
