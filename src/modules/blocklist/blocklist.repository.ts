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

  /** User đã block + user bị block bởi người khác (hai chiều) */
  async getMutualBlockIds(userId: string): Promise<string[]> {
    const [blocked, blockedBy] = await Promise.all([
      this.blocklistModel.find({ blockerId: userId }).select('blockedId').lean(),
      this.blocklistModel.find({ blockedId: userId }).select('blockerId').lean(),
    ]);

    const ids = new Set<string>();
    blocked.forEach((e) => ids.add(String(e.blockedId)));
    blockedBy.forEach((e) => ids.add(String(e.blockerId)));
    return Array.from(ids);
  }
}
