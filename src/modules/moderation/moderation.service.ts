import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationRepository } from './moderation.repository';
import { ReportDto } from './dto/report.dto';
import {
  getMaxMessagesPerMinute,
  getMinMessageIntervalMs,
} from '../../config/rate-limit.util';

export interface ModerationResult {
  isViolation: boolean;
  reason?: string;
  severity?: 'warn' | 'block';
}

/** Từ cấm cơ bản — mở rộng qua admin sau */
const BANNED_WORDS = [
  'địt', 'đụ', 'lồn', 'cặc', 'buồi', 'đéo', 'vcl', 'vl', 'cc', 'cl',
  'fuck', 'shit', 'bitch', 'asshole',
];

const PHONE_REGEX = /(0|\+84)(3[2-9]|5[6-9]|7[06-9]|8[1-9]|9[0-9])\d{7}/;
const LINK_REGEX = /https?:\/\/[^\s]+|www\.[^\s]+/i;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const ZALO_FB_REGEX = /(zalo|facebook|fb)\s*[:.]?\s*\S+/i;
const TELEGRAM_REGEX = /(telegram|tele)\s*[:.]?\s*@\S+/i;

const DUPLICATE_WINDOW_MS = 5000;

interface SpamEntry {
  timestamps: number[];
  lastContent: string;
  lastContentAt: number;
}

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly spamTracker = new Map<string, SpamEntry>();
  private readonly maxMessagesPerMinute: number;
  private readonly minIntervalMs: number;

  constructor(
    private readonly moderationRepository: ModerationRepository,
    config: ConfigService,
  ) {
    this.maxMessagesPerMinute = getMaxMessagesPerMinute(config);
    this.minIntervalMs = getMinMessageIntervalMs(config);
  }

  /** Kiểm duyệt text + anti-spam */
  moderateMessage(userId: string, roomId: string, text: string): ModerationResult {
    const contentCheck = this.checkText(text);
    if (contentCheck.isViolation) return contentCheck;

    const spamCheck = this.checkSpam(userId, roomId, text);
    if (spamCheck.isViolation) return spamCheck;

    return { isViolation: false };
  }

  checkText(text: string): ModerationResult {
    const lower = text.toLowerCase().trim();

    for (const word of BANNED_WORDS) {
      if (lower.includes(word)) {
        this.logger.warn(`Từ cấm: "${word}"`);
        return { isViolation: true, reason: 'Nội dung không phù hợp với quy tắc cộng đồng', severity: 'warn' };
      }
    }

    if (PHONE_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ số điện thoại', severity: 'warn' };
    }
    if (LINK_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ đường link', severity: 'warn' };
    }
    if (EMAIL_REGEX.test(text)) {
      return { isViolation: true, reason: 'Không được chia sẻ email', severity: 'warn' };
    }
    if (ZALO_FB_REGEX.test(lower)) {
      return { isViolation: true, reason: 'Không được chia sẻ thông tin liên hệ mạng xã hội', severity: 'warn' };
    }
    if (TELEGRAM_REGEX.test(lower)) {
      return { isViolation: true, reason: 'Không được chia sẻ thông tin liên hệ', severity: 'warn' };
    }

    return { isViolation: false };
  }

  checkSpam(userId: string, roomId: string, text: string): ModerationResult {
    const key = `${roomId}:${userId}`;
    const now = Date.now();
    let entry = this.spamTracker.get(key);

    if (!entry) {
      entry = { timestamps: [], lastContent: '', lastContentAt: 0 };
      this.spamTracker.set(key, entry);
    }

    // Chống gửi trùng liên tiếp
    if (
      entry.lastContent === text.trim() &&
      now - entry.lastContentAt < DUPLICATE_WINDOW_MS
    ) {
      return { isViolation: true, reason: 'Không gửi tin nhắn trùng lặp', severity: 'warn' };
    }

    // Khoảng cách tối thiểu giữa 2 tin
    const lastTs = entry.timestamps[entry.timestamps.length - 1];
    if (lastTs && now - lastTs < this.minIntervalMs) {
      return { isViolation: true, reason: 'Bạn gửi tin quá nhanh, hãy chậm lại', severity: 'warn' };
    }

    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    entry.timestamps.push(now);

    if (entry.timestamps.length > this.maxMessagesPerMinute) {
      return { isViolation: true, reason: 'Bạn gửi quá nhiều tin nhắn. Hãy chờ một lát.', severity: 'block' };
    }

    entry.lastContent = text.trim();
    entry.lastContentAt = now;

    return { isViolation: false };
  }

  clearSpamTracker(userId: string, roomId: string) {
    this.spamTracker.delete(`${roomId}:${userId}`);
  }

  async checkImage(_filename: string, mimetype: string): Promise<ModerationResult> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(mimetype)) {
      return { isViolation: true, reason: 'Định dạng ảnh không được hỗ trợ' };
    }
    return { isViolation: false };
  }

  async createReport(reporterId: string, dto: ReportDto) {
    const report = await this.moderationRepository.createReport(reporterId, dto);
    this.logger.warn(`Report: ${reporterId} → ${dto.reportedUserId} (${dto.reason})`);
    return report;
  }
}
