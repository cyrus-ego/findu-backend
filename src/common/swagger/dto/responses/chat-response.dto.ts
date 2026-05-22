import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChatMessageDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012348' })
  id: string;

  @ApiProperty({ example: 'Stranger#7482' })
  senderAlias: string;

  @ApiProperty({ example: 'text', enum: ['text', 'image', 'system'] })
  type: string;

  @ApiPropertyOptional({ example: 'Xin chào!' })
  content?: string;

  @ApiPropertyOptional({ example: 'http://localhost:3000/uploads/chat/abc.jpg' })
  imageUrl?: string;

  @ApiProperty({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  createdAt: string;
}

export class ChatImageUploadResponseDto {
  @ApiProperty({ type: ChatMessageDto })
  message: ChatMessageDto;
}
