import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { avatarMulterOptions } from './config/multer.config';

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /** GET /api/profile — Xem hồ sơ của mình */
  @Get()
  getMyProfile(@CurrentUser() user: UserDocument) {
    return this.profileService.getMyProfile(user);
  }

  /** POST /api/profile — Tạo hồ sơ (lần đầu) */
  @Post()
  createProfile(@CurrentUser() user: UserDocument, @Body() dto: CreateProfileDto) {
    return this.profileService.createProfile(user, dto);
  }

  /** PUT /api/profile — Tạo mới hoặc cập nhật toàn bộ */
  @Put()
  upsertProfile(@CurrentUser() user: UserDocument, @Body() dto: CreateProfileDto) {
    return this.profileService.upsertProfile(user, dto);
  }

  /** PATCH /api/profile — Cập nhật một phần */
  @Patch()
  updateProfile(@CurrentUser() user: UserDocument, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user, dto);
  }

  /** DELETE /api/profile — Xóa hồ sơ */
  @Delete()
  deleteProfile(@CurrentUser() user: UserDocument) {
    return this.profileService.deleteProfile(user);
  }

  /** POST /api/profile/avatar — Upload ảnh đại diện */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarMulterOptions))
  uploadAvatar(
    @CurrentUser() user: UserDocument,
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
    return this.profileService.uploadAvatar(user, file.filename);
  }
}
