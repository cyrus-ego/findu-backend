import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProfileDocument = Profile & Document;

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

export enum ChatPreference {
  OPPOSITE = 'opposite',
  SAME = 'same',
  ANY = 'any',
}

@Schema({ timestamps: true })
export class Profile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: Gender })
  gender: Gender;

  @Prop({ min: 13, max: 99 })
  age: number;

  @Prop({ default: '' })
  bio: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ type: String, enum: ChatPreference, default: ChatPreference.ANY })
  chatPreference: ChatPreference;

  @Prop({ type: String, enum: Gender })
  preferredGender: Gender;

  // Giả lập VIP
  @Prop({ default: false })
  isVip: boolean;

  @Prop({ default: null })
  vipExpiresAt: Date;
}

export const ProfileSchema = SchemaFactory.createForClass(Profile);
