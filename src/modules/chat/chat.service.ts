import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Message, MessageDocument } from './entities/message.schema';
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
  ): Promise<MessageDocument> {
    // Kiểm duyệt nội dung trước khi lưu
    if (dto.content) {
      const result = await this.moderationService.checkText(dto.content);
      if (result.isViolation) {
        throw new Error(`Tin nhắn vi phạm: ${result.reason}`);
      }
    }

    return this.messageModel.create({
      roomId: dto.roomId,
      senderId,
      senderAlias,
      type: dto.type,
      content: dto.content || '',
      imageUrl: dto.imageUrl || '',
    });
  }

  async getMessages(roomId: string): Promise<MessageDocument[]> {
    return this.messageModel
      .find({ roomId })
      .sort({ createdAt: 1 })
      .limit(100)
      .exec();
  }

  /** Xóa toàn bộ tin nhắn khi phòng đóng (không lưu lịch sử) */
  async deleteRoomMessages(roomId: string): Promise<void> {
    await this.messageModel.deleteMany({ roomId }).exec();
  }
}
