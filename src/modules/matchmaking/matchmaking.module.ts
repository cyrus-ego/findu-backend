import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';

@Module({
  providers: [MatchmakingService, MatchmakingGateway],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
