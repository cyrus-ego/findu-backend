import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileUserSummaryDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012345' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'Stranger#4821' })
  displayName: string;

  @ApiProperty({ example: 'https://api.dicebear.com/7.x/avataaars/svg?seed=abc' })
  avatar: string;

  @ApiProperty({ example: 'user', enum: ['user', 'vip', 'admin'] })
  role: string;

  @ApiProperty({ example: true })
  isEmailVerified: boolean;
}

export class ProfileDataDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012346' })
  id: string;

  @ApiProperty({ example: 'male', enum: ['male', 'female', 'other'] })
  gender: string;

  @ApiProperty({ example: 22, minimum: 13, maximum: 99 })
  age: number;

  @ApiProperty({ example: 'Xin chào, mình thích nghe bạn tâm sự.' })
  bio: string;

  @ApiProperty({ example: 'http://localhost:3000/uploads/avatars/abc.jpg' })
  avatar: string;

  @ApiProperty({ example: 'any', enum: ['opposite', 'same', 'any'] })
  chatPreference: string;

  @ApiPropertyOptional({ example: 'female', enum: ['male', 'female', 'other'] })
  preferredGender?: string;

  @ApiProperty({ example: false })
  isVip: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  vipExpiresAt?: string | null;

  @ApiPropertyOptional({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  createdAt?: string;

  @ApiPropertyOptional({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  updatedAt?: string;
}

export class ProfileResponseDto {
  @ApiProperty({ type: ProfileUserSummaryDto })
  user: ProfileUserSummaryDto;

  @ApiProperty({ type: ProfileDataDto, nullable: true })
  profile: ProfileDataDto | null;

  @ApiProperty({
    example: true,
    description: 'true khi đã có gender + age — đủ điều kiện matchmaking',
  })
  isComplete: boolean;
}
