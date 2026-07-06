import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ChatPreference } from '../../profile/entities/profile.schema';

export class JoinQueueDto {
  @ApiProperty({ example: 'female', enum: ['male', 'female', 'other'] })
  @IsEnum(ChatPreference, { message: 'Preference không hợp lệ' })
  preference: ChatPreference;
}
