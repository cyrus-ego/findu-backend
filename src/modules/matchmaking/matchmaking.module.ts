import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { ProfileModule } from '../profile/profile.module';
import { BlocklistModule } from '../blocklist/blocklist.module';
import { RoomModule } from '../room/room.module';
import { NotificationModule } from '../notification/notification.module';
import { OfflineCandidateRepository } from './offline-candidate.repository';
import { Profile, ProfileSchema } from '../profile/entities/profile.schema';
import { User, UserSchema } from '../user/entities/user.schema';
import { FcmToken, FcmTokenSchema } from '../notification/entities/fcm-token.schema';
import { Room, RoomSchema } from '../room/entities/room.schema';

@Module({
  imports: [
    ProfileModule,
    BlocklistModule,
    RoomModule,
    NotificationModule,
    MongooseModule.forFeature([
      { name: Profile.name, schema: ProfileSchema },
      { name: User.name, schema: UserSchema },
      { name: FcmToken.name, schema: FcmTokenSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [MatchmakingController],
  providers: [MatchmakingService, MatchmakingGateway, OfflineCandidateRepository],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
