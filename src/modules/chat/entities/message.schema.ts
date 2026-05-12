import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MessageDocument = Message & Document;

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  SYSTEM = 'system',
}

@Schema({ timestamps: true })
export class Message {
  @Prop({ required: true })
  roomId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  senderId: Types.ObjectId;

  /** Nickname ẩn danh lúc gửi */
  @Prop({ required: true })
  senderAlias: string;

  @Prop({ type: String, enum: MessageType, default: MessageType.TEXT })
  type: MessageType;

  @Prop({ default: '' })
  content: string;

  @Prop({ default: '' })
  imageUrl: string;

  @Prop({ default: false })
  isModerated: boolean;
}

export const MessageSchema = SchemaFactory.createForClass(Message);
// Index để truy vấn nhanh theo roomId
MessageSchema.index({ roomId: 1, createdAt: 1 });
