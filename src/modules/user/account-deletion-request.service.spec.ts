import { AccountDeletionRequestRepository } from './account-deletion-request.repository';
import {
  ACCOUNT_DELETION_PROCESSING_DAYS,
  AccountDeletionRequestService,
} from './account-deletion-request.service';
import { AccountDeletionRequestStatus } from './entities/account-deletion-request.schema';

describe('AccountDeletionRequestService', () => {
  let repository: {
    findPendingByUserId: jest.Mock;
    findLatestByUserId: jest.Mock;
    createPending: jest.Mock;
  };
  let service: AccountDeletionRequestService;

  const user = {
    _id: '665a1b2c3d4e5f6789012345',
    email: 'user@example.com',
    displayName: 'Người dùng',
  };

  beforeEach(() => {
    repository = {
      findPendingByUserId: jest.fn().mockResolvedValue(null),
      findLatestByUserId: jest.fn().mockResolvedValue(null),
      createPending: jest.fn().mockImplementation(async (input) => ({
        _id: '665a1b2c3d4e5f6789019999',
        ...input,
        status: AccountDeletionRequestStatus.PENDING,
      })),
    };
    service = new AccountDeletionRequestService(
      repository as unknown as AccountDeletionRequestRepository,
    );
  });

  it('records a deletion request with a 30-day completion deadline', async () => {
    const now = new Date('2026-08-24T08:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const result = await service.requestDeletion(user as never);

    const input = repository.createPending.mock.calls[0][0];
    expect(input.email).toBe(user.email);
    expect(input.deletionDueAt.getTime() - input.requestedAt.getTime()).toBe(
      ACCOUNT_DELETION_PROCESSING_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(result).toMatchObject({
      requested: true,
      status: AccountDeletionRequestStatus.PENDING,
      deletionDueAt: '2026-09-23T08:00:00.000Z',
    });

    jest.useRealTimers();
  });

  it('returns the existing pending request instead of creating a duplicate', async () => {
    repository.findPendingByUserId.mockResolvedValue({
      _id: 'existing-request',
      status: AccountDeletionRequestStatus.PENDING,
      requestedAt: new Date('2026-08-20T08:00:00.000Z'),
      deletionDueAt: new Date('2026-09-19T08:00:00.000Z'),
    });

    const result = await service.requestDeletion(user as never);

    expect(repository.createPending).not.toHaveBeenCalled();
    expect(result.requestId).toBe('existing-request');
  });

  it('reports when the account has no deletion request', async () => {
    await expect(service.getLatest(user._id)).resolves.toMatchObject({
      requested: false,
      status: 'none',
      requestId: null,
    });
  });
});
