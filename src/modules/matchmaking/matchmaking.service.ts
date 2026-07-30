import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QueueStatusResponseDto, MatchResult } from './dto/queue-status.dto';
import {
  ProfileIncompleteException,
  NotInQueueException,
} from '../../common/exceptions/matchmaking.exceptions';
import { ProfileService } from '../profile/profile.service';
import { BlocklistService } from '../blocklist/blocklist.service';
import { Gender, ChatPreference } from '../profile/entities/profile.schema';
import { RoomService } from '../room/room.service';
import { OfflineCandidateRepository } from './offline-candidate.repository';

const QUEUE_ZSET = 'matchmaking:queue';
const ENTRY_PREFIX = 'matchmaking:entry:';
const ATTEMPT_LOCK_PREFIX = 'matchmaking:attempt:';
const USER_CLAIM_PREFIX = 'matchmaking:user-claim:';
const PAIR_LOCK_PREFIX = 'matchmaking:pair:';
const OFFLINE_GRACE_PREFIX = 'matchmaking:offline-grace:';
const OFFLINE_RETRY_PREFIX = 'matchmaking:offline-retry:';
const MATCH_LOCK_TTL_SEC = 20;
const OFFLINE_RETRY_INTERVAL_SEC = 10;
const OFFLINE_CANDIDATE_LIMIT = 20;

export const QUEUE_TIMEOUT_SEC = 300; // 5 phút
export const OFFLINE_FALLBACK_DELAY_SEC = 15;

export interface QueueEntry {
  userId: string;
  socketId: string;
  preference: ChatPreference;
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
    private readonly roomService: RoomService,
    private readonly offlineCandidateRepository: OfflineCandidateRepository,
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

    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`, err.stack));
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

  private userClaimKey(userId: string) {
    return `${USER_CLAIM_PREFIX}${userId}`;
  }

  private offlineGraceKey(userId: string) {
    return `${OFFLINE_GRACE_PREFIX}${userId}`;
  }

  private offlineRetryKey(userId: string) {
    return `${OFFLINE_RETRY_PREFIX}${userId}`;
  }

  private async clearOfflineFallbackState(userId: string): Promise<void> {
    await this.redis.del(this.offlineGraceKey(userId), this.offlineRetryKey(userId));
  }

  /** Vào hàng đợi — yêu cầu profile đầy đủ */
  async joinQueue(
    userId: string,
    socketId: string,
    dto: JoinQueueDto,
  ): Promise<QueueStatusResponseDto> {
    this.assertValidPreference(dto.preference);

    const profile = await this.profileService.findByUserId(userId);
    if (!profile?.gender || !profile?.age) {
      throw new ProfileIncompleteException();
    }

    if (await this.roomService.getActiveRoomForUser(userId)) {
      await this.leaveQueue(userId);
      throw new BadRequestException('Bạn đang có một phòng chat hoạt động');
    }

    if (await this.redis.exists(this.userClaimKey(userId))) {
      throw new BadRequestException('Hệ thống đang hoàn tất một lượt ghép đôi cho bạn');
    }

    await this.profileService.updateChatPreference(userId, dto.preference);

    const existing = await this.getQueueEntry(userId);
    if (existing) {
      // Cập nhật socketId nếu reconnect
      existing.socketId = socketId;
      existing.preference = dto.preference;
      await this.saveEntry(userId, existing);
      return this.getStatus(userId);
    }

    const now = Date.now();
    const entry: QueueEntry = {
      userId,
      socketId,
      preference: dto.preference,
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
    await this.redis.del(
      this.entryKey(userId),
      this.offlineGraceKey(userId),
      this.offlineRetryKey(userId),
    );
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
        preference: ChatPreference.FEMALE,
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
      timedOut: false,
    };
  }

  /**
   * Ghép đôi atomic — tránh race khi hai user cùng match một người.
   * Trả về MatchResult nếu thành công, null nếu chưa tìm được.
   */
  async tryAtomicMatch(userId: string): Promise<MatchResult | null> {
    const lockKey = `${ATTEMPT_LOCK_PREFIX}${userId}`;
    const acquired = await this.redis.set(lockKey, '1', 'EX', MATCH_LOCK_TTL_SEC, 'NX');
    if (!acquired) return null;

    try {
      const myEntry = await this.getQueueEntry(userId);
      if (!myEntry || Date.now() >= myEntry.expiresAt) {
        if (myEntry) await this.leaveQueue(userId);
        return null;
      }

      if (await this.roomService.getActiveRoomForUser(userId)) {
        await this.leaveQueue(userId);
        return null;
      }

      const blockIds = await this.blocklistService.getMutualBlockIds(userId);
      const blockSet = new Set(blockIds);

      // FIFO: duyệt từ người chờ lâu nhất (score thấp nhất)
      const candidateIds = await this.redis.zrange(QUEUE_ZSET, 0, -1);
      let compatibleOnlinePresent = false;

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

        if (await this.roomService.getActiveRoomForUser(candidateId)) {
          await this.leaveQueue(candidateId);
          continue;
        }

        compatibleOnlinePresent = true;
        const claimId = await this.acquireUserClaims(userId, candidateId);
        if (!claimId) continue;

        try {
          const [latestMe, latestCandidate] = await Promise.all([
            this.getQueueEntry(userId),
            this.getQueueEntry(candidateId),
          ]);
          if (!latestMe || !latestCandidate || !this.isCompatible(latestMe, latestCandidate)) {
            continue;
          }

          const [myActiveRoom, candidateActiveRoom] = await Promise.all([
            this.roomService.getActiveRoomForUser(userId),
            this.roomService.getActiveRoomForUser(candidateId),
          ]);
          if (myActiveRoom || candidateActiveRoom) {
            if (myActiveRoom) await this.leaveQueue(userId);
            if (candidateActiveRoom) await this.leaveQueue(candidateId);
            continue;
          }

          const matched = await this.claimPair(userId, candidateId);
          if (!matched) continue;

          const room = await this.roomService.createRoomIfAvailable([userId, candidateId]);
          if (!room) {
            this.logger.warn(`Room creation skipped for busy pair ${userId} <-> ${candidateId}`);
            continue;
          }

          await Promise.all([
            this.clearOfflineFallbackState(userId),
            this.clearOfflineFallbackState(candidateId),
          ]);
          return {
            roomId: room.roomId,
            partnerId: latestCandidate.userId,
            partnerSocketId: latestCandidate.socketId,
            source: 'online',
          };
        } finally {
          await this.releaseUserClaims(userId, candidateId, claimId);
        }
      }

      if (compatibleOnlinePresent) {
        await this.clearOfflineFallbackState(userId);
        return null;
      }

      return this.tryOfflineFallback(myEntry, blockSet);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  private async tryOfflineFallback(
    myEntry: QueueEntry,
    blockSet: Set<string>,
  ): Promise<MatchResult | null> {
    const now = Date.now();
    const graceKey = this.offlineGraceKey(myEntry.userId);
    const graceStartedRaw = await this.redis.get(graceKey);

    if (!graceStartedRaw) {
      await this.redis.set(graceKey, String(now), 'EX', QUEUE_TIMEOUT_SEC, 'NX');
      return null;
    }

    const graceStartedAt = Number(graceStartedRaw);
    if (
      !Number.isFinite(graceStartedAt) ||
      now - graceStartedAt < OFFLINE_FALLBACK_DELAY_SEC * 1000
    ) {
      if (!Number.isFinite(graceStartedAt)) {
        await this.redis.set(graceKey, String(now), 'EX', QUEUE_TIMEOUT_SEC);
      }
      return null;
    }

    const retryAcquired = await this.redis.set(
      this.offlineRetryKey(myEntry.userId),
      '1',
      'EX',
      OFFLINE_RETRY_INTERVAL_SEC,
      'NX',
    );
    if (!retryAcquired) return null;

    if (await this.hasCompatibleOnlineCandidate(myEntry, blockSet)) {
      await this.clearOfflineFallbackState(myEntry.userId);
      return null;
    }

    const onlineUserIds = await this.redis.zrange(QUEUE_ZSET, 0, -1);

    const candidates = await this.offlineCandidateRepository.findEligible({
      requesterId: myEntry.userId,
      requesterGender: myEntry.gender,
      requesterPreference: myEntry.preference,
      excludedUserIds: [...blockSet, ...onlineUserIds],
      limit: OFFLINE_CANDIDATE_LIMIT,
    });

    for (const candidate of candidates) {
      const claimId = await this.acquireUserClaims(myEntry.userId, candidate.userId);
      if (!claimId) continue;

      try {
        const candidateQueueEntry = await this.getQueueEntry(candidate.userId);
        if (candidateQueueEntry) {
          if (Date.now() >= candidateQueueEntry.expiresAt) {
            await this.leaveQueue(candidate.userId);
          } else {
            if (this.isCompatible(myEntry, candidateQueueEntry)) {
              await this.clearOfflineFallbackState(myEntry.userId);
              return null;
            }
            continue;
          }
        }

        const candidateProfile = await this.profileService.findByUserId(candidate.userId);
        if (
          !candidateProfile ||
          candidateProfile.offlineMatchingEnabled === false ||
          !this.isValidGender(candidateProfile.gender) ||
          !this.isValidPreference(candidateProfile.chatPreference) ||
          !this.isCompatible(myEntry, {
            userId: candidate.userId,
            socketId: `pending:${candidate.userId}`,
            gender: candidateProfile.gender,
            preference: candidateProfile.chatPreference,
            joinedAt: now,
            expiresAt: now + MATCH_LOCK_TTL_SEC * 1000,
          })
        ) {
          continue;
        }

        const [blockedByRequester, blockedByCandidate, myActiveRoom, candidateActiveRoom] =
          await Promise.all([
            this.blocklistService.isBlocked(myEntry.userId, candidate.userId),
            this.blocklistService.isBlocked(candidate.userId, myEntry.userId),
            this.roomService.getActiveRoomForUser(myEntry.userId),
            this.roomService.getActiveRoomForUser(candidate.userId),
          ]);
        if (blockedByRequester || blockedByCandidate || candidateActiveRoom) continue;
        if (myActiveRoom) {
          await this.leaveQueue(myEntry.userId);
          return null;
        }

        // Mongo lookup can take long enough for a compatible user to join Redis.
        // Recheck while the requester is claimed before committing to an offline room.
        if (await this.hasCompatibleOnlineCandidate(myEntry, blockSet)) {
          await this.clearOfflineFallbackState(myEntry.userId);
          return null;
        }

        const room = await this.roomService.createRoomIfAvailable([
          myEntry.userId,
          candidate.userId,
        ]);
        if (!room) continue;

        await this.leaveQueue(myEntry.userId);
        this.logger.log(`Offline matched ${myEntry.userId} <-> ${candidate.userId}`);
        return {
          roomId: room.roomId,
          partnerId: candidate.userId,
          partnerSocketId: `pending:${candidate.userId}`,
          source: 'offline',
        };
      } finally {
        await this.releaseUserClaims(myEntry.userId, candidate.userId, claimId);
      }
    }

    return null;
  }

  private async hasCompatibleOnlineCandidate(
    myEntry: QueueEntry,
    blockSet: Set<string>,
  ): Promise<boolean> {
    const candidateIds = await this.redis.zrange(QUEUE_ZSET, 0, -1);

    for (const candidateId of candidateIds) {
      if (candidateId === myEntry.userId || blockSet.has(candidateId)) continue;

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

      if (await this.roomService.getActiveRoomForUser(candidateId)) {
        await this.leaveQueue(candidateId);
        continue;
      }

      return true;
    }

    return false;
  }

  private async acquireUserClaims(userA: string, userB: string): Promise<string | null> {
    const [firstKey, secondKey] = [this.userClaimKey(userA), this.userClaimKey(userB)].sort();
    const claimId = randomUUID();
    const script = `
      if redis.call("EXISTS", KEYS[1]) == 1 or redis.call("EXISTS", KEYS[2]) == 1 then
        return 0
      end
      redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[2])
      redis.call("SET", KEYS[2], ARGV[1], "EX", ARGV[2])
      return 1
    `;
    const claimed = await this.redis.eval(
      script,
      2,
      firstKey,
      secondKey,
      claimId,
      MATCH_LOCK_TTL_SEC,
    );
    return claimed === 1 ? claimId : null;
  }

  private async releaseUserClaims(userA: string, userB: string, claimId: string): Promise<void> {
    const [firstKey, secondKey] = [this.userClaimKey(userA), this.userClaimKey(userB)].sort();
    const script = `
      for _, key in ipairs(KEYS) do
        if redis.call("GET", key) == ARGV[1] then
          redis.call("DEL", key)
        end
      end
      return 1
    `;
    await this.redis.eval(script, 2, firstKey, secondKey, claimId);
  }

  /** Xóa cả hai khỏi queue bằng Lua script atomic để tránh claim trùng khi tải cao */
  private async claimPair(userA: string, userB: string): Promise<boolean> {
    const pairKey = this.pairLockKey(userA, userB);
    const pairAcquired = await this.redis.set(pairKey, '1', 'EX', 15, 'NX');
    if (!pairAcquired) return false;

    const entryKeyA = this.entryKey(userA);
    const entryKeyB = this.entryKey(userB);

    const claimScript = `
      if redis.call("EXISTS", KEYS[1]) == 0 or redis.call("EXISTS", KEYS[2]) == 0 then
        return 0
      end
      redis.call("ZREM", KEYS[3], ARGV[1], ARGV[2])
      redis.call("DEL", KEYS[1], KEYS[2])
      return 1
    `;

    try {
      const claimed = await this.redis.eval(
        claimScript,
        3,
        entryKeyA,
        entryKeyB,
        QUEUE_ZSET,
        userA,
        userB,
      );

      if (claimed !== 1) return false;
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
      const entry = JSON.parse(raw) as QueueEntry;
      if (!this.isValidPreference(entry.preference) || !this.isValidGender(entry.gender)) {
        await this.redis.del(this.entryKey(userId));
        await this.redis.zrem(QUEUE_ZSET, userId);
        return null;
      }
      return entry;
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

  async consumePendingMatch(userId: string): Promise<{ roomId: string; partnerId: string } | null> {
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
   * Hai user chỉ match khi mỗi người chọn đúng giới tính của đối phương.
   */
  private isCompatible(a: QueueEntry, b: QueueEntry): boolean {
    return (
      a.preference === this.genderToPreference(b.gender) &&
      b.preference === this.genderToPreference(a.gender)
    );
  }

  private genderToPreference(gender: Gender): ChatPreference {
    if (gender === Gender.MALE) return ChatPreference.MALE;
    if (gender === Gender.FEMALE) return ChatPreference.FEMALE;
    return ChatPreference.OTHER;
  }

  private assertValidPreference(preference: ChatPreference): void {
    if (!this.isValidPreference(preference)) {
      throw new BadRequestException('Preference không hợp lệ');
    }
  }

  private isValidPreference(preference?: ChatPreference): preference is ChatPreference {
    return (
      preference === ChatPreference.MALE ||
      preference === ChatPreference.FEMALE ||
      preference === ChatPreference.OTHER
    );
  }

  private isValidGender(gender?: Gender): gender is Gender {
    return gender === Gender.MALE || gender === Gender.FEMALE || gender === Gender.OTHER;
  }
}
