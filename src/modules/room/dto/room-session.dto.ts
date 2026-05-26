import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoomSessionDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  roomId: string;

  @ApiProperty({ example: 'Stranger#7482' })
  myAlias: string;

  @ApiProperty({ example: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me' })
  myAvatar: string;

  @ApiProperty({ example: 'Stranger#2910' })
  partnerAlias: string;

  @ApiProperty({ example: 'https://api.dicebear.com/7.x/avataaars/svg?seed=partner' })
  partnerAvatar: string;

  @ApiProperty({ example: true })
  partnerOnline: boolean;

  @ApiProperty({ example: true })
  isAnonymous: true;
}

/** GET /rooms/:roomId — thêm partnerUserId cho report/block */
export class RoomDetailResponseDto extends RoomSessionDto {
  @ApiPropertyOptional({
    example: '665a1b2c3d4e5f6789012347',
    description: 'ID đối phương — dùng report/block, không hiển thị UI',
  })
  partnerUserId?: string | null;
}

/** GET /rooms/active — kiểm tra có phòng active không */
export class ActiveRoomResponseDto {
  @ApiProperty({ example: true, description: 'User có phòng active hay không' })
  hasActiveRoom: boolean;

  @ApiProperty({
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    nullable: true,
    description: 'roomId nếu có, null nếu không',
  })
  roomId: string | null;
}
