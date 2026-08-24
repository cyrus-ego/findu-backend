import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountDeletionRequest,
  AccountDeletionRequestDocument,
  AccountDeletionRequestStatus,
} from './entities/account-deletion-request.schema';

@Injectable()
export class AccountDeletionRequestRepository {
  constructor(
    @InjectModel(AccountDeletionRequest.name)
    private readonly requestModel: Model<AccountDeletionRequestDocument>,
  ) {}

  findPendingByUserId(userId: string): Promise<AccountDeletionRequestDocument | null> {
    return this.requestModel
      .findOne({ userId, status: AccountDeletionRequestStatus.PENDING })
      .exec();
  }

  findLatestByUserId(userId: string): Promise<AccountDeletionRequestDocument | null> {
    return this.requestModel.findOne({ userId }).sort({ requestedAt: -1 }).exec();
  }

  async createPending(input: {
    userId: string;
    email: string;
    displayName: string;
    requestedAt: Date;
    deletionDueAt: Date;
  }): Promise<AccountDeletionRequestDocument> {
    try {
      return await this.requestModel.create({
        ...input,
        userId: new Types.ObjectId(input.userId),
        status: AccountDeletionRequestStatus.PENDING,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;

      const existing = await this.findPendingByUserId(input.userId);
      if (existing) return existing;
      throw error;
    }
  }
}
