import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Gender, ChatPreference } from '../entities/profile.schema';

export class CreateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(30, { message: 'Tên hiển thị tối đa 30 ký tự' })
  displayName?: string;

  @IsEnum(Gender, { message: 'Giới tính không hợp lệ' })
  gender: Gender;

  @IsInt()
  @Min(13, { message: 'Tuổi tối thiểu 13' })
  @Max(99, { message: 'Tuổi tối đa 99' })
  age: number;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Bio tối đa 200 ký tự' })
  bio?: string;

  @IsOptional()
  @IsEnum(ChatPreference, { message: 'Preference không hợp lệ' })
  chatPreference?: ChatPreference;

  @IsOptional()
  @IsEnum(Gender, { message: 'Giới tính ưu tiên không hợp lệ' })
  preferredGender?: Gender;
}
