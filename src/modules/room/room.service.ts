import { Injectable } from '@nestjs/common';
import { RoomRepository } from './room.repository';
import { generateAnonymousNickname, generateAnonymousAvatar } from '../../common/utils/nickname.util';
import { RoomNotFoundException } from '../../common/exceptions/app.exceptions';
import { v4 as uuidv4 } from 'uuid';

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
    });
  }

  async getRoom(roomId: string) {
    const room = await this.roomRepository.findByRoomId(roomId);
    if (!room) throw new RoomNotFoundException();
    return room;
  }

  async closeRoom(roomId: string) {
    return this.roomRepository.closeRoom(roomId);
  }
}
