import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
      .sort({ createdAt: -1, _id: -1 })
      .limit(100)
      .exec();

    return messages.reverse();
  }

  async getRoomMessagesBefore(
    roomId: string,
    beforeMessageId?: string,
    limit = 50,
  ): Promise<{ messages: MessageDocument[]; hasMore: boolean }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const query: Record<string, unknown> = {
      roomId,
      type: { $ne: MessageType.SYSTEM },
    };

    if (beforeMessageId) {
      if (!Types.ObjectId.isValid(beforeMessageId)) {
        throw new BadRequestException('beforeMessageId không hợp lệ');
      }

      const cursor = await this.messageModel
        .findOne({ _id: beforeMessageId, roomId, type: { $ne: MessageType.SYSTEM } })
        .select({ _id: 1, createdAt: 1 })
        .exec();

      if (!cursor) {
        throw new BadRequestException('beforeMessageId không tồn tại trong phòng này');
      }

      const cursorCreatedAt = (cursor as any).createdAt;
      query.$or = [
        { createdAt: { $lt: cursorCreatedAt } },
        { createdAt: cursorCreatedAt, _id: { $lt: cursor._id } },
      ];
    }

    const messages = await this.messageModel
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(safeLimit + 1)
      .exec();

    const hasMore = messages.length > safeLimit;
    return {
      messages: messages.slice(0, safeLimit).reverse(),
      hasMore,
    };
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
