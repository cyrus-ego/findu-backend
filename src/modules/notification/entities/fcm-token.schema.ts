import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FcmTokenDocument = FcmToken & Document;

export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
  MACOS = 'macos',
  WINDOWS = 'windows',
  LINUX = 'linux',
  UNKNOWN = 'unknown',
}

@Schema({ timestamps: true })
export class FcmToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  token: string;

  @Prop({ type: String, enum: DevicePlatform, default: DevicePlatform.UNKNOWN })
  platform: DevicePlatform;

  @Prop({ default: '' })
  deviceId: string;

  @Prop({ default: Date.now })
  lastSeenAt: Date;

  @Prop({ default: null })
  disabledAt: Date;
}

export const FcmTokenSchema = SchemaFactory.createForClass(FcmToken);
FcmTokenSchema.index({ userId: 1, token: 1 }, { unique: true });
