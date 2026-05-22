import { ApiProperty } from '@nestjs/swagger';

export class BlocklistEntryResponseDto {
  @ApiProperty({ example: '665a1b2c3d4e5f6789012349' })
  _id: string;

  @ApiProperty({ example: '665a1b2c3d4e5f6789012345' })
  blockerId: string;

  @ApiProperty({ example: '665a1b2c3d4e5f6789012347' })
  blockedId: string;

  @ApiProperty({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  createdAt: string;

  @ApiProperty({ example: '2026-05-22T10:00:00.000Z', format: 'date-time' })
  updatedAt: string;
}
