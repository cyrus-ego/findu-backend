import {
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
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
import { ChatImageUploadResponseDto } from '../../common/swagger/dto/responses/chat-response.dto';

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
    const payload = this.chatService.toMessagePayload(message, alias);

    const fullPayload = {
      ...payload,
      imageUrl: `${base}${imagePath}`,
    };

    this.chatGateway.broadcastMessage(roomId, fullPayload);

    return { message: fullPayload };
  }
}
