import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProfileModule } from './modules/profile/profile.module';
import { MatchmakingModule } from './modules/matchmaking/matchmaking.module';
import { RoomModule } from './modules/room/room.module';
import { ChatModule } from './modules/chat/chat.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { BlocklistModule } from './modules/blocklist/blocklist.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { resolveMongoUri } from './config/mongodb.util';
import { getLimitRequest, getThrottleTtlMs } from './config/rate-limit.util';

@Module({
  imports: [
    // Config toàn cục
    ConfigModule.forRoot({ isGlobal: true }),

    // MongoDB
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: resolveMongoUri(config),
      }),
    }),

    // Rate limiting toàn cục — LIMIT_REQUEST (mặc định 200 req / 60s / IP)
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: getThrottleTtlMs(),
          limit: getLimitRequest(config),
        },
      ],
    }),

    // Feature modules
    AuthModule,
    UserModule,
    ProfileModule,
    MatchmakingModule,
    RoomModule,
    ChatModule,
    ModerationModule,
    BlocklistModule,
    GatewayModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
