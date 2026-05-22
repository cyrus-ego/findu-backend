import { ApiProperty } from '@nestjs/swagger';
import { BlocklistDocument } from '../entities/blocklist.schema';

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

export function toBlocklistEntryResponse(entry: BlocklistDocument): BlocklistEntryResponseDto {
  return {
    _id: String(entry._id),
    blockerId: String(entry.blockerId),
    blockedId: String(entry.blockedId),
    createdAt: (entry as any).createdAt
      ? new Date((entry as any).createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: (entry as any).updatedAt
      ? new Date((entry as any).updatedAt).toISOString()
      : new Date().toISOString(),
  };
}
