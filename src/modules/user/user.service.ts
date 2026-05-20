import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { User, UserDocument } from './entities/user.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponse } from './dto/user-response.dto';
import { UserNotFoundException } from '../../common/exceptions/app.exceptions';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userRepository.findById(id);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userRepository.findByEmail(email);
  }

  create(data: Partial<User>): Promise<UserDocument> {
    return this.userRepository.create(data);
  }

  updateById(id: string, data: Partial<UserDocument>): Promise<UserDocument | null> {
    return this.userRepository.updateById(id, data);
  }

  updateByEmail(email: string, data: Partial<UserDocument>): Promise<UserDocument | null> {
    return this.userRepository.updateByEmail(email, data);
  }

  ban(id: string): Promise<UserDocument | null> {
    return this.userRepository.ban(id);
  }

  /** Lấy thông tin user hiện tại (đã sanitize) */
  async getMe(user: UserDocument) {
    return toUserResponse(user);
  }

  /** Cập nhật thông tin cơ bản của user */
  async updateMe(userId: string, dto: UpdateUserDto) {
    const updated = await this.userRepository.updateById(userId, dto);
    if (!updated) throw new UserNotFoundException();
    return toUserResponse(updated);
  }

  /** Cập nhật avatar URL trên User (đồng bộ với Profile) */
  async updateAvatar(userId: string, avatarUrl: string): Promise<UserDocument | null> {
    return this.userRepository.updateById(userId, { avatar: avatarUrl });
  }
}
