import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ServiceSyncController } from './service-sync.controller';

describe('ServiceSyncController', () => {
  let sync: {
    getStatus: jest.Mock;
    run: jest.Mock;
    isRunning: boolean;
  };
  let controller: ServiceSyncController;

  beforeEach(() => {
    sync = {
      getStatus: jest.fn().mockResolvedValue({
        enabled: true,
        running: false,
        lastSuccessfulRun: null,
        lastRun: null,
        nextScheduledAt: '2026-08-21T02:00:00+08:00',
        sourceUrl: 'https://example.feishu.cn/wiki/example',
      }),
      run: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
      isRunning: false,
    };
    controller = new ServiceSyncController(sync as never);
  });

  it('returns the synchronization status to authenticated users', async () => {
    await expect(controller.status()).resolves.toMatchObject({
      enabled: true,
      running: false,
    });
  });

  it.each(['ADMIN', 'MANAGER'])('lets %s trigger a full-year run', (role) => {
    expect(
      controller.run(
        { mode: 'full-year' },
        { sub: 'user-1', email: 'user@example.com', role },
      ),
    ).toEqual({ accepted: true, mode: 'full-year' });
    expect(sync.run).toHaveBeenCalledWith('FULL_YEAR', 'user-1');
  });

  it('forbids an agent from triggering synchronization', () => {
    expect(() =>
      controller.run(
        { mode: 'recent' },
        { sub: 'user-1', email: 'agent@example.com', role: 'AGENT' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a second manual run while synchronization is active', () => {
    sync.isRunning = true;
    expect(() =>
      controller.run(
        { mode: 'recent' },
        { sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' },
      ),
    ).toThrow(ConflictException);
  });
});
