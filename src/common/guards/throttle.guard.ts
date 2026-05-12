import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Dùng IP thực từ proxy hoặc IP trực tiếp
    return req.ips?.length ? req.ips[0] : req.ip;
  }
}
