import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { RoomService } from '../room/room.service';
import { SendMessageDto } from './dto/send-message.dto';
import { MessageType } from './entities/message.schema';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { chatImageMulterOptions } from './config/chat-multer.config';
import { ConfigService } from '@nestjs/config';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { ChatImageUploadResponseDto, ChatMessagesPageResponseDto } from './dto/chat-response.dto';

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);

@ApiTags('chat')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
    private readonly roomService: RoomService,
    private readonly config: ConfigService,
  ) {}

  @Get(':roomId/messages')
  @ApiOperation({
    summary: 'Lấy thêm tin nhắn cũ hơn trong phòng chat',
    description:
      'Dùng khi mobile scroll lên: truyền beforeMessageId là id tin nhắn cũ nhất client đang có. Response luôn ordered ascending by createdAt.',
  })
  @ApiParam({ name: 'roomId', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @ApiQuery({
    name: 'beforeMessageId',
    required: false,
    example: '665a1b2c3d4e5f6789012348',
  })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiSuccessResponse(ChatMessagesPageResponseDto)
  @ApiStandardErrors()
  async getMessages(
    @CurrentUser() user: UserDocument,
    @Param('roomId') roomId: string,
    @Query('beforeMessageId') beforeMessageId?: string,
    @Query('limit') rawLimit?: string,
  ) {
    const userId = String(user._id);
    const room = await this.roomService.getRoom(roomId);
    if (!this.roomService.isParticipant(room, userId)) {
      throw new ForbiddenException('Không có quyền trong phòng này');
    }

    const limit = this.parseMessageLimit(rawLimit);
    const { messages, hasMore } = await this.chatService.getRoomMessagesBefore(
      roomId,
      beforeMessageId,
      limit,
    );

    const base = this.getAppBaseUrl();
    const payloads = messages.map((m) => {
      const senderId = m.senderId.toString();
      const payload = this.chatService.toMessagePayload(
        m,
        this.roomService.getAlias(room, senderId),
      );
      if (payload.imageUrl && payload.imageUrl.startsWith('/')) {
        payload.imageUrl = `${base}${payload.imageUrl}`;
      }
      return payload;
    });

    return {
      messages: payloads,
      nextBeforeMessageId: payloads.length > 0 ? payloads[0].id : null,
      hasMore,
    };
  }

  @Post(':roomId/image')
  @UseInterceptors(FileInterceptor('image', chatImageMulterOptions))
  @ApiOperation({
    summary: 'Upload ảnh trong phòng chat',
    description: 'Text chat qua WebSocket event chat:send — không có REST endpoint',
  })
  @ApiParam({ name: 'roomId', example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP, GIF' },
      },
    },
  })
  @ApiSuccessResponse(ChatImageUploadResponseDto, { status: 201 })
  @ApiStandardErrors()
  async uploadImage(
    @CurrentUser() user: UserDocument,
    @Param('roomId') roomId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_SIZE_MB * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp|gif)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const userId = String(user._id);
    const room = await this.roomService.getRoom(roomId);
    if (!this.roomService.isParticipant(room, userId)) {
      throw new ForbiddenException('Không có quyền trong phòng này');
    }

    const imagePath = `/uploads/chat/${file.filename}`;
    const alias = this.roomService.getAlias(room, userId);

    const dto: SendMessageDto = {
      roomId,
      type: MessageType.IMAGE,
      imageUrl: imagePath,
    };

    const message = await this.chatService.saveMessage(userId, alias, dto, file.mimetype);
    const port = this.config.get<number>('PORT', 3000);
    const base = this.config.get<string>('APP_URL', `http://localhost:${port}`);
    const payload = this.chatService.toMessagePayload(message, alias, `${base}${imagePath}`);

    this.chatGateway.broadcastMessage(roomId, payload);

    return { message: payload };
  }

  private parseMessageLimit(rawLimit?: string): number {
    if (!rawLimit) return 50;

    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit phải là số nguyên từ 1 đến 100');
    }

    return limit;
  }

  private getAppBaseUrl(): string {
    const port = this.config.get<number>('PORT', 3000);
    return this.config.get<string>('APP_URL', `http://localhost:${port}`);
  }
}
