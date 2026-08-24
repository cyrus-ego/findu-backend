import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from './entities/user.schema';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { UserResponseDto } from './dto/user-response.dto';
import { NotificationService } from '../notification/notification.service';
import { RegisterFcmTokenDto, UnregisterFcmTokenDto } from '../notification/dto/fcm-token.dto';
import { MessageResponseDto } from '../../common/dto/message-response.dto';
import { AccountDeletionRequestService } from './account-deletion-request.service';
import { AccountDeletionRequestResponseDto } from './dto/account-deletion-request-response.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly notificationService: NotificationService,
    private readonly accountDeletionRequestService: AccountDeletionRequestService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Thông tin tài khoản đang đăng nhập' })
  @ApiSuccessResponse(UserResponseDto)
  @ApiStandardErrors()
  getMe(@CurrentUser() user: UserDocument) {
    return this.userService.getMe(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Cập nhật tên hiển thị / avatar URL' })
  @ApiSuccessResponse(UserResponseDto)
  @ApiStandardErrors()
  updateMe(@CurrentUser() user: UserDocument, @Body() dto: UpdateUserDto) {
    return this.userService.updateMe(String(user._id), dto);
  }

  @Get('me/deletion-request')
  @ApiOperation({ summary: 'Xem trạng thái yêu cầu xóa tài khoản gần nhất' })
  @ApiSuccessResponse(AccountDeletionRequestResponseDto)
  @ApiStandardErrors()
  getDeletionRequest(@CurrentUser() user: UserDocument) {
    return this.accountDeletionRequestService.getLatest(String(user._id));
  }

  @Post('me/deletion-request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ghi nhận yêu cầu xóa tài khoản và dữ liệu liên quan' })
  @ApiSuccessResponse(AccountDeletionRequestResponseDto)
  @ApiStandardErrors()
  requestAccountDeletion(@CurrentUser() user: UserDocument) {
    return this.accountDeletionRequestService.requestDeletion(user);
  }

  @Post('me/fcm-tokens')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dang ky FCM token cua thiet bi hien tai' })
  @ApiSuccessResponse(MessageResponseDto)
  @ApiStandardErrors()
  async registerFcmToken(@CurrentUser() user: UserDocument, @Body() dto: RegisterFcmTokenDto) {
    await this.notificationService.registerToken(String(user._id), dto);
    return { message: 'FCM token da duoc cap nhat' };
  }

  @Delete('me/fcm-tokens')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Go FCM token khoi tai khoan hien tai' })
  @ApiStandardErrors()
  async unregisterFcmToken(@CurrentUser() user: UserDocument, @Body() dto: UnregisterFcmTokenDto) {
    await this.notificationService.unregisterToken(String(user._id), dto.token);
  }
}
