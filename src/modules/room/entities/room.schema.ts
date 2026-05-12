import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

export enum RoomStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class Room {
  @Prop({ required: true, unique: true })
  roomId: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], required: true })
  participants: Types.ObjectId[];

  /** Nickname ẩn danh cho từng participant */
  @Prop({ type: Map, of: String, default: {} })
  anonymousNames: Map<string, string>;

  /** Avatar tạm cho từng participant */
  @Prop({ type: Map, of: String, default: {} })
  anonymousAvatars: Map<string, string>;

  @Prop({ type: String, enum: RoomStatus, default: RoomStatus.ACTIVE })
  status: RoomStatus;

  @Prop({ default: null })
  closedAt: Date;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
