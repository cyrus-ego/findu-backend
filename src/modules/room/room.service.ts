import { Injectable } from '@nestjs/common';
import { RoomRepository } from './room.repository';
import { generateAnonymousNickname, generateAnonymousAvatar } from '../../common/utils/nickname.util';
import { RoomNotFoundException } from '../../common/exceptions/app.exceptions';
import { RoomDocument, RoomStatus } from './entities/room.schema';
import { v4 as uuidv4 } from 'uuid';
import {
  getParticipantAlias,
  getParticipantAvatar,
  getPartnerUserId,
} from './room.utils';
import { RoomSessionDto } from './dto/room-session.dto';

@Injectable()
export class RoomService {
  constructor(private readonly roomRepository: RoomRepository) {}

  async createRoom(participantIds: string[]) {
    const roomId = uuidv4();
    const anonymousNames: Record<string, string> = {};
    const anonymousAvatars: Record<string, string> = {};

    for (const uid of participantIds) {
      anonymousNames[uid] = generateAnonymousNickname();
      anonymousAvatars[uid] = generateAnonymousAvatar(uuidv4());
    }

    return this.roomRepository.create({
      roomId,
      participants: participantIds as any,
      anonymousNames: anonymousNames as any,
      anonymousAvatars: anonymousAvatars as any,
      status: RoomStatus.ACTIVE,
    });
  }

  async getRoom(roomId: string) {
    const room = await this.roomRepository.findByRoomId(roomId);
    if (!room) throw new RoomNotFoundException();
    return room;
  }

  async getRoomSession(
    roomId: string,
    userId: string,
    partnerOnline: boolean,
  ): Promise<RoomSessionDto> {
    const room = await this.getRoom(roomId);
    const partnerId = getPartnerUserId(room, userId);

    return {
      roomId,
      myAlias: getParticipantAlias(room, userId),
      myAvatar: getParticipantAvatar(room, userId),
      partnerAlias: partnerId ? getParticipantAlias(room, partnerId) : 'Stranger',
      partnerAvatar: partnerId ? getParticipantAvatar(room, partnerId) : '',
      partnerOnline,
      isAnonymous: true,
    };
  }

  getPartnerUserId(room: RoomDocument, userId: string): string | null {
    return getPartnerUserId(room, userId);
  }

  getAlias(room: RoomDocument, userId: string): string {
    return getParticipantAlias(room, userId);
  }

  async closeRoom(roomId: string) {
    return this.roomRepository.closeRoom(roomId);
  }

  isParticipant(room: RoomDocument, userId: string): boolean {
    return room.participants.some((p) => p.toString() === userId);
  }
}
