import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Gender, ChatPreference } from '../entities/profile.schema';

export class CreateProfileDto {
  @IsEnum(Gender, { message: 'Giới tính không hợp lệ' })
  gender: Gender;

  @IsInt()
  @Min(13, { message: 'Tuổi tối thiểu 13' })
  @Max(99)
  age: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bio?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsEnum(ChatPreference)
  chatPreference?: ChatPreference;

  @IsOptional()
  @IsEnum(Gender)
  preferredGender?: Gender;
}
