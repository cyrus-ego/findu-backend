import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument, MessageType } from './entities/message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { ModerationService } from '../moderation/moderation.service';
import { ChatMessageDto, toChatMessagePayload } from './dto/chat-response.dto';

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
        throw new BadRequestException(result.reason);
      }
    }

    if (dto.type === MessageType.IMAGE && dto.imageUrl) {
      const mime = imageMimetype || 'image/jpeg';
      const result = await this.moderationService.checkImage(dto.imageUrl, mime);
      if (result.isViolation) {
        throw new BadRequestException(result.reason);
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
    return this.messageModel
      .find({ roomId, type: { $ne: MessageType.SYSTEM } })
      .sort({ createdAt: 1 })
      .limit(100)
      .exec();
  }

  /** REST API cho mobile — có phân trang */
  async getRoomMessages(
    roomId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ items: MessageDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.messageModel
        .find({ roomId, type: { $ne: MessageType.SYSTEM } })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.messageModel.countDocuments({ roomId, type: { $ne: MessageType.SYSTEM } }).exec(),
    ]);
    return { items, total };
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
