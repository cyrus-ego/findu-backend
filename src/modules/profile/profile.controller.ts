import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  getMyProfile(@CurrentUser() user: any) {
    return this.profileService.getProfile(user._id);
  }

  @Put()
  updateProfile(@CurrentUser() user: any, @Body() dto: CreateProfileDto) {
    return this.profileService.createOrUpdate(user._id, dto);
  }
}
