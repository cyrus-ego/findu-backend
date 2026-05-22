import { Controller, Post, Delete, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MatchmakingService } from './matchmaking.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { QueueStatusResponseDto } from './dto/queue-status.dto';
import { MessageResponseDto } from '../../common/dto/message-response.dto';

@ApiTags('matchmaking')
@ApiBearerAuth('access-token')
@Controller('matchmaking')
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @Post('join')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Vào hàng đợi ghép đôi',
    description: 'Kết nối WebSocket /matchmaking để nhận match:found realtime',
  })
  @ApiSuccessResponse(QueueStatusResponseDto)
  @ApiStandardErrors()
  async join(@CurrentUser() user: UserDocument, @Body() dto: JoinQueueDto) {
    const status = await this.matchmakingService.joinQueue(
      String(user._id),
      `pending:${user._id}`,
      dto,
    );
    return status;
  }

  @Delete('leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rời hàng đợi' })
  @ApiSuccessResponse(MessageResponseDto)
  @ApiStandardErrors()
  async leave(@CurrentUser() user: UserDocument) {
    await this.matchmakingService.leaveQueue(String(user._id));
    return { message: 'Đã rời hàng đợi' };
  }

  @Get('status')
  @ApiOperation({ summary: 'Trạng thái hàng đợi' })
  @ApiSuccessResponse(QueueStatusResponseDto)
  @ApiStandardErrors()
  async status(@CurrentUser() user: UserDocument) {
    return this.matchmakingService.getStatus(String(user._id));
  }
}
