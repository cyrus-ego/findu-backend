import { ChatPreference, Gender } from '../profile/entities/profile.schema';
import { MatchmakingService, OFFLINE_FALLBACK_DELAY_SEC, QueueEntry } from './matchmaking.service';

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly queue: string[] = [];

  async set(key: string, value: string, ...args: Array<string | number>) {
    if (args.includes('NX') && this.values.has(key)) return null;
    this.values.set(key, value);
    return 'OK';
  }

  async setex(key: string, _ttl: number, value: string) {
    this.values.set(key, value);
    return 'OK';
  }

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async exists(key: string) {
    return this.values.has(key) ? 1 : 0;
  }

  async del(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      if (this.values.delete(key)) deleted += 1;
    }
    return deleted;
  }

  async zadd(_key: string, _score: number, userId: string) {
    if (!this.queue.includes(userId)) this.queue.push(userId);
    return 1;
  }

  async zrem(_key: string, ...userIds: string[]) {
    for (const userId of userIds) {
      const index = this.queue.indexOf(userId);
      if (index >= 0) this.queue.splice(index, 1);
    }
    return userIds.length;
  }

  async zrange() {
    return [...this.queue];
  }

  async zrank(_key: string, userId: string) {
    const index = this.queue.indexOf(userId);
    return index >= 0 ? index : null;
  }

  async eval(script: string, keyCount: number, ...args: Array<string | number>) {
    const keys = args.slice(0, keyCount).map(String);
    const argv = args.slice(keyCount).map(String);

    if (script.includes('ipairs(KEYS)')) {
      for (const key of keys) {
        if (this.values.get(key) === argv[0]) this.values.delete(key);
      }
      return 1;
    }

    if (script.includes('redis.call("SET", KEYS[1]')) {
      if (keys.some((key) => this.values.has(key))) return 0;
      this.values.set(keys[0], argv[0]);
      this.values.set(keys[1], argv[0]);
      return 1;
    }

    if (script.includes('ZREM')) {
      if (!this.values.has(keys[0]) || !this.values.has(keys[1])) return 0;
      this.values.delete(keys[0]);
      this.values.delete(keys[1]);
      await this.zrem(keys[2], argv[0], argv[1]);
      return 1;
    }

    throw new Error(`Unsupported Lua script: ${script}`);
  }
}

describe('MatchmakingService online-first fallback', () => {
  const requesterId = 'user-a';
  const onlinePartnerId = 'user-b';
  const offlinePartnerId = 'user-c';

  let now: number;
  let redis: FakeRedis;
  let profileService: {
    findByUserId: jest.Mock;
    updateChatPreference: jest.Mock;
  };
  let blocklistService: {
    getMutualBlockIds: jest.Mock;
    isBlocked: jest.Mock;
  };
  let roomService: {
    getActiveRoomForUser: jest.Mock;
    createRoomIfAvailable: jest.Mock;
  };
  let offlineCandidateRepository: { findEligible: jest.Mock };
  let service: MatchmakingService;

  const entry = (
    userId: string,
    gender: Gender,
    preference: ChatPreference,
    socketId = `socket-${userId}`,
  ): QueueEntry => ({
    userId,
    socketId,
    gender,
    preference,
    joinedAt: now,
    expiresAt: now + 300_000,
  });

  const saveEntry = (value: QueueEntry) => {
    redis.values.set(`matchmaking:entry:${value.userId}`, JSON.stringify(value));
    redis.queue.push(value.userId);
  };

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    redis = new FakeRedis();
    profileService = {
      findByUserId: jest.fn().mockImplementation(async (userId: string) => {
        if (userId !== offlinePartnerId) return null;
        return {
          userId: offlinePartnerId,
          gender: Gender.FEMALE,
          age: 24,
          chatPreference: ChatPreference.MALE,
          offlineMatchingEnabled: true,
        };
      }),
      updateChatPreference: jest.fn(),
    };
    blocklistService = {
      getMutualBlockIds: jest.fn().mockResolvedValue([]),
      isBlocked: jest.fn().mockResolvedValue(false),
    };
    roomService = {
      getActiveRoomForUser: jest.fn().mockResolvedValue(null),
      createRoomIfAvailable: jest.fn().mockImplementation(async () => ({
        roomId: `room-${roomService.createRoomIfAvailable.mock.calls.length}`,
      })),
    };
    offlineCandidateRepository = {
      findEligible: jest.fn().mockResolvedValue([
        {
          userId: offlinePartnerId,
          gender: Gender.FEMALE,
          preference: ChatPreference.MALE,
        },
      ]),
    };
    service = new MatchmakingService(
      {} as never,
      profileService as never,
      blocklistService as never,
      roomService as never,
      offlineCandidateRepository as never,
    );
    (service as unknown as { redis: FakeRedis }).redis = redis;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('matches a compatible online user before querying offline candidates', async () => {
    saveEntry(entry(requesterId, Gender.MALE, ChatPreference.FEMALE));
    saveEntry(entry(onlinePartnerId, Gender.FEMALE, ChatPreference.MALE));

    const result = await service.tryAtomicMatch(requesterId);

    expect(result).toMatchObject({
      partnerId: onlinePartnerId,
      partnerSocketId: `socket-${onlinePartnerId}`,
      source: 'online',
    });
    expect(offlineCandidateRepository.findEligible).not.toHaveBeenCalled();
    expect(roomService.createRoomIfAvailable).toHaveBeenCalledWith([requesterId, onlinePartnerId]);
  });

  it('waits 15 seconds without a compatible online user before matching offline', async () => {
    saveEntry(entry(requesterId, Gender.MALE, ChatPreference.FEMALE));

    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    now += OFFLINE_FALLBACK_DELAY_SEC * 1000 - 1;
    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    expect(offlineCandidateRepository.findEligible).not.toHaveBeenCalled();

    now += 1;
    const result = await service.tryAtomicMatch(requesterId);

    expect(result).toMatchObject({
      partnerId: offlinePartnerId,
      partnerSocketId: `pending:${offlinePartnerId}`,
      source: 'offline',
    });
    expect(offlineCandidateRepository.findEligible).toHaveBeenCalledTimes(1);
  });

  it('resets the offline grace period while a compatible online user is present', async () => {
    saveEntry(entry(requesterId, Gender.MALE, ChatPreference.FEMALE));
    expect(await service.tryAtomicMatch(requesterId)).toBeNull();

    now += 20_000;
    saveEntry(entry(onlinePartnerId, Gender.FEMALE, ChatPreference.MALE));
    redis.values.set(`matchmaking:user-claim:${onlinePartnerId}`, 'other-claim');
    expect(await service.tryAtomicMatch(requesterId)).toBeNull();

    redis.values.delete(`matchmaking:user-claim:${onlinePartnerId}`);
    redis.values.delete(`matchmaking:entry:${onlinePartnerId}`);
    await redis.zrem('matchmaking:queue', onlinePartnerId);
    now += 20_000;

    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    expect(offlineCandidateRepository.findEligible).not.toHaveBeenCalled();

    now += OFFLINE_FALLBACK_DELAY_SEC * 1000;
    expect(await service.tryAtomicMatch(requesterId)).toMatchObject({ source: 'offline' });
  });

  it('rechecks online candidates after the offline database lookup', async () => {
    saveEntry(entry(requesterId, Gender.MALE, ChatPreference.FEMALE));
    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    now += OFFLINE_FALLBACK_DELAY_SEC * 1000;

    offlineCandidateRepository.findEligible.mockImplementationOnce(async () => {
      saveEntry(entry(onlinePartnerId, Gender.FEMALE, ChatPreference.MALE));
      return [
        {
          userId: offlinePartnerId,
          gender: Gender.FEMALE,
          preference: ChatPreference.MALE,
        },
      ];
    });

    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    expect(roomService.createRoomIfAvailable).not.toHaveBeenCalled();
    expect(redis.values.has(`matchmaking:offline-grace:${requesterId}`)).toBe(false);
  });

  it('does not reset grace for a user who comes online with an incompatible preference', async () => {
    saveEntry(entry(requesterId, Gender.MALE, ChatPreference.FEMALE));
    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    now += OFFLINE_FALLBACK_DELAY_SEC * 1000;

    offlineCandidateRepository.findEligible.mockImplementationOnce(async () => {
      saveEntry(entry(offlinePartnerId, Gender.FEMALE, ChatPreference.FEMALE));
      return [
        {
          userId: offlinePartnerId,
          gender: Gender.FEMALE,
          preference: ChatPreference.MALE,
        },
      ];
    });

    expect(await service.tryAtomicMatch(requesterId)).toBeNull();
    expect(roomService.createRoomIfAvailable).not.toHaveBeenCalled();
    expect(redis.values.has(`matchmaking:offline-grace:${requesterId}`)).toBe(true);
  });
});
