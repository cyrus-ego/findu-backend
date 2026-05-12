import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomService } from './room.service';
import { RoomRepository } from './room.repository';
import { Room, RoomSchema } from './entities/room.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }])],
  providers: [RoomService, RoomRepository],
  exports: [RoomService],
})
export class RoomModule {}
