import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { HandoffSyncController } from './handoff-sync.controller';

describe('HandoffSyncController', () => {
  let sync: {
    getStatus: jest.Mock;
    acquireLease: jest.Mock;
    runWithLease: jest.Mock;
  };
  let controller: HandoffSyncController;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    sync = {
      getStatus: jest.fn().mockResolvedValue({ enabled: true, running: false }),
      acquireLease: jest
        .fn()
        .mockResolvedValue({ ownerId: 'lease-owner-1', fence: 7 }),
      runWithLease: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
    };
    controller = new HandoffSyncController(sync as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns synchronization status to an authenticated user', async () => {
    await expect(controller.status()).resolves.toEqual({
      enabled: true,
      running: false,
    });
  });

  it.each(['ADMIN', 'MANAGER'])(
    'lets %s trigger an immediate background run',
    async (role) => {
      await expect(
        controller.run({
          sub: 'user-1',
          email: 'user@example.com',
          role,
        }),
      ).resolves.toEqual({ accepted: true });
      expect(sync.acquireLease).toHaveBeenCalledTimes(1);
      expect(sync.runWithLease).toHaveBeenCalledWith(
        { ownerId: 'lease-owner-1', fence: 7 },
        'user-1',
      );
    },
  );

  it.each(['AGENT', 'SALES'])(
    'forbids %s from triggering synchronization',
    async (role) => {
      await expect(
        controller.run({
          sub: 'user-1',
          email: 'user@example.com',
          role,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(sync.acquireLease).not.toHaveBeenCalled();
    },
  );

  it('returns Conflict when the database lease cannot be acquired before accepting', async () => {
    sync.acquireLease.mockRejectedValue(new ConflictException());

    await expect(
      controller.run({
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sync.runWithLease).not.toHaveBeenCalled();
  });

  it('logs only a generic message when a background run fails', async () => {
    const logger = (controller as unknown as { logger: { error: jest.Mock } })
      .logger;
    jest.spyOn(logger, 'error');
    sync.runWithLease.mockRejectedValue(new Error('deployment secret leaked'));

    await controller.run({
      sub: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
    });
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      'Manual handoff synchronization failed; inspect synchronization history',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      'deployment secret leaked',
    );
  });
});
