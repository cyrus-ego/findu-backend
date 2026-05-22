import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012345' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Stranger' })
  displayName: string;

  @ApiProperty({ example: 'http://localhost:3000/uploads/avatars/abc.jpg' })
  avatar: string;

  @ApiProperty({ example: 'user', enum: ['user', 'vip', 'admin'] })
  role: string;

  @ApiProperty({ example: 'local', enum: ['local', 'google', 'facebook'] })
  provider: string;

  @ApiProperty({ example: true })
  isEmailVerified: boolean;

  @ApiPropertyOptional({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  updatedAt?: string;
}
