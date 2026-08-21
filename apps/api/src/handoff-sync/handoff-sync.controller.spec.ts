import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { HandoffSyncController } from './handoff-sync.controller';

describe('HandoffSyncController', () => {
  let sync: {
    getStatus: jest.Mock;
    run: jest.Mock;
    enabled: boolean;
    isRunning: boolean;
  };
  let controller: HandoffSyncController;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    sync = {
      getStatus: jest.fn().mockResolvedValue({ enabled: true, running: false }),
      run: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
      enabled: true,
      isRunning: false,
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
    (role) => {
      expect(
        controller.run({
          sub: 'user-1',
          email: 'user@example.com',
          role,
        }),
      ).toEqual({ accepted: true });
      expect(sync.run).toHaveBeenCalledWith('user-1');
    },
  );

  it.each(['AGENT', 'SALES'])(
    'forbids %s from triggering synchronization',
    (role) => {
      expect(() =>
        controller.run({
          sub: 'user-1',
          email: 'user@example.com',
          role,
        }),
      ).toThrow(ForbiddenException);
      expect(sync.run).not.toHaveBeenCalled();
    },
  );

  it('rejects concurrent and disabled manual runs before accepting them', () => {
    sync.isRunning = true;
    expect(() =>
      controller.run({
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).toThrow(ConflictException);

    sync.isRunning = false;
    sync.enabled = false;
    expect(() =>
      controller.run({
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).toThrow(ConflictException);
  });

  it('logs only a generic message when a background run fails', async () => {
    const logger = (controller as unknown as { logger: { error: jest.Mock } })
      .logger;
    jest.spyOn(logger, 'error');
    sync.run.mockRejectedValue(new Error('deployment secret leaked'));

    controller.run({
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
