import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FacebookAuthDto {
  @ApiProperty({
    description: 'Access token từ Facebook Login SDK (Android/iOS)',
    example: 'EAAC...',
  })
  @IsString()
  @IsNotEmpty({ message: 'accessToken không được để trống' })
  accessToken: string;
}
