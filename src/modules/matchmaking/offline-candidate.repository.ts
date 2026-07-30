import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Profile,
  ProfileDocument,
  Gender,
  ChatPreference,
} from '../profile/entities/profile.schema';
import { User, UserDocument } from '../user/entities/user.schema';
import { FcmToken, FcmTokenDocument } from '../notification/entities/fcm-token.schema';
import { Room, RoomDocument } from '../room/entities/room.schema';

export interface OfflineCandidate {
  userId: string;
  gender: Gender;
  preference: ChatPreference;
}

interface FindOfflineCandidatesInput {
  requesterId: string;
  requesterGender: Gender;
  requesterPreference: ChatPreference;
  excludedUserIds: string[];
  limit?: number;
}

@Injectable()
export class OfflineCandidateRepository {
  constructor(
    @InjectModel(Profile.name)
    private readonly profileModel: Model<ProfileDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(FcmToken.name)
    private readonly fcmTokenModel: Model<FcmTokenDocument>,
    @InjectModel(Room.name)
    private readonly roomModel: Model<RoomDocument>,
  ) {}

  async findEligible(input: FindOfflineCandidatesInput): Promise<OfflineCandidate[]> {
    const excludedIds = new Set([input.requesterId, ...input.excludedUserIds]);
    const excludedObjectIds = Array.from(excludedIds)
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));

    const rows = await this.profileModel
      .aggregate<{
        userId: Types.ObjectId;
        gender: Gender;
        chatPreference: ChatPreference;
      }>([
        {
          $match: {
            userId: { $nin: excludedObjectIds },
            gender: input.requesterPreference,
            chatPreference: input.requesterGender,
            offlineMatchingEnabled: { $ne: false },
          },
        },
        {
          $lookup: {
            from: this.userModel.collection.name,
            let: { candidateUserId: '$userId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$_id', '$$candidateUserId'] },
                  isBanned: { $ne: true },
                  isEmailVerified: true,
                },
              },
              { $limit: 1 },
            ],
            as: 'eligibleUser',
          },
        },
        { $match: { 'eligibleUser.0': { $exists: true } } },
        {
          $lookup: {
            from: this.fcmTokenModel.collection.name,
            let: { candidateUserId: '$userId' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$userId', '$$candidateUserId'] },
                  disabledAt: null,
                },
              },
              { $limit: 1 },
            ],
            as: 'activeTokens',
          },
        },
        { $match: { 'activeTokens.0': { $exists: true } } },
        {
          $lookup: {
            from: this.roomModel.collection.name,
            let: { candidateUserId: '$userId' },
            pipeline: [
              {
                $match: {
                  status: 'active',
                  $expr: { $in: ['$$candidateUserId', '$participants'] },
                },
              },
              { $limit: 1 },
            ],
            as: 'activeRooms',
          },
        },
        { $match: { 'activeRooms.0': { $exists: false } } },
        { $sample: { size: input.limit ?? 20 } },
        { $project: { userId: 1, gender: 1, chatPreference: 1 } },
      ])
      .exec();

    return rows.map((row) => ({
      userId: String(row.userId),
      gender: row.gender,
      preference: row.chatPreference,
    }));
  }
}
