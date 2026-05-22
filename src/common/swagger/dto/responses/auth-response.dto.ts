import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
    description: 'JWT access token — dùng header Authorization: Bearer <token>',
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
