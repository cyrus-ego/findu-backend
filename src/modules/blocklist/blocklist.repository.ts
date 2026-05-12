import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Blocklist, BlocklistDocument } from './entities/blocklist.schema';

@Injectable()
export class BlocklistRepository {
  constructor(
    @InjectModel(Blocklist.name) private readonly blocklistModel: Model<BlocklistDocument>,
  ) {}

  async block(blockerId: string, blockedId: string): Promise<BlocklistDocument> {
    return this.blocklistModel.create({ blockerId, blockedId });
  }

  async unblock(blockerId: string, blockedId: string): Promise<void> {
    await this.blocklistModel.deleteOne({ blockerId, blockedId }).exec();
  }

  async getBlockedIds(userId: string): Promise<string[]> {
    const entries = await this.blocklistModel.find({ blockerId: userId }).exec();
    return entries.map((e) => e.blockedId.toString());
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const entry = await this.blocklistModel.findOne({ blockerId, blockedId }).exec();
    return !!entry;
  }
}
