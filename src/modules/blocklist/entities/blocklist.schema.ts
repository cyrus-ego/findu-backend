import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BlocklistDocument = Blocklist & Document;

@Schema({ timestamps: true })
export class Blocklist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  blockedId: Types.ObjectId;
}

export const BlocklistSchema = SchemaFactory.createForClass(Blocklist);
BlocklistSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });
