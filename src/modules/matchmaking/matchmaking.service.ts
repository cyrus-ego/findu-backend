import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QueueStatusResponseDto, MatchResult } from './dto/queue-status.dto';
import { ProfileIncompleteException, NotInQueueException } from '../../common/exceptions/matchmaking.exceptions';
import { ProfileService } from '../profile/profile.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { Gender, ChatPreference } from '../profile/entities/profile.schema';

const QUEUE_ZSET = 'matchmaking:queue';
const ENTRY_PREFIX = 'matchmaking:entry:';
const LOCK_PREFIX = 'matchmaking:lock:';
const PAIR_LOCK_PREFIX = 'matchmaking:pair:';

export const QUEUE_TIMEOUT_SEC = 300; // 5 phút

export interface QueueEntry {
  userId: string;
  socketId: string;
  preference: ChatPreference;
  preferredGender?: Gender | 'any';
  gender: Gender;
  joinedAt: number;
  expiresAt: number;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private redis: Redis;

  constructor(
    private readonly config: ConfigService,
    private readonly profileService: ProfileService,
    private readonly blocklistService: BlocklistService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl) {
      this.redis = new Redis(redisUrl);
    } else {
      this.redis = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: this.config.get<number>('REDIS_PORT', 6379),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      });
    }

    this.redis.on('error', (err) =>
      this.logger.error(`Redis error: ${err.message}`, err.stack),
    );
    this.redis.on('connect', () => this.logger.log('Redis connected'));
  }

  onModuleDestroy() {
    this.redis?.disconnect();
  }

  private entryKey(userId: string) {
    return `${ENTRY_PREFIX}${userId}`;
  }

  private pairLockKey(a: string, b: string) {
    const [x, y] = [a, b].sort();
    return `${PAIR_LOCK_PREFIX}${x}:${y}`;
  }

  /** Vào hàng đợi — yêu cầu profile đầy đủ */
  async joinQueue(
    userId: string,
    socketId: string,
    dto: JoinQueueDto,
  ): Promise<QueueStatusResponseDto> {
    const profile = await this.profileService.findByUserId(userId);
    if (!profile?.gender || !profile?.age) {
      throw new ProfileIncompleteException();
    }

    const existing = await this.getQueueEntry(userId);
    if (existing) {
      // Cập nhật socketId nếu reconnect
      existing.socketId = socketId;
      existing.preference = dto.preference;
      existing.preferredGender = dto.preferredGender;
      await this.saveEntry(userId, existing);
      return this.getStatus(userId);
    }

    const now = Date.now();
    const entry: QueueEntry = {
      userId,
      socketId,
      preference: dto.preference,
      preferredGender: dto.preferredGender,
      gender: profile.gender,
      joinedAt: now,
      expiresAt: now + QUEUE_TIMEOUT_SEC * 1000,
    };

    await this.saveEntry(userId, entry);
    await this.redis.zadd(QUEUE_ZSET, now, userId);

    this.logger.log(`User ${userId} joined queue (preference=${dto.preference})`);
    return this.getStatus(userId);
  }

  /** Cập nhật socketId sau khi client kết nối WebSocket */
  async updateSocketId(userId: string, socketId: string): Promise<void> {
    const entry = await this.getQueueEntry(userId);
    if (!entry) return;
    entry.socketId = socketId;
    await this.saveEntry(userId, entry);
  }

  /** Rời hàng đợi */
  async leaveQueue(userId: string): Promise<void> {
    await this.redis.del(this.entryKey(userId));
    await this.redis.zrem(QUEUE_ZSET, userId);
    this.logger.log(`User ${userId} left queue`);
  }

  /** Trạng thái hàng đợi thực tế */
  async getStatus(userId: string): Promise<QueueStatusResponseDto> {
    await this.cleanupStaleEntries();

    const entry = await this.getQueueEntry(userId);
    if (!entry) {
      return {
        inQueue: false,
        position: 0,
        queueSize: await this.getActiveQueueSize(),
        waitSeconds: 0,
        expiresInSeconds: 0,
        preference: 'any',
        timedOut: false,
      };
    }

    const now = Date.now();
    if (now >= entry.expiresAt) {
      await this.leaveQueue(userId);
      return {
        inQueue: false,
        position: 0,
        queueSize: await this.getActiveQueueSize(),
        waitSeconds: Math.floor((now - entry.joinedAt) / 1000),
        expiresInSeconds: 0,
        preference: entry.preference,
        preferredGender: entry.preferredGender,
        timedOut: true,
      };
    }

    const position = await this.getQueuePosition(userId);

    return {
      inQueue: true,
      position,
      queueSize: await this.getActiveQueueSize(),
      waitSeconds: Math.floor((now - entry.joinedAt) / 1000),
      expiresInSeconds: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)),
      preference: entry.preference,
      preferredGender: entry.preferredGender,
      timedOut: false,
    };
  }

  /**
   * Ghép đôi atomic — tránh race khi hai user cùng match một người.
   * Trả về MatchResult nếu thành công, null nếu chưa tìm được.
   */
  async tryAtomicMatch(userId: string): Promise<MatchResult | null> {
    const lockKey = `${LOCK_PREFIX}${userId}`;
    const acquired = await this.redis.set(lockKey, '1', 'EX', 8, 'NX');
    if (!acquired) return null;

    try {
      const myEntry = await this.getQueueEntry(userId);
      if (!myEntry || Date.now() >= myEntry.expiresAt) {
        if (myEntry) await this.leaveQueue(userId);
        return null;
      }

      const blockIds = await this.blocklistService.getMutualBlockIds(userId);
      const blockSet = new Set(blockIds);

      // FIFO: duyệt từ người chờ lâu nhất (score thấp nhất)
      const candidateIds = await this.redis.zrange(QUEUE_ZSET, 0, -1);

      for (const candidateId of candidateIds) {
        if (candidateId === userId) continue;
        if (blockSet.has(candidateId)) continue;

        const candidate = await this.getQueueEntry(candidateId);
        if (!candidate) {
          await this.redis.zrem(QUEUE_ZSET, candidateId);
          continue;
        }
        if (Date.now() >= candidate.expiresAt) {
          await this.leaveQueue(candidateId);
          continue;
        }

        if (!this.isCompatible(myEntry, candidate)) continue;

        const matched = await this.claimPair(userId, candidateId);
        if (matched) {
          return {
            roomId: '', // Gateway sẽ tạo room và gán
            partnerId: candidate.userId,
            partnerSocketId: candidate.socketId,
          };
        }
      }

      return null;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /** Xóa cả hai khỏi queue trong một transaction */
  private async claimPair(userA: string, userB: string): Promise<boolean> {
    const pairKey = this.pairLockKey(userA, userB);
    const pairAcquired = await this.redis.set(pairKey, '1', 'EX', 15, 'NX');
    if (!pairAcquired) return false;

    try {
      const [entryA, entryB] = await Promise.all([
        this.getQueueEntry(userA),
        this.getQueueEntry(userB),
      ]);

      if (!entryA || !entryB) return false;

      const multi = this.redis.multi();
      multi.zrem(QUEUE_ZSET, userA, userB);
      multi.del(this.entryKey(userA), this.entryKey(userB));
      const results = await multi.exec();

      if (!results) return false;

      this.logger.log(`Matched ${userA} <-> ${userB}`);
      return true;
    } finally {
      await this.redis.del(pairKey);
    }
  }

  async getQueueEntry(userId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.get(this.entryKey(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as QueueEntry;
    } catch {
      await this.redis.del(this.entryKey(userId));
      return null;
    }
  }

  /** Vị trí thực tế trong hàng (1 = đầu hàng) */
  async getQueuePosition(userId: string): Promise<number> {
    await this.cleanupStaleEntries();
    const rank = await this.redis.zrank(QUEUE_ZSET, userId);
    return rank === null ? 0 : rank + 1;
  }

  async handleDisconnect(userId: string): Promise<void> {
    await this.leaveQueue(userId);
  }

  /** Lưu kết quả ghép khi đối phương chưa kết nối WebSocket */
  async setPendingMatch(
    userId: string,
    data: { roomId: string; partnerId: string },
  ): Promise<void> {
    await this.redis.setex(`matchmaking:pending:${userId}`, 120, JSON.stringify(data));
  }

  async consumePendingMatch(
    userId: string,
  ): Promise<{ roomId: string; partnerId: string } | null> {
    const key = `matchmaking:pending:${userId}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async assertInQueue(userId: string): Promise<QueueEntry> {
    const entry = await this.getQueueEntry(userId);
    if (!entry) throw new NotInQueueException();
    if (Date.now() >= entry.expiresAt) {
      await this.leaveQueue(userId);
      throw new NotInQueueException();
    }
    return entry;
  }

  private async saveEntry(userId: string, entry: QueueEntry): Promise<void> {
    const ttlSec = Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    await this.redis.setex(this.entryKey(userId), ttlSec, JSON.stringify(entry));
  }

  private async getActiveQueueSize(): Promise<number> {
    const ids = await this.redis.zrange(QUEUE_ZSET, 0, -1);
    let count = 0;
    for (const id of ids) {
      if (await this.getQueueEntry(id)) count++;
    }
    return count;
  }

  /** Dọn entry hết hạn / mồ côi trong sorted set */
  private async cleanupStaleEntries(): Promise<void> {
    const ids = await this.redis.zrange(QUEUE_ZSET, 0, -1);
    for (const id of ids) {
      const entry = await this.getQueueEntry(id);
      if (!entry || Date.now() >= entry.expiresAt) {
        await this.redis.zrem(QUEUE_ZSET, id);
        if (entry) await this.redis.del(this.entryKey(id));
      }
    }
  }

  /**
   * Kiểm tra tương thích preference:
   * - preferredGender: giới tính đối phương mong muốn
   * - preference (chatPreference): opposite / same / any
   */
  private isCompatible(a: QueueEntry, b: QueueEntry): boolean {
    return (
      this.satisfiesGenderFilter(a, b.gender) &&
      this.satisfiesGenderFilter(b, a.gender) &&
      this.satisfiesChatPreference(a, b.gender) &&
      this.satisfiesChatPreference(b, a.gender)
    );
  }

  private satisfiesGenderFilter(entry: QueueEntry, otherGender?: Gender): boolean {
    const pref = entry.preferredGender;
    if (!pref || pref === ('any' as Gender)) return true;
    if (!otherGender) return false;
    return pref === otherGender;
  }

  private satisfiesChatPreference(entry: QueueEntry, otherGender?: Gender): boolean {
    if (!entry.preference || entry.preference === ChatPreference.ANY) return true;
    if (!entry.gender || !otherGender) return true;

    const opposite =
      (entry.gender === Gender.MALE && otherGender === Gender.FEMALE) ||
      (entry.gender === Gender.FEMALE && otherGender === Gender.MALE);

    const same = entry.gender === otherGender;

    if (entry.preference === ChatPreference.OPPOSITE) return opposite;
    if (entry.preference === ChatPreference.SAME) return same;
    return true;
  }
}
