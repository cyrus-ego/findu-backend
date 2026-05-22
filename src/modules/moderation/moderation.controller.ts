import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ModerationService } from './moderation.service';
import { ReportDto } from './dto/report.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { ReportCreatedResponseDto } from '../../common/swagger/dto/responses/message-response.dto';

@ApiTags('moderation')
@ApiBearerAuth('access-token')
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('report')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Báo cáo user trong phòng chat' })
  @ApiSuccessResponse(ReportCreatedResponseDto, { status: 201 })
  @ApiStandardErrors()
  async report(@CurrentUser() user: UserDocument, @Body() dto: ReportDto) {
    const report = await this.moderationService.createReport(String(user._id), dto);
    return {
      message: 'Đã ghi nhận báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn.',
      reportId: String(report._id),
    };
  }
}
