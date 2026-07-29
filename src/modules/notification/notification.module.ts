import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { FcmToken, FcmTokenSchema } from './entities/fcm-token.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: FcmToken.name, schema: FcmTokenSchema }])],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
