import { Controller, Post, Delete, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { BlocklistService } from './blocklist.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiStandardErrors, ApiSuccessResponse } from '../../common/swagger/swagger.decorators';
import { BlocklistEntryResponseDto } from './dto/blocklist-response.dto';
import { MessageResponseDto } from '../../common/dto/message-response.dto';

@ApiTags('blocklist')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('blocklist')
export class BlocklistController {
  constructor(private readonly blocklistService: BlocklistService) {}

  @Post(':targetUserId')
  @ApiOperation({ summary: 'Chặn user' })
  @ApiParam({ name: 'targetUserId', example: '665a1b2c3d4e5f6789012347' })
  @ApiSuccessResponse(BlocklistEntryResponseDto, { status: 201 })
  @ApiStandardErrors()
  block(@CurrentUser() user: any, @Param('targetUserId') targetUserId: string) {
    return this.blocklistService.block(user._id, targetUserId);
  }

  @Delete(':targetUserId')
  @ApiOperation({ summary: 'Bỏ chặn user' })
  @ApiParam({ name: 'targetUserId', example: '665a1b2c3d4e5f6789012347' })
  @ApiSuccessResponse(MessageResponseDto)
  @ApiStandardErrors()
  unblock(@CurrentUser() user: any, @Param('targetUserId') targetUserId: string) {
    return this.blocklistService.unblock(user._id, targetUserId);
  }
}
