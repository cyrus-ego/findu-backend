import { IsString } from 'class-validator';

export class BlockUserDto {
  @IsString()
  targetUserId: string;
}
