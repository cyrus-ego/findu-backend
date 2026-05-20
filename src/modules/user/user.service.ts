import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';
import { UserDocument } from './entities/user.schema';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  findById(id: string): Promise<UserDocument | null> {
    return this.userRepository.findById(id);
  }

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userRepository.findByEmail(email);
  }

  create(data: any): Promise<UserDocument> {
    return this.userRepository.create(data);
  }

  /** Cập nhật theo MongoDB _id */
  updateById(id: string, data: any): Promise<UserDocument | null> {
    return this.userRepository.updateById(id, data);
  }

  /** Cập nhật theo email (dùng khi verify OTP) */
  updateByEmail(email: string, data: any): Promise<UserDocument | null> {
    return this.userRepository.updateByEmail(email, data);
  }

  ban(id: string): Promise<UserDocument | null> {
    return this.userRepository.ban(id);
  }
}
