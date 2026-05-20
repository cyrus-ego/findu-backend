import { Controller, Get, Param, ForbiddenException } from '@nestjs/common';
import { RoomService } from './room.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  /** GET /api/rooms/:roomId — Thông tin phiên ẩn danh (trước khi vào socket) */
  @Get(':roomId')
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
