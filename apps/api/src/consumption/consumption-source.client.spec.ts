import { ConsumptionSourceClient } from './consumption-source.client';

describe('ConsumptionSourceClient', () => {
  let query: jest.Mock;
  let client: ConsumptionSourceClient;

  beforeEach(() => {
    query = jest.fn();
    client = new ConsumptionSourceClient({ query });
  });

  it('uses the latest domestic or overseas business date', async () => {
    query.mockResolvedValueOnce([
      { domesticMax: '2026-08-19', overseasMax: '2026-08-18' },
    ]);

    await expect(client.latestBusinessDate()).resolves.toEqual(
      new Date('2026-08-19T00:00:00.000Z'),
    );
  });

  it('maps domestic and overseas aggregates independently', async () => {
    query
      .mockResolvedValueOnce([
        {
          externalId: 'd1',
          displayName: '国内甲',
          managerName: 'PE甲',
          date: '2026-08-19',
          product: '日志',
          amount: '12.34',
        },
      ])
      .mockResolvedValueOnce([
        {
          externalId: 'o1',
          displayName: '海外甲',
          managerName: null,
          date: '2026-08-19',
          product: 'APM',
          amount: '5.66',
        },
      ]);

    await expect(
      client.readWindow({
        start: new Date('2026-08-06T00:00:00.000Z'),
        end: new Date('2026-08-19T00:00:00.000Z'),
      }),
    ).resolves.toEqual([
      {
        source: 'DOMESTIC',
        externalId: 'd1',
        displayName: '国内甲',
        managerName: 'PE甲',
        date: new Date('2026-08-19T00:00:00.000Z'),
        product: '日志',
        amount: '12.34',
      },
      {
        source: 'OVERSEAS',
        externalId: 'o1',
        displayName: '海外甲',
        managerName: null,
        date: new Date('2026-08-19T00:00:00.000Z'),
        product: 'APM',
        amount: '5.66',
      },
    ]);
    const firstCall = query.mock.calls[0] as unknown as [string, string[]];
    expect(firstCall[1]).toEqual(['2026-08-06', '2026-08-19']);
  });

  it('reads source-day coverage independently from amount detail', async () => {
    query
      .mockResolvedValueOnce([
        { date: '2026-08-19', recordCount: 557, amount: '0.00' },
      ])
      .mockResolvedValueOnce([
        { date: '2026-08-19', recordCount: 298, amount: '5.66' },
      ]);

    await expect(
      client.readCoverage({
        start: new Date('2026-08-06T00:00:00.000Z'),
        end: new Date('2026-08-19T00:00:00.000Z'),
      }),
    ).resolves.toEqual([
      {
        source: 'DOMESTIC',
        date: new Date('2026-08-19T00:00:00.000Z'),
        recordCount: 557,
        amount: '0.00',
      },
      {
        source: 'OVERSEAS',
        date: new Date('2026-08-19T00:00:00.000Z'),
        recordCount: 298,
        amount: '5.66',
      },
    ]);
  });

  it('rejects malformed rows without leaking source credentials', async () => {
    query
      .mockResolvedValueOnce([
        {
          externalId: '',
          displayName: '错误行',
          date: '2026-08-19',
          product: '日志',
          amount: '-1',
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      client.readWindow({
        start: new Date('2026-08-06T00:00:00.000Z'),
        end: new Date('2026-08-19T00:00:00.000Z'),
      }),
    ).rejects.not.toThrow('reader:secret');
  });

  it('returns a stable error when synchronization is disabled', async () => {
    client = new ConsumptionSourceClient(null);
    await expect(client.latestBusinessDate()).rejects.toThrow(
      'Consumption synchronization is disabled',
    );
  });
});
