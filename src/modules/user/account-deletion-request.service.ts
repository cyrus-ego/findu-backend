import { Injectable } from '@nestjs/common';
import { UserDocument } from './entities/user.schema';
import {
  AccountDeletionRequestDocument,
  AccountDeletionRequestStatus,
} from './entities/account-deletion-request.schema';
import { AccountDeletionRequestRepository } from './account-deletion-request.repository';
import { AccountDeletionRequestResponseDto } from './dto/account-deletion-request-response.dto';

export const ACCOUNT_DELETION_PROCESSING_DAYS = 30;

@Injectable()
export class AccountDeletionRequestService {
  constructor(private readonly repository: AccountDeletionRequestRepository) {}

  async requestDeletion(user: UserDocument): Promise<AccountDeletionRequestResponseDto> {
    const userId = String(user._id);
    const pending = await this.repository.findPendingByUserId(userId);
    if (pending) return this.toResponse(pending);

    const requestedAt = new Date();
    const deletionDueAt = new Date(requestedAt);
    deletionDueAt.setUTCDate(deletionDueAt.getUTCDate() + ACCOUNT_DELETION_PROCESSING_DAYS);

    const request = await this.repository.createPending({
      userId,
      email: user.email,
      displayName: user.displayName,
      requestedAt,
      deletionDueAt,
    });

    return this.toResponse(request);
  }

  async getLatest(userId: string): Promise<AccountDeletionRequestResponseDto> {
    const request = await this.repository.findLatestByUserId(userId);
    if (!request) {
      return {
        requested: false,
        requestId: null,
        status: 'none',
        requestedAt: null,
        deletionDueAt: null,
        message: 'Tài khoản chưa có yêu cầu xóa.',
      };
    }

    return this.toResponse(request);
  }

  private toResponse(request: AccountDeletionRequestDocument): AccountDeletionRequestResponseDto {
    return {
      requested: request.status === AccountDeletionRequestStatus.PENDING,
      requestId: String(request._id),
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      deletionDueAt: request.deletionDueAt.toISOString(),
      message:
        request.status === AccountDeletionRequestStatus.PENDING
          ? 'Yêu cầu xóa tài khoản đã được ghi nhận.'
          : 'Yêu cầu xóa tài khoản đã được xử lý.',
    };
  }
}
