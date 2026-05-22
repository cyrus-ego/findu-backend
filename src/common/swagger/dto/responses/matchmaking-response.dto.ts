import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class QueueStatusResponseDto {
  @ApiProperty({ example: true })
  inQueue: boolean;

  @ApiProperty({ example: 2, description: 'Vị trí trong hàng (1 = sắp được ghép)' })
  position: number;

  @ApiProperty({ example: 5 })
  queueSize: number;

  @ApiProperty({ example: 45, description: 'Số giây đã chờ' })
  waitSeconds: number;

  @ApiProperty({ example: 255, description: 'Số giây còn lại trước timeout 5 phút' })
  expiresInSeconds: number;

  @ApiProperty({ example: 'any', enum: ['opposite', 'same', 'any'] })
  preference: string;

  @ApiPropertyOptional({ example: 'female', enum: ['male', 'female', 'other'] })
  preferredGender?: string;

  @ApiProperty({ example: false })
  timedOut: boolean;
}
