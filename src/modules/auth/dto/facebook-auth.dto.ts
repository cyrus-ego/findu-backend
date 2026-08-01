import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export enum FacebookTokenType {
  CLASSIC = 'classic',
  LIMITED = 'limited',
}

export class FacebookAuthDto {
  @ApiProperty({
    description: 'Access token từ Facebook Login SDK (Android/iOS)',
    example: 'EAAC...',
  })
  @IsString()
  @IsNotEmpty({ message: 'accessToken không được để trống' })
  accessToken: string;

  @ApiPropertyOptional({
    description:
      '`classic` cho OAuth access token; `limited` cho Facebook Limited Login OIDC token trên iOS.',
    enum: FacebookTokenType,
    default: FacebookTokenType.CLASSIC,
  })
  @IsOptional()
  @IsEnum(FacebookTokenType)
  tokenType?: FacebookTokenType = FacebookTokenType.CLASSIC;

  @ApiPropertyOptional({
    description: 'Nonce đã gửi vào Facebook SDK; bắt buộc khi tokenType là `limited`.',
    example: 'a-random-single-use-nonce',
  })
  @ValidateIf((dto: FacebookAuthDto) => dto.tokenType === FacebookTokenType.LIMITED)
  @IsString()
  @IsNotEmpty({ message: 'nonce không được để trống khi dùng Facebook Limited Login' })
  nonce?: string;
}
