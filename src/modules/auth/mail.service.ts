import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('MAIL_HOST', 'smtp.gmail.com'),
      port: config.get<number>('MAIL_PORT', 587),
      secure: false,
      // Giữ timeout ngắn để lỗi SMTP không block register flow quá lâu.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      auth: {
        user: config.get<string>('MAIL_USER'),
        pass: config.get<string>('MAIL_PASS'),
      },
    });
  }

  private isMailConfigured(): boolean {
    return Boolean(this.config.get<string>('MAIL_USER')?.trim());
  }

  /** Gửi OTP xác thực email */
  async sendOtpEmail(email: string, otp: string): Promise<void> {
    if (!this.isMailConfigured()) {
      this.logger.warn(`MAIL_USER chưa cấu hình — bỏ qua gửi OTP tới ${email}`);
      return;
    }

    const from = this.config.get<string>(
      'MAIL_FROM',
      'Talk First <noreply@talkfirst.app>',
    );

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: '[Talk First] Mã xác thực email của bạn',
        text: [
          'Talk First',
          '',
          `Mã xác thực email của bạn là: ${otp}`,
          'Nếu không thấy OTP, hãy kiểm tra trong Spam/Thư rác.',
          'Mã có hiệu lực trong 10 phút. Không chia sẻ mã này với ai.',
          '',
          'Nếu bạn không yêu cầu mã này, hãy bỏ qua email.',
        ].join('\n'),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #6d28d9;">Talk First</h2>
            <p>Xin chào,</p>
            <p>Mã xác thực email của bạn là:</p>
            <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; text-align: center;">
              <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #6d28d9;">${otp}</span>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Mã có hiệu lực trong <strong>10 phút</strong>. Không chia sẻ mã này với ai.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb;" />
            <p style="color: #9ca3af; font-size: 12px;">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
          </div>
        `,
      });
      this.logger.log(`Đã gửi OTP đến ${email}`);
    } catch (err) {
      // Log lỗi nhưng không throw để không block register flow trong dev
      this.logger.error(`Không thể gửi email đến ${email}: ${String(err)}`);
    }
  }
}
