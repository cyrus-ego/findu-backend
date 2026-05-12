import { Injectable } from '@nestjs/common';
import { BlocklistRepository } from './blocklist.repository';

@Injectable()
export class BlocklistService {
  constructor(private readonly blocklistRepository: BlocklistRepository) {}

  block(blockerId: string, blockedId: string) {
    return this.blocklistRepository.block(blockerId, blockedId);
  }

  unblock(blockerId: string, blockedId: string) {
    return this.blocklistRepository.unblock(blockerId, blockedId);
  }

  getBlockedIds(userId: string) {
    return this.blocklistRepository.getBlockedIds(userId);
  }

  isBlocked(blockerId: string, blockedId: string) {
    return this.blocklistRepository.isBlocked(blockerId, blockedId);
  }
}
