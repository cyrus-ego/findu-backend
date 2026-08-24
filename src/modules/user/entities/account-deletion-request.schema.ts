import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AccountDeletionRequestDocument = AccountDeletionRequest & Document;

export enum AccountDeletionRequestStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class AccountDeletionRequest {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Snapshot để đội vận hành vẫn xác định được yêu cầu sau khi tài khoản bị xóa. */
  @Prop({ required: true, lowercase: true })
  email: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({
    type: String,
    enum: AccountDeletionRequestStatus,
    default: AccountDeletionRequestStatus.PENDING,
    index: true,
  })
  status: AccountDeletionRequestStatus;

  @Prop({ required: true, default: Date.now })
  requestedAt: Date;

  /** Hạn hoàn tất công khai với người dùng: tối đa 30 ngày từ lúc gửi. */
  @Prop({ required: true })
  deletionDueAt: Date;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;

  /** Đặt khi hoàn tất; TTL sẽ xóa bản ghi kiểm toán sau thời hạn lưu giữ. */
  @Prop({ type: Date, default: null })
  purgeAt: Date | null;
}

export const AccountDeletionRequestSchema = SchemaFactory.createForClass(AccountDeletionRequest);

AccountDeletionRequestSchema.index(
  { userId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: AccountDeletionRequestStatus.PENDING },
    name: 'unique_pending_account_deletion_request',
  },
);
AccountDeletionRequestSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });
