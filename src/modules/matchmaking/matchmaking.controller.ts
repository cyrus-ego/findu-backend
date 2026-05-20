import { Controller, Post, Delete, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MatchmakingService } from './matchmaking.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';

/**
 * REST API ghép đôi — bổ sung WebSocket cho real-time.
 * Client nên kết nối socket /matchmaking sau khi join để nhận match:found.
 */
@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  /**
   * POST /api/matchmaking/join
   * Tìm người tâm sự — đưa vào Redis Queue
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async join(@CurrentUser() user: UserDocument, @Body() dto: JoinQueueDto) {
    // socketId tạm — cập nhật khi client connect WebSocket (queue:sync)
    const status = await this.matchmakingService.joinQueue(
      String(user._id),
      `pending:${user._id}`,
      dto,
    );
    return status;
  }

  /**
   * DELETE /api/matchmaking/leave
   * Huỷ tìm kiếm
   */
  @Delete('leave')
  @HttpCode(HttpStatus.OK)
  async leave(@CurrentUser() user: UserDocument) {
    await this.matchmakingService.leaveQueue(String(user._id));
    return { message: 'Đã rời hàng đợi' };
  }

  /**
   * GET /api/matchmaking/status
   * Vị trí chờ thực tế
   */
  @Get('status')
  async status(@CurrentUser() user: UserDocument) {
    return this.matchmakingService.getStatus(String(user._id));
  }
}
