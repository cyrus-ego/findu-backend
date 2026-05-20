import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ModerationService } from './moderation.service';
import { ReportDto } from './dto/report.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';

@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  /** POST /api/moderation/report — Báo cáo user trong phòng */
  @Post('report')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async report(@CurrentUser() user: UserDocument, @Body() dto: ReportDto) {
    const report = await this.moderationService.createReport(String(user._id), dto);
    return {
      message: 'Đã ghi nhận báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn.',
      reportId: String(report._id),
    };
  }
}
