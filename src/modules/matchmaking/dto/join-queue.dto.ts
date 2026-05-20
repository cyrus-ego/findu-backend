import { IsEnum, IsOptional } from 'class-validator';
import { Gender, ChatPreference } from '../../profile/entities/profile.schema';

export class JoinQueueDto {
  /** Opposite / Same / Any */
  @IsEnum(ChatPreference, { message: 'Preference không hợp lệ' })
  preference: ChatPreference;

  /** Giới tính đối phương mong muốn (Nam / Nữ / Any) */
  @IsOptional()
  @IsEnum(Gender, { message: 'Giới tính đối phương không hợp lệ' })
  preferredGender?: Gender;
}
