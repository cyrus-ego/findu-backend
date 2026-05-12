import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileRepository } from './profile.repository';
import { Profile, ProfileSchema } from './entities/profile.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Profile.name, schema: ProfileSchema }])],
  controllers: [ProfileController],
  providers: [ProfileService, ProfileRepository],
  exports: [ProfileService],
})
export class ProfileModule {}
