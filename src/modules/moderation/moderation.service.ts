import { Injectable, Logger } from '@nestjs/common';

interface ModerationResult {
  isViolation: boolean;
  reason?: string;
}

/** Danh sách từ cấm cơ bản (mở rộng sau) */
const BANNED_WORDS = ['badword1', 'badword2'];

/** Regex phát hiện số điện thoại VN */
const PHONE_REGEX = /(0|\+84)(3[2-9]|5[6-9]|7[06-9]|8[1-9]|9[0-9])\d{7}/;

/** Regex phát hiện link */
const LINK_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;

/** Regex phát hiện email */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  checkText(text: string): ModerationResult {
    const lower = text.toLowerCase();

    // Kiểm tra từ cấm
    for (const word of BANNED_WORDS) {
      if (lower.includes(word)) {
        this.logger.warn(`Phát hiện từ cấm: "${word}"`);
        return { isViolation: true, reason: 'Nội dung không phù hợp' };
      }
    }

    // Ngăn lộ số điện thoại
    if (PHONE_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ số điện thoại' };
    }

    // Ngăn lộ link
    if (LINK_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ đường link' };
    }

    // Ngăn lộ email
    if (EMAIL_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ email' };
    }

    return { isViolation: false };
  }

  async checkImage(_imageUrl: string): Promise<ModerationResult> {
    // TODO: Tích hợp Google Vision API / AWS Rekognition
    return { isViolation: false };
  }
}
