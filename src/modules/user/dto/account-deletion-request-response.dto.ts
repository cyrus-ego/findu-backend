import { ApiProperty } from '@nestjs/swagger';
import { AccountDeletionRequestStatus } from '../entities/account-deletion-request.schema';

export class AccountDeletionRequestResponseDto {
  @ApiProperty({ example: true })
  requested: boolean;

  @ApiProperty({ example: '665a1b2c3d4e5f6789012345', nullable: true })
  requestId: string | null;

  @ApiProperty({
    example: AccountDeletionRequestStatus.PENDING,
    enum: [...Object.values(AccountDeletionRequestStatus), 'none'],
  })
  status: AccountDeletionRequestStatus | 'none';

  @ApiProperty({ example: '2026-08-24T08:00:00.000Z', nullable: true })
  requestedAt: string | null;

  @ApiProperty({ example: '2026-09-23T08:00:00.000Z', nullable: true })
  deletionDueAt: string | null;

  @ApiProperty({ example: 'Yêu cầu xóa tài khoản đã được ghi nhận.' })
  message: string;
}
