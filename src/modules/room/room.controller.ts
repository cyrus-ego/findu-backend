import { Controller, Get, Post, Param, ForbiddenException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { ChatGateway } from '../chat/chat.gateway';
import { ChatService } from '../chat/chat.service';
import { ModerationService } from '../moderation/moderation.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { RoomDetailResponseDto, ActiveRoomResponseDto } from './dto/room-session.dto';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { MessageType } from '../chat/entities/message.schema';

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly chatGateway: ChatGateway,
    private readonly chatService: ChatService,
    private readonly moderationService: ModerationService,
  ) {}

  @Get('active')
  @ApiOperation({ summary: 'Kiểm tra user có phòng chat đang hoạt động không' })
  @ApiSuccessResponse(ActiveRoomResponseDto)
  @ApiStandardErrors()
  async getActiveRoom(@CurrentUser() user: UserDocument) {
    const userId = String(user._id);
    const room = await this.roomService.getActiveRoomForUser(userId);

    if (!room) {
      return { hasActiveRoom: false, roomId: null };
    }

    return { hasActiveRoom: true, roomId: room.roomId };
  }

  @Post(':roomId/leave')
  @ApiOperation({ summary: 'Rời phòng chat (REST fallback cho mobile khi socket không khả dụng)' })
  @ApiParam({ name: 'roomId', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @ApiSuccessResponse(MessageResponseDto, { description: 'Đã rời phòng' })
  @ApiStandardErrors()
  async leaveRoom(@CurrentUser() user: UserDocument, @Param('roomId') roomId: string) {
    const userId = String(user._id);
    const room = await this.roomService.getRoom(roomId);
    if (!this.roomService.isParticipant(room, userId)) {
      throw new ForbiddenException('Không có quyền truy cập phòng này');
    }

    // Thông báo cho các socket đang trong phòng (nếu có)
    this.chatGateway.server.to(roomId).emit('chat:message', {
      senderAlias: 'System',
      type: MessageType.SYSTEM,
      content: 'Đối phương đã rời phòng.',
    });
    this.chatGateway.server.to(roomId).emit('room:closed', { roomId });
    this.chatGateway.server.in(roomId).socketsLeave(roomId);

    // Đóng phòng + xoá tin nhắn + dọn tracker
    await this.roomService.closeRoom(roomId);
    await this.chatService.deleteRoomMessages(roomId);
    for (const uid of room.participants.map((p) => p.toString())) {
      this.moderationService.clearSpamTracker(uid, roomId);
    }

    return { message: 'Đã rời phòng' };
  }

  @Get(':roomId')
  @ApiOperation({ summary: 'Thông tin phiên chat ẩn danh' })
  @ApiParam({ name: 'roomId', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @ApiSuccessResponse(RoomDetailResponseDto)
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
