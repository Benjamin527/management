import { ConsumptionService } from './consumption.service';

describe('ConsumptionService', () => {
  it('queries independent consumption accounts in the latest successful window', async () => {
    type DailyQuery = {
      where: {
        date: { gte: Date; lte: Date };
        product?: string;
        account?: { id?: string; source?: string };
      };
      include: { account: { select: Record<string, boolean> } };
    };
    let capturedQuery: DailyQuery | undefined;
    const prisma = {
      consumptionSyncRun: {
        findFirst: jest.fn().mockResolvedValue({
          rangeStart: new Date('2026-08-07T00:00:00.000Z'),
          rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
          finishedAt: new Date('2026-08-20T05:00:00.000Z'),
        }),
      },
      consumptionDaily: {
        findMany: (query: DailyQuery) => {
          capturedQuery = query;
          return Promise.resolve([]);
        },
      },
      consumptionSourceDay: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ConsumptionService(prisma as never);

    const result = await service.analysis({
      source: 'DOMESTIC',
      accountId: 'a1',
      product: '日志',
    });

    expect(capturedQuery).toBeDefined();
    if (!capturedQuery) throw new Error('Prisma query was not captured');
    expect(capturedQuery.where).toMatchObject({
      account: { id: 'a1', source: 'DOMESTIC' },
      product: '日志',
    });
    expect(capturedQuery.include.account.select).toMatchObject({
      id: true,
      source: true,
      externalId: true,
      displayName: true,
      managerName: true,
    });
    expect(result).toMatchObject({
      periodDays: 14,
      dataThrough: '2026-08-20',
      lastSyncedAt: '2026-08-20T05:00:00.000Z',
    });
  });

  it('returns an empty fixed window when no synchronization has succeeded', async () => {
    const prisma = {
      consumptionSyncRun: { findFirst: jest.fn().mockResolvedValue(null) },
      consumptionDaily: { findMany: jest.fn().mockResolvedValue([]) },
      consumptionSourceDay: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ConsumptionService(prisma as never);

    const result = await service.analysis(
      { source: 'ALL' },
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(result.range).toEqual({ from: '2026-08-07', to: '2026-08-20' });
    expect(result.kpis.totalAmount).toBe(0);
  });
});
