import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConsumptionController } from './consumption.controller';

describe('ConsumptionController', () => {
  let analysis: { analysis: jest.Mock };
  let sync: {
    getStatus: jest.Mock;
    run: jest.Mock;
    isRunning: boolean;
    enabled: boolean;
  };
  let controller: ConsumptionController;

  beforeEach(() => {
    analysis = { analysis: jest.fn().mockResolvedValue({ periodDays: 14 }) };
    sync = {
      getStatus: jest.fn().mockResolvedValue({ enabled: true, running: false }),
      run: jest.fn().mockResolvedValue({ status: 'SUCCESS' }),
      isRunning: false,
      enabled: true,
    };
    controller = new ConsumptionController(analysis as never, sync as never);
  });

  it('returns synchronization status', async () => {
    await expect(controller.syncStatus()).resolves.toMatchObject({
      enabled: true,
      running: false,
    });
  });

  it('passes dashboard filters to the analysis service', async () => {
    const query = {
      period: 7 as const,
      source: 'OVERSEAS' as const,
      product: 'APM',
      managerName: '王雨轩',
      anomalyStatus: 'RISE' as const,
      direction: 'UP' as const,
    };
    await controller.analysis(query);
    expect(analysis.analysis).toHaveBeenCalledWith(query);
  });

  it.each(['ADMIN', 'MANAGER'])('lets %s trigger synchronization', (role) => {
    expect(
      controller.runSync({
        sub: 'user-1',
        email: 'user@example.com',
        role,
      }),
    ).toEqual({ accepted: true });
    expect(sync.run).toHaveBeenCalled();
  });

  it('forbids agents from triggering synchronization', () => {
    expect(() =>
      controller.runSync({
        sub: 'user-1',
        email: 'agent@example.com',
        role: 'AGENT',
      }),
    ).toThrow(ForbiddenException);
  });

  it('rejects a second run while synchronization is active', () => {
    sync.isRunning = true;
    expect(() =>
      controller.runSync({
        sub: 'user-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).toThrow(ConflictException);
  });

  it('rejects a run while the integration is disabled', () => {
    sync.enabled = false;
    expect(() =>
      controller.runSync({
        sub: 'user-1',
        email: 'admin@example.com',
        role: 'ADMIN',
      }),
    ).toThrow(ConflictException);
  });
});
