import { Controller, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { BlocklistService } from './blocklist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('blocklist')
@UseGuards(JwtAuthGuard)
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Post(':targetUserId')
  block(@CurrentUser() user: any, @Param('targetUserId') targetUserId: string) {
    return this.blocklistService.block(user._id, targetUserId);
  }

  @Delete(':targetUserId')
  unblock(@CurrentUser() user: any, @Param('targetUserId') targetUserId: string) {
    return this.blocklistService.unblock(user._id, targetUserId);
  }
}
