import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';
import { OtpRepository } from './otp.repository';
import { Otp, OtpSchema } from './entities/otp.schema';
import { UserModule } from '../user/user.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { createOptionalOAuthProviders } from './oauth.util';

@Module({
  imports: [
    UserModule,
    PassportModule,
    MongooseModule.forFeature([{ name: Otp.name, schema: OtpSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    MailService,
    OtpRepository,
    JwtStrategy,
    LocalStrategy,
    ...createOptionalOAuthProviders(),
    // Apply JwtAuthGuard globally (kết hợp với @Public() decorator)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Apply ThrottlerGuard globally
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
