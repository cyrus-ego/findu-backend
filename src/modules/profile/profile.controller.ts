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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserDocument } from '../user/entities/user.schema';
import { avatarMulterOptions } from './config/multer.config';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { ProfileResponseDto } from '../../common/swagger/dto/responses/profile-response.dto';

const MAX_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10);

@ApiTags('profile')
@ApiBearerAuth('access-token')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Xem hồ sơ của mình' })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiStandardErrors()
  getMyProfile(@CurrentUser() user: UserDocument) {
    return this.profileService.getMyProfile(user);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo hồ sơ (lần đầu)' })
  @ApiSuccessResponse(ProfileResponseDto, { status: 201 })
  @ApiStandardErrors()
  createProfile(@CurrentUser() user: UserDocument, @Body() dto: CreateProfileDto) {
    return this.profileService.createProfile(user, dto);
  }

  @Put()
  @ApiOperation({ summary: 'Tạo mới hoặc cập nhật toàn bộ hồ sơ' })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiStandardErrors()
  upsertProfile(@CurrentUser() user: UserDocument, @Body() dto: CreateProfileDto) {
    return this.profileService.upsertProfile(user, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Cập nhật một phần hồ sơ' })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiStandardErrors()
  updateProfile(@CurrentUser() user: UserDocument, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Xóa hồ sơ' })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiStandardErrors()
  deleteProfile(@CurrentUser() user: UserDocument) {
    return this.profileService.deleteProfile(user);
  }

  @Post('avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarMulterOptions))
  @ApiOperation({ summary: 'Upload ảnh đại diện' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: {
        avatar: { type: 'string', format: 'binary', description: 'JPEG, PNG, WebP, GIF' },
      },
    },
  })
  @ApiSuccessResponse(ProfileResponseDto)
  @ApiStandardErrors()
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
