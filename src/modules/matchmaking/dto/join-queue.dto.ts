import { IsEnum, IsOptional } from 'class-validator';
import { Gender, ChatPreference } from '../../profile/entities/profile.schema';

export class JoinQueueDto {
  @IsOptional()
  @IsEnum(ChatPreference)
  preference?: ChatPreference;

  @IsOptional()
  @IsEnum(Gender)
  preferredGender?: Gender;
}
