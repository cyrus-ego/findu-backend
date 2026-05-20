import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Profile, ProfileDocument } from './entities/profile.schema';

@Injectable()
export class ProfileRepository {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<ProfileDocument>,
  ) {}

  async findByUserId(userId: string): Promise<ProfileDocument | null> {
    return this.profileModel.findOne({ userId: new Types.ObjectId(userId) }).exec();
  }

  async create(userId: string, data: Partial<Profile>): Promise<ProfileDocument> {
    return this.profileModel.create({
      ...data,
      userId: new Types.ObjectId(userId),
    });
  }

  async updateByUserId(userId: string, data: Partial<Profile>): Promise<ProfileDocument | null> {
    return this.profileModel
      .findOneAndUpdate({ userId: new Types.ObjectId(userId) }, data, { new: true })
      .exec();
  }

  async upsert(userId: string, data: Partial<Profile>): Promise<ProfileDocument> {
    return this.profileModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { ...data, userId: new Types.ObjectId(userId) },
        { new: true, upsert: true },
      )
      .exec() as Promise<ProfileDocument>;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const result = await this.profileModel
      .deleteOne({ userId: new Types.ObjectId(userId) })
      .exec();
    return result.deletedCount > 0;
  }
}
