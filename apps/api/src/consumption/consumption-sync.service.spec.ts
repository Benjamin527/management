import { ConflictException } from '@nestjs/common';
import { ConsumptionSyncService } from './consumption-sync.service';

type SyncRunUpdateArgument = {
  where: { id: string };
  data: {
    status: string;
    finishedAt: Date;
    errorSummary: string | null;
    readCount?: number;
    accountCount?: number;
    rowCount?: number;
  };
};

function createPrismaMock() {
  const syncRunUpdates: SyncRunUpdateArgument[] = [];
  const prisma = {
    syncRunUpdates,
    consumptionSyncRun: {
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn((argument: SyncRunUpdateArgument) => {
        syncRunUpdates.push(argument);
        return Promise.resolve({ id: 'run-1' });
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    consumptionAccount: {
      upsert: jest.fn().mockImplementation(
        ({
          where,
        }: {
          where: {
            source_externalId: { source: string; externalId: string };
          };
        }) =>
          Promise.resolve({
            id: `${where.source_externalId.source}-${where.source_externalId.externalId}`,
          }),
      ),
    },
    consumptionDaily: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    consumptionSourceDay: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    customer: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (operation: (client: typeof prisma) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

describe('ConsumptionSyncService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let source: Record<string, jest.Mock>;
  let service: ConsumptionSyncService;

  beforeEach(() => {
    prisma = createPrismaMock();
    source = {
      latestBusinessDate: jest
        .fn()
        .mockResolvedValue(new Date('2026-08-19T00:00:00.000Z')),
      readWindow: jest.fn().mockResolvedValue([
        {
          source: 'DOMESTIC',
          externalId: 'd1',
          displayName: '国内甲',
          managerName: 'PE甲',
          date: new Date('2026-08-19T00:00:00.000Z'),
          product: '日志',
          amount: '12.34',
        },
      ]),
      readCoverage: jest.fn().mockResolvedValue([
        {
          source: 'DOMESTIC',
          date: new Date('2026-08-19T00:00:00.000Z'),
          recordCount: 557,
          amount: '12.34',
        },
      ]),
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'CONSUMPTION_SYNC_ENABLED' ? true : undefined,
      ),
    };
    service = new ConsumptionSyncService(
      prisma as never,
      source as never,
      config as never,
    );
  });

  it('replaces the local 28-day snapshot without touching Customer', async () => {
    const result = await service.run();

    expect(source.readWindow).toHaveBeenCalledWith({
      start: new Date('2026-07-23T00:00:00.000Z'),
      end: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(source.readCoverage).toHaveBeenCalledWith({
      start: new Date('2026-07-23T00:00:00.000Z'),
      end: new Date('2026-08-19T00:00:00.000Z'),
    });
    expect(prisma.customer.create).not.toHaveBeenCalled();
    expect(prisma.customer.update).not.toHaveBeenCalled();
    expect(prisma.customer.upsert).not.toHaveBeenCalled();
    expect(prisma.consumptionAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          source_externalId: { source: 'DOMESTIC', externalId: 'd1' },
        },
      }),
    );
    expect(prisma.consumptionDaily.deleteMany).toHaveBeenCalled();
    expect(prisma.consumptionDaily.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          accountId: 'DOMESTIC-d1',
          product: '日志',
          amount: '12.34',
        }),
      ],
    });
    expect(prisma.consumptionSourceDay.createMany).toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'SUCCESS', rowCount: 1 });
  });

  it('recovers interrupted runs on startup', async () => {
    await service.onModuleInit();
    expect(prisma.consumptionSyncRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'RUNNING' } }),
    );
  });

  it('rejects a concurrent synchronization', async () => {
    let release: (() => void) | undefined;
    source.latestBusinessDate.mockImplementation(
      () =>
        new Promise<Date>((resolve) => {
          release = () => resolve(new Date('2026-08-19T00:00:00.000Z'));
        }),
    );
    const first = service.run();
    await Promise.resolve();
    await expect(service.run()).rejects.toBeInstanceOf(ConflictException);
    release?.();
    await first;
  });

  it('does not replace local data when source reading fails', async () => {
    source.readWindow.mockRejectedValue(
      new Error('mysql://reader:secret@db/guance_crm_v2 timed out'),
    );

    await expect(service.run()).rejects.toThrow('Consumption sync failed');
    expect(prisma.consumptionDaily.deleteMany).not.toHaveBeenCalled();
    const updateArgument = prisma.syncRunUpdates[0];
    expect(updateArgument.data).toMatchObject({
      status: 'FAILED',
      errorSummary: 'Consumption sync failed',
    });
  });
});
