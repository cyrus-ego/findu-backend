import { RoomDocument } from './entities/room.schema';

/** Lấy giá trị từ Mongoose Map hoặc plain object */
export function getMapValue(map: Map<string, string> | Record<string, string> | undefined, key: string): string | undefined {
  if (!map) return undefined;
  if (map instanceof Map) {
    return map.get(key) || map.get(String(key));
  }
  return map[key] || map[String(key)];
}

export function getParticipantAlias(room: RoomDocument, userId: string): string {
  return getMapValue(room.anonymousNames as any, userId) || 'Stranger';
}

export function getParticipantAvatar(room: RoomDocument, userId: string): string {
  return getMapValue(room.anonymousAvatars as any, userId) || '';
}

export function getPartnerUserId(room: RoomDocument, userId: string): string | null {
  const partner = room.participants.find((p) => p.toString() !== userId);
  return partner ? partner.toString() : null;
}
