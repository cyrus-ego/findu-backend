import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MessageType } from '../entities/message.schema';

export class SendMessageDto {
  @IsString()
  roomId: string;

  @IsEnum(MessageType)
  type: MessageType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  content?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;
}
