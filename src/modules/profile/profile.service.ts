import { Injectable } from '@nestjs/common';
import { ProfileRepository } from './profile.repository';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly profileRepository: ProfileRepository) {}

  getProfile(userId: string) {
    return this.profileRepository.findByUserId(userId);
  }

  createOrUpdate(userId: string, dto: CreateProfileDto | UpdateProfileDto) {
    return this.profileRepository.upsert(userId, { ...dto, userId: userId as any });
  }
}
