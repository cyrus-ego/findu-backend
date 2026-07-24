export enum ChatErrorCode {
  MODERATION_BLOCKED = 'MODERATION_BLOCKED',
  SPAM_DETECTED = 'SPAM_DETECTED',
  ROOM_CLOSED = 'ROOM_CLOSED',
  ACCESS_DENIED = 'ACCESS_DENIED',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
}

export interface ChatErrorPayload {
  code: ChatErrorCode;
  message: string;
}
