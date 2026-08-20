import { ServiceRecordsService } from './service-records.service';

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

describe('ServiceRecordsService', () => {
  let prisma: {
    feishuServiceRecord: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let service: ServiceRecordsService;

  beforeEach(() => {
    prisma = {
      feishuServiceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const config = {
      get: jest.fn().mockReturnValue('https://example.feishu.cn/wiki/example'),
    };
    service = new ServiceRecordsService(prisma as never, config as never);
  });

  it('combines filters and clamps dates to 2026', async () => {
    await service.list({
      page: 1,
      pageSize: 20,
      status: 'WAITING_REPLY',
      customer: '太保',
      dateFrom: '2025-01-01',
      dateTo: '2027-01-01',
    });

    const call = firstCallArgument(prisma.feishuServiceRecord.findMany);
    expect(call).toMatchObject({
      where: {
        deletedAt: null,
        normalizedStatus: 'WAITING_REPLY',
        customerName: { contains: '太保' },
        startDate: {
          gte: new Date('2025-12-31T16:00:00.000Z'),
          lt: new Date('2026-12-31T16:00:00.000Z'),
        },
      },
      skip: 0,
      take: 20,
    });
  });

  it('supports keyword, customer ID and engineer filters', async () => {
    await service.list({
      page: 2,
      pageSize: 10,
      keyword: '告警',
      customerId: 'customer-1',
      engineer: '王雨轩',
    });

    const call = firstCallArgument(prisma.feishuServiceRecord.findMany);
    expect(call).toMatchObject({
      where: {
        customerId: 'customer-1',
      },
      skip: 10,
      take: 10,
    });
    const filters = call as {
      where: { OR?: unknown; AND?: Array<{ OR?: unknown }> };
    };
    expect(Array.isArray(filters.where.OR)).toBe(true);
    expect(Array.isArray(filters.where.AND?.[0]?.OR)).toBe(true);
  });

  it('returns a source URL with the selected record', async () => {
    prisma.feishuServiceRecord.findFirst.mockResolvedValue({
      id: 'local-1',
      externalRecordId: 'rec-1',
      startDate: new Date('2026-08-20T00:00:00+08:00'),
      deletedAt: null,
    });

    const result = await service.findOne('local-1');

    expect(result.sourceUrl).toContain('record=rec-1');
  });
});
