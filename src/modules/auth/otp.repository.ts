import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Otp, OtpDocument } from './entities/otp.schema';

@Injectable()
export class OtpRepository {
  constructor(@InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>) {}

  /** Tạo OTP mới, xóa OTP cũ cùng email+type trước đó */
  async createOtp(email: string, code: string, type: string): Promise<OtpDocument> {
    // Xóa OTP cũ cùng email+type
    await this.otpModel.deleteMany({ email: email.toLowerCase(), type });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 phút
    return this.otpModel.create({ email: email.toLowerCase(), code, type, expiresAt });
  }

  /** Tìm OTP hợp lệ (chưa dùng, chưa hết hạn) */
  async findValid(email: string, code: string, type: string): Promise<OtpDocument | null> {
    return this.otpModel.findOne({
      email: email.toLowerCase(),
      code,
      type,
      used: false,
      expiresAt: { $gt: new Date() },
    });
  }

  /** Đánh dấu OTP đã dùng */
  async markUsed(id: string): Promise<void> {
    await this.otpModel.findByIdAndUpdate(id, { used: true });
  }
}
