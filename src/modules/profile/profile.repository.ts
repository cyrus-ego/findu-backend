import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Profile, ProfileDocument } from './entities/profile.schema';

@Injectable()
export class ProfileRepository {
  constructor(
    @InjectModel(Profile.name) private readonly profileModel: Model<ProfileDocument>,
  ) {}

  async findByUserId(userId: string): Promise<ProfileDocument | null> {
    return this.profileModel.findOne({ userId }).exec();
  }

  async upsert(userId: string, data: Partial<Profile>): Promise<ProfileDocument> {
    return this.profileModel
      .findOneAndUpdate({ userId }, { ...data, userId }, { new: true, upsert: true })
      .exec() as Promise<ProfileDocument>;
  }
}
