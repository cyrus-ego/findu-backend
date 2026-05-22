import { Injectable } from '@nestjs/common';
import { BlocklistRepository } from './blocklist.repository';
import { toBlocklistEntryResponse } from './dto/blocklist-response.dto';

@Injectable()
export class BlocklistService {
  constructor(private readonly blocklistRepository: BlocklistRepository) {}

  async block(blockerId: string, blockedId: string) {
    const entry = await this.blocklistRepository.block(blockerId, blockedId);
    return toBlocklistEntryResponse(entry);
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.blocklistRepository.unblock(blockerId, blockedId);
    return { message: 'Đã bỏ chặn người dùng' };
  }

  getBlockedIds(userId: string) {
    return this.blocklistRepository.getBlockedIds(userId);
  }

  isBlocked(blockerId: string, blockedId: string) {
    return this.blocklistRepository.isBlocked(blockerId, blockedId);
  }

  /** Danh sách userId không được ghép (block hai chiều) */
  getMutualBlockIds(userId: string) {
    return this.blocklistRepository.getMutualBlockIds(userId);
  }
}
