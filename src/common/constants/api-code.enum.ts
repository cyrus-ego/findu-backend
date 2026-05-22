/**
 * Mã lỗi/trạng thái API chuẩn — dùng chung backend ↔ client (Next/Flutter).
 * Quy ước: SCREAMING_SNAKE_CASE, dạng <DOMAIN>_<DETAIL>.
 *
 * KHÔNG đổi tên mã đã release để tránh vỡ client.
 */
export enum ApiCode {
  // ─── Chung ────────────────────────────────────────────────
  OK = 'OK',
  CREATED = 'CREATED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  NOT_FOUND = 'NOT_FOUND',
  FORBIDDEN = 'FORBIDDEN',

  // ─── Auth ─────────────────────────────────────────────────
  AUTH_UNAUTHORIZED = 'AUTH_UNAUTHORIZED',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_EMAIL_EXISTS = 'AUTH_EMAIL_EXISTS',
  AUTH_INVALID_OTP = 'AUTH_INVALID_OTP',
  AUTH_OTP_EXPIRED = 'AUTH_OTP_EXPIRED',
  AUTH_EMAIL_NOT_VERIFIED = 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_REFRESH_FAILED = 'AUTH_REFRESH_FAILED',
  AUTH_USER_BANNED = 'AUTH_USER_BANNED',

  // ─── User / Profile ───────────────────────────────────────
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_ALREADY_EXISTS = 'PROFILE_ALREADY_EXISTS',
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',

  // ─── Matchmaking ──────────────────────────────────────────
  MATCHMAKING_ALREADY_IN_QUEUE = 'MATCHMAKING_ALREADY_IN_QUEUE',
  MATCHMAKING_TIMEOUT = 'MATCHMAKING_TIMEOUT',

  // ─── Room / Chat ──────────────────────────────────────────
  ROOM_NOT_FOUND = 'ROOM_NOT_FOUND',
  ROOM_FORBIDDEN = 'ROOM_FORBIDDEN',
  CHAT_MODERATION_BLOCKED = 'CHAT_MODERATION_BLOCKED',
  CHAT_SPAM_DETECTED = 'CHAT_SPAM_DETECTED',
  CHAT_BLOCKED_BY_USER = 'CHAT_BLOCKED_BY_USER',

  // ─── Upload ───────────────────────────────────────────────
  UPLOAD_INVALID_FILE = 'UPLOAD_INVALID_FILE',
  UPLOAD_TOO_LARGE = 'UPLOAD_TOO_LARGE',
}
