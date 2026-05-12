import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum AuthProvider {
  LOCAL = 'local',
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

export enum UserRole {
  USER = 'user',
  VIP = 'vip',
  ADMIN = 'admin',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop({ default: '' })
  password: string;

  @Prop({ required: true })
  displayName: string;

  @Prop({ default: '' })
  avatar: string;

  @Prop({ type: String, enum: AuthProvider, default: AuthProvider.LOCAL })
  provider: AuthProvider;

  @Prop({ type: String, enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: false })
  isBanned: boolean;

  @Prop({ default: null })
  bannedAt: Date;

  @Prop({ default: null })
  lastSeenAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
