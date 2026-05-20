import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OtpDocument = Otp & Document;

@Schema({ timestamps: true })
export class Otp {
  @Prop({ required: true, lowercase: true })
  email: string;

  /** Mã OTP 6 số */
  @Prop({ required: true })
  code: string;

  /** Loại OTP: verify-email hoặc reset-password */
  @Prop({ required: true, enum: ['verify-email', 'reset-password'], default: 'verify-email' })
  type: string;

  /** Thời điểm hết hạn (10 phút) */
  @Prop({ required: true })
  expiresAt: Date;

  /** Đã dùng chưa */
  @Prop({ default: false })
  used: boolean;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// TTL index: MongoDB tự xóa document sau khi hết hạn
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
