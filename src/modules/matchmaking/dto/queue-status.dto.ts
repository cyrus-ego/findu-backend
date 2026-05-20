export interface QueueStatusResponse {
  inQueue: boolean;
  position: number;
  queueSize: number;
  waitSeconds: number;
  expiresInSeconds: number;
  preference: string;
  preferredGender?: string;
  timedOut: boolean;
}

export interface MatchResult {
  roomId: string;
  partnerId: string;
  partnerSocketId: string;
}
