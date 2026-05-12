import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { JoinQueueDto } from './dto/join-queue.dto';
import { AlreadyInQueueException } from '../../common/exceptions/app.exceptions';

const QUEUE_KEY = 'matchmaking:queue';
const QUEUE_TIMEOUT_SEC = 300; // 5 phút

export interface QueueEntry {
  userId: string;
  socketId: string;
  preference: string;
  preferredGender?: string;
  gender?: string;
  joinedAt: number;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private redis: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async joinQueue(userId: string, socketId: string, dto: JoinQueueDto, gender?: string) {
    const existing = await this.getQueueEntry(userId);
    if (existing) throw new AlreadyInQueueException();

    const entry: QueueEntry = {
      userId,
      socketId,
      preference: dto.preference || 'any',
      preferredGender: dto.preferredGender,
      gender,
      joinedAt: Date.now(),
    };

    await this.redis.setex(
      `${QUEUE_KEY}:${userId}`,
      QUEUE_TIMEOUT_SEC,
      JSON.stringify(entry),
    );
    await this.redis.zadd(QUEUE_KEY, Date.now(), userId);
    this.logger.log(`User ${userId} vào hàng đợi`);
  }

  async leaveQueue(userId: string) {
    await this.redis.del(`${QUEUE_KEY}:${userId}`);
    await this.redis.zrem(QUEUE_KEY, userId);
  }

  async findMatch(userId: string, blockedIds: string[]): Promise<QueueEntry | null> {
    const myEntry = await this.getQueueEntry(userId);
    if (!myEntry) return null;

    // Lấy top 50 user chờ lâu nhất (FIFO)
    const candidates = await this.redis.zrange(QUEUE_KEY, 0, 49);

    for (const candidateId of candidates) {
      if (candidateId === userId) continue;
      if (blockedIds.includes(candidateId)) continue;

      const candidate = await this.getQueueEntry(candidateId);
      if (!candidate) continue;

      if (this.isCompatible(myEntry, candidate)) {
        return candidate;
      }
    }

    return null;
  }

  async getQueuePosition(userId: string): Promise<number> {
    const rank = await this.redis.zrank(QUEUE_KEY, userId);
    return rank === null ? -1 : rank + 1;
  }

  async getQueueEntry(userId: string): Promise<QueueEntry | null> {
    const raw = await this.redis.get(`${QUEUE_KEY}:${userId}`);
    return raw ? JSON.parse(raw) : null;
  }

  private isCompatible(a: QueueEntry, b: QueueEntry): boolean {
    if (a.preference === 'any' && b.preference === 'any') return true;

    const genderOk =
      !a.preferredGender ||
      a.preferredGender === 'any' ||
      a.preferredGender === b.gender;

    const reverseOk =
      !b.preferredGender ||
      b.preferredGender === 'any' ||
      b.preferredGender === a.gender;

    return genderOk && reverseOk;
  }
}
