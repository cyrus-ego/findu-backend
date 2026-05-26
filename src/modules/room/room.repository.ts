import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Room, RoomDocument, RoomStatus } from './entities/room.schema';

@Injectable()
export class RoomRepository {
  constructor(@InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>) {}

  async create(data: Partial<Room>): Promise<RoomDocument> {
    return this.roomModel.create(data);
  }

  async findByRoomId(roomId: string): Promise<RoomDocument | null> {
    return this.roomModel.findOne({ roomId, status: RoomStatus.ACTIVE }).exec();
  }

  async findByRoomIdAny(roomId: string): Promise<RoomDocument | null> {
    return this.roomModel.findOne({ roomId }).exec();
  }

  async findActiveByParticipant(userId: string): Promise<RoomDocument | null> {
    return this.roomModel
      .findOne({
        participants: userId,
        status: RoomStatus.ACTIVE,
      })
      .sort({ createdAt: -1 })
      .exec();
  }

  async closeRoom(roomId: string): Promise<RoomDocument | null> {
    return this.roomModel
      .findOneAndUpdate(
        { roomId },
        { status: RoomStatus.CLOSED, closedAt: new Date() },
        { new: true },
      )
      .exec();
  }
}
