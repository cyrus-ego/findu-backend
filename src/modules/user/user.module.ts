import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { User, UserSchema } from './entities/user.schema';
import { NotificationModule } from '../notification/notification.module';
import {
  AccountDeletionRequest,
  AccountDeletionRequestSchema,
} from './entities/account-deletion-request.schema';
import { AccountDeletionRequestRepository } from './account-deletion-request.repository';
import { AccountDeletionRequestService } from './account-deletion-request.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AccountDeletionRequest.name, schema: AccountDeletionRequestSchema },
    ]),
    NotificationModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserRepository,
    AccountDeletionRequestService,
    AccountDeletionRequestRepository,
  ],
  exports: [UserService],
})
export class UserModule {}
