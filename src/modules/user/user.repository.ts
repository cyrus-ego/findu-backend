import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './entities/user.schema';

@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private readonly userModel: Model<UserDocument>) {}

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateById(id: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, data, { new: true }).exec();
  }

  /** Cập nhật user theo email (dùng khi xác thực OTP) */
  async updateByEmail(email: string, data: Partial<User>): Promise<UserDocument | null> {
    return this.userModel
      .findOneAndUpdate({ email: email.toLowerCase() }, data, { new: true })
      .exec();
  }

  async ban(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(id, { isBanned: true, bannedAt: new Date() }, { new: true })
      .exec();
  }
}
