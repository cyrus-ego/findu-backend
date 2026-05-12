import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { User, UserSchema } from './entities/user.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
