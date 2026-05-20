import { IsEmail, IsString, Length } from 'class-validator';

export class VerifyEmailDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;

  @IsString()
  @Length(6, 6, { message: 'OTP phải là 6 ký tự số' })
  otp: string;
}
