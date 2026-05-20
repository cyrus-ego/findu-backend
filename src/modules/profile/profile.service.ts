import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProfileRepository } from './profile.repository';
import { UserService } from '../user/user.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { toProfileResponse } from './dto/profile-response.dto';
import {
  ProfileNotFoundException,
  ProfileAlreadyExistsException,
} from '../../common/exceptions/profile.exceptions';
import { UserDocument } from '../user/entities/user.schema';

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  /** GET — Hồ sơ đầy đủ (user + profile) */
  async getMyProfile(user: UserDocument) {
    const profile = await this.profileRepository.findByUserId(String(user._id));
    return toProfileResponse(user, profile);
  }

  /** POST — Tạo hồ sơ mới */
  async createProfile(user: UserDocument, dto: CreateProfileDto) {
    const userId = String(user._id);
    const existing = await this.profileRepository.findByUserId(userId);
    if (existing) throw new ProfileAlreadyExistsException();

    if (dto.displayName) {
      await this.userService.updateById(userId, { displayName: dto.displayName });
    }

    const { displayName: _dn, ...profileData } = dto;
    const profile = await this.profileRepository.create(userId, profileData);

    const updatedUser = (await this.userService.findById(userId))!;
    return toProfileResponse(updatedUser, profile);
  }

  /** PUT — Tạo mới hoặc thay thế toàn bộ */
  async upsertProfile(user: UserDocument, dto: CreateProfileDto) {
    const userId = String(user._id);

    if (dto.displayName) {
      await this.userService.updateById(userId, { displayName: dto.displayName });
    }

    const { displayName: _dn, ...profileData } = dto;
    const profile = await this.profileRepository.upsert(userId, profileData);

    const updatedUser = (await this.userService.findById(userId))!;
    return toProfileResponse(updatedUser, profile);
  }

  /** PATCH — Cập nhật một phần */
  async updateProfile(user: UserDocument, dto: UpdateProfileDto) {
    const userId = String(user._id);
    const existing = await this.profileRepository.findByUserId(userId);
    if (!existing) throw new ProfileNotFoundException();

    if (dto.displayName) {
      await this.userService.updateById(userId, { displayName: dto.displayName });
    }

    const { displayName: _dn, ...profileData } = dto;
    const profile = await this.profileRepository.updateByUserId(userId, profileData);
    const updatedUser = (await this.userService.findById(userId))!;

    return toProfileResponse(updatedUser, profile);
  }

  /** DELETE — Xóa hồ sơ (giữ tài khoản user) */
  async deleteProfile(user: UserDocument) {
    const userId = String(user._id);
    const deleted = await this.profileRepository.deleteByUserId(userId);
    if (!deleted) throw new ProfileNotFoundException();
    return { message: 'Đã xóa hồ sơ' };
  }

  /** POST /avatar — Upload ảnh đại diện */
  async uploadAvatar(user: UserDocument, filename: string) {
    const userId = String(user._id);
    const avatarPath = `/uploads/avatars/${filename}`;

    // Đồng bộ avatar lên cả User và Profile
    await this.userService.updateAvatar(userId, avatarPath);

    let profile = await this.profileRepository.findByUserId(userId);
    if (profile) {
      profile = await this.profileRepository.updateByUserId(userId, { avatar: avatarPath });
    }

    const updatedUser = (await this.userService.findById(userId))!;
    return {
      avatarUrl: avatarPath,
      fullUrl: this.buildPublicUrl(avatarPath),
      profile: toProfileResponse(updatedUser, profile),
    };
  }

  /** Dùng nội bộ matchmaking — lấy profile theo userId */
  async findByUserId(userId: string) {
    return this.profileRepository.findByUserId(userId);
  }

  private buildPublicUrl(path: string): string {
    const port = this.config.get<number>('PORT', 3000);
    const base = this.config.get<string>('APP_URL', `http://localhost:${port}`);
    return `${base}${path}`;
  }
}
