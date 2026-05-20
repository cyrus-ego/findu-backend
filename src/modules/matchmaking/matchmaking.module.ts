import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { ProfileModule } from '../profile/profile.module';
import { BlocklistModule } from '../blocklist/blocklist.module';
import { RoomModule } from '../room/room.module';

@Module({
  imports: [
    ProfileModule,
    BlocklistModule,
    RoomModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [MatchmakingController],
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
