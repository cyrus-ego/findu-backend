import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Gender, ChatPreference } from '../entities/profile.schema';

export class UpdateProfileDto {
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsInt()
  @Min(13)
  @Max(99)
  age?: number;

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
