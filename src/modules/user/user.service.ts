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

  updateById(id: string, data: any): Promise<UserDocument | null> {
    return this.userRepository.updateById(id, data);
  }
}
