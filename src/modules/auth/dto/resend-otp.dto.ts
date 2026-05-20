import { IsEmail } from 'class-validator';

export class ResendOtpDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  email: string;
}
