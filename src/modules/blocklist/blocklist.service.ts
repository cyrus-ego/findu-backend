import { Injectable } from '@nestjs/common';
import { BlocklistRepository } from './blocklist.repository';
import { toBlocklistEntryResponse } from './dto/blocklist-response.dto';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const BLOCKLIST_CACHE_TTL = 30_000; // 30 giây

@Injectable()
export class BlocklistService {
  private readonly blocklistCache = new Map<string, CacheEntry<boolean>>();

  constructor(private readonly blocklistRepository: BlocklistRepository) {}

  async block(blockerId: string, blockedId: string) {
    const entry = await this.blocklistRepository.block(blockerId, blockedId);
    this.invalidateCache(blockerId, blockedId);
    return toBlocklistEntryResponse(entry);
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.blocklistRepository.unblock(blockerId, blockedId);
    this.invalidateCache(blockerId, blockedId);
    return { message: 'Đã bỏ chặn người dùng' };
  }

  getBlockedIds(userId: string) {
    return this.blocklistRepository.getBlockedIds(userId);
  }

  async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
    const key = `${blockerId}:${blockedId}`;
    const cached = this.blocklistCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
    const result = await this.blocklistRepository.isBlocked(blockerId, blockedId);
    this.blocklistCache.set(key, { data: result, expiresAt: Date.now() + BLOCKLIST_CACHE_TTL });
    return result;
  }

  private invalidateCache(blockerId: string, blockedId: string): void {
    this.blocklistCache.delete(`${blockerId}:${blockedId}`);
    this.blocklistCache.delete(`${blockedId}:${blockerId}`);
  }

  /** Danh sách userId không được ghép (block hai chiều) */
  getMutualBlockIds(userId: string) {
    return this.blocklistRepository.getMutualBlockIds(userId);
  }
}
