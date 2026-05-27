import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Gender } from '../../user/entities/user.schema';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @ApiProperty({ example: 'password123', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Mật khẩu ít nhất 6 ký tự' })
  @MaxLength(50)
  password: string;

  @ApiProperty({ example: 'Nguyễn Văn A', minLength: 2 })
  @IsString()
  @MinLength(2, { message: 'Tên hiển thị ít nhất 2 ký tự' })
  @MaxLength(30)
  displayName: string;

  @ApiProperty({ enum: Gender, example: Gender.MALE, description: 'Giới tính' })
  @IsEnum(Gender, { message: 'Giới tính phải là male, female hoặc other' })
  gender: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatar?: string;
}
