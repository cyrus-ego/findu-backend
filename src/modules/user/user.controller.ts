import { Controller, Get, Patch, Body } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from './entities/user.schema';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /** GET /api/users/me — Thông tin tài khoản đang đăng nhập */
  @Get('me')
  getMe(@CurrentUser() user: UserDocument) {
    return this.userService.getMe(user);
  }

  /** PATCH /api/users/me — Cập nhật tên hiển thị (và avatar URL nếu có) */
  @Patch('me')
  updateMe(@CurrentUser() user: UserDocument, @Body() dto: UpdateUserDto) {
    return this.userService.updateMe(String(user._id), dto);
  }
}
