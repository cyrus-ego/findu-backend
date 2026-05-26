import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomService } from './room.service';
import { RoomRepository } from './room.repository';
import { RoomController } from './room.controller';
import { Room, RoomSchema } from './entities/room.schema';
import { ChatModule } from '../chat/chat.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Room.name, schema: RoomSchema }]),
    forwardRef(() => ChatModule),
    ModerationModule,
  ],
  controllers: [RoomController],
  providers: [RoomService, RoomRepository],
  exports: [RoomService],
})
export class RoomModule {}
