import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument, MessageType } from './entities/message.schema';
import { SendMessageDto } from './dto/send-message.dto';
import { ModerationService } from '../moderation/moderation.service';

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

  async deleteRoomMessages(roomId: string): Promise<void> {
    await this.messageModel.deleteMany({ roomId }).exec();
  }

  toMessagePayload(message: MessageDocument, senderAlias: string) {
    return {
      id: String(message._id),
      senderAlias,
      type: message.type,
      content: message.content,
      imageUrl: message.imageUrl,
      createdAt: (message as any).createdAt,
    };
  }
}
