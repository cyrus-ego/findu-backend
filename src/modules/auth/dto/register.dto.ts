import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Mật khẩu ít nhất 6 ký tự' })
  @MaxLength(50)
  password: string;

  @IsString()
  @MinLength(2, { message: 'Tên hiển thị ít nhất 2 ký tự' })
  @MaxLength(30)
  displayName: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
