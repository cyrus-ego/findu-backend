import { RoomRepository } from './room.repository';
import { RoomService } from './room.service';

describe('RoomService active-room invariant', () => {
  let repository: {
    findActiveByParticipants: jest.Mock;
    create: jest.Mock;
  };
  let service: RoomService;

  beforeEach(() => {
    repository = {
      findActiveByParticipants: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ roomId: 'room-1' }),
    };
    service = new RoomService(repository as unknown as RoomRepository);
  });

  it('does not create a room when either participant is already active', async () => {
    repository.findActiveByParticipants.mockResolvedValueOnce({ roomId: 'existing-room' });

    await expect(service.createRoomIfAvailable(['user-a', 'user-b'])).resolves.toBeNull();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('treats a duplicate-key race as an unavailable participant', async () => {
    repository.create.mockRejectedValueOnce({ code: 11000 });

    await expect(service.createRoomIfAvailable(['user-a', 'user-b'])).resolves.toBeNull();
  });
});
