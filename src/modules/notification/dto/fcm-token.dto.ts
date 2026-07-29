import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { DevicePlatform } from '../entities/fcm-token.schema';

export class RegisterFcmTokenDto {
  @ApiProperty({
    description: 'FCM registration token của thiết bị hiện tại',
    example: 'fcm-token-from-firebase-messaging',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;

  @ApiPropertyOptional({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsOptional()
  @IsEnum(DevicePlatform)
  platform?: DevicePlatform;

  @ApiPropertyOptional({ example: 'pixel-8-pro', maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;
}

export class UnregisterFcmTokenDto {
  @ApiProperty({
    description: 'FCM registration token cần gỡ khỏi user hiện tại',
    example: 'fcm-token-from-firebase-messaging',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token: string;
}
