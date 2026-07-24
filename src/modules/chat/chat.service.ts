import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument, MessageType } from './entities/message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { ModerationService } from '../moderation/moderation.service';
import { ChatMessageDto, toChatMessagePayload } from './dto/chat-response.dto';
import { ChatErrorCode } from './chat-error-code';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Message.name) private readonly messageModel: Model<MessageDocument>,
    private readonly moderationService: ModerationService,
  ) {}

  async saveMessage(
    senderId: string,
    senderAlias: string,
    dto: SendMessageDto,
    imageMimetype?: string,
  ): Promise<MessageDocument> {
    if (dto.type === MessageType.TEXT && dto.content) {
      const result = this.moderationService.moderateMessage(senderId, dto.roomId, dto.content);
      if (result.isViolation) {
        throw new BadRequestException({
          code:
            result.severity === 'block'
              ? ChatErrorCode.SPAM_DETECTED
              : ChatErrorCode.MODERATION_BLOCKED,
          message: result.reason || 'Tin nhắn không phù hợp',
        });
      }
    }

    if (dto.type === MessageType.IMAGE && dto.imageUrl) {
      const mime = imageMimetype || 'image/jpeg';
      const result = await this.moderationService.checkImage(dto.imageUrl, mime);
      if (result.isViolation) {
        throw new BadRequestException({
          code: ChatErrorCode.MODERATION_BLOCKED,
          message: result.reason || 'Ảnh không phù hợp',
        });
      }
    }

    return this.messageModel.create({
      roomId: dto.roomId,
      senderId,
      senderAlias,
      type: dto.type,
      content: dto.content || '',
      imageUrl: dto.imageUrl || '',
      isModerated: true,
    });
  }

  /** Tin nhắn tạm trong phòng (xóa khi đóng phòng) — dùng khi reconnect */
  async getActiveRoomMessages(roomId: string): Promise<MessageDocument[]> {
    const messages = await this.messageModel
      .find({ roomId, type: { $ne: MessageType.SYSTEM } })
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    return messages.reverse();
  }

  async deleteRoomMessages(roomId: string): Promise<void> {
    await this.messageModel.deleteMany({ roomId }).exec();
  }

  toMessagePayload(
    message: MessageDocument,
    senderAlias: string,
    imageUrlOverride?: string,
  ): ChatMessageDto {
    return toChatMessagePayload(message, senderAlias, imageUrlOverride);
  }
}
