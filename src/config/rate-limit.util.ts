import { ConfigService } from '@nestjs/config';

const THROTTLE_TTL_MS = 10_000;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** HTTP rate limit toàn cục (req / 60s / IP). Mặc định 200 — phù hợp ~100 user đồng thời. */
export function getLimitRequest(config: ConfigService): number {
  return parsePositiveInt(config.get<string>('LIMIT_REQUEST'), 200);
}

/** Số tin nhắn tối đa mỗi user trong 1 phòng / 60s. Mặc định 25. */
export function getMaxMessagesPerMinute(config: ConfigService): number {
  return parsePositiveInt(config.get<string>('MAX_MESSAGES_PER_MINUTE'), 25);
}

/** Khoảng cách tối thiểu giữa 2 tin (ms). Mặc định 500ms. */
export function getMinMessageIntervalMs(config: ConfigService): number {
  return parsePositiveInt(config.get<string>('MIN_MESSAGE_INTERVAL_MS'), 500);
}

export function getThrottleTtlMs(): number {
  return THROTTLE_TTL_MS;
}
