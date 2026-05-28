import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleAuthDto {
  @ApiProperty({
    description: 'ID token từ Google Sign-In SDK (Android/iOS) hoặc Google One Tap',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6...',
  })
  @IsString()
  @IsNotEmpty({ message: 'idToken không được để trống' })
  idToken: string;
}
