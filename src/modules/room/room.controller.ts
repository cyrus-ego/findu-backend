import { Controller, Get, Param, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { RoomSessionResponseDto } from '../../common/swagger/dto/responses/room-response.dto';

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Get(':roomId')
  @ApiOperation({ summary: 'Thông tin phiên chat ẩn danh' })
  @ApiParam({ name: 'roomId', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @ApiSuccessResponse(RoomSessionResponseDto)
  @ApiStandardErrors()
  async getRoom(@CurrentUser() user: UserDocument, @Param('roomId') roomId: string) {
    const userId = String(user._id);
    const room = await this.roomService.getRoom(roomId);
    if (!this.roomService.isParticipant(room, userId)) {
      throw new ForbiddenException('Không có quyền truy cập phòng này');
    }

    const partnerId = this.roomService.getPartnerUserId(room, userId);
    const session = await this.roomService.getRoomSession(roomId, userId, false);

    return {
      ...session,
      partnerUserId: partnerId,
    };
  }
}
