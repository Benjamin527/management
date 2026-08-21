import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { analyzeConsumption } from './consumption-analysis';
import { addUtcDays, dateKey } from './consumption-window';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

const account = (
  id: string,
  displayName: string,
  source: 'DOMESTIC' | 'OVERSEAS' = 'DOMESTIC',
) => ({
  id,
  source,
  externalId: `${source}-${id}`,
  displayName,
  managerName: source === 'DOMESTIC' ? '王雨轩' : null,
});

const row = (
  date: string,
  amount: number,
  accountId = 'a1',
  accountName = '太保',
  source: 'DOMESTIC' | 'OVERSEAS' = 'DOMESTIC',
  product = '日志',
) => ({
  date: new Date(`${date}T00:00:00.000Z`),
  amount,
  product,
  unit: 'CNY',
  account: account(accountId, accountName, source),
});

const coverage = (start: string, count: number, missingOverseasDate?: string) =>
  Array.from({ length: count }, (_, index) => {
    const date = addUtcDays(new Date(`${start}T00:00:00.000Z`), index);
    return [
      { source: 'DOMESTIC' as const, date, recordCount: 10, amount: 1 },
      ...(dateKey(date) === missingOverseasDate
        ? []
        : [
            {
              source: 'OVERSEAS' as const,
              date,
              recordCount: 2,
              amount: 1,
            },
          ]),
    ];
  }).flat();

describe('consumption analysis', () => {
  it.each(['ALL', 'DOMESTIC', 'OVERSEAS'])(
    'accepts the supported %s source',
    (source) => {
      const query = Object.assign(new ConsumptionQueryDto(), { source });
      expect(validateSync(query)).toHaveLength(0);
    },
  );

  it('rejects an unsupported source', () => {
    const query = Object.assign(new ConsumptionQueryDto(), { source: 'OTHER' });
    expect(validateSync(query)).not.toHaveLength(0);
  });

  it.each([7, 14])('accepts a %i-day period', (period) => {
    const query = Object.assign(new ConsumptionQueryDto(), { period });
    expect(validateSync(query)).toHaveLength(0);
  });

  it.each([1, 30, 'week'])('rejects unsupported period %s', (period) => {
    const query = Object.assign(new ConsumptionQueryDto(), { period });
    expect(validateSync(query)).not.toHaveLength(0);
  });

  it.each(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL'])(
    'accepts anomaly status %s',
    (anomalyStatus) => {
      const query = Object.assign(new ConsumptionQueryDto(), {
        anomalyStatus,
      });
      expect(validateSync(query)).toHaveLength(0);
    },
  );

  it.each(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE'])(
    'accepts direction %s',
    (direction) => {
      const query = Object.assign(new ConsumptionQueryDto(), { direction });
      expect(validateSync(query)).toHaveLength(0);
    },
  );

  it.each([
    { period: 7 as const, currentStart: '2026-08-14', expectedCurrent: 50 },
    { period: 14 as const, currentStart: '2026-08-07', expectedCurrent: 150 },
  ])(
    'compares $period days with an equal previous period',
    ({ period, currentStart, expectedCurrent }) => {
      const result = analyzeConsumption(
        [
          row('2026-07-24', 40),
          row('2026-08-07', 100),
          row('2026-08-14', 20),
          row('2026-08-20', 30),
        ],
        coverage('2026-07-24', 28),
        {
          period,
          source: 'ALL',
          anomalyStatus: 'ALL',
          direction: 'ALL',
          rangeStart: new Date(`${currentStart}T00:00:00.000Z`),
          rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
          previousRangeStart: new Date(
            `${period === 7 ? '2026-08-07' : '2026-07-24'}T00:00:00.000Z`,
          ),
          lastSyncedAt: new Date('2026-08-20T05:00:00.000Z'),
        },
      );

      expect(result.periodDays).toBe(period);
      expect(result.range.current.from).toBe(currentStart);
      expect(result.trend).toHaveLength(period);
      expect(result.kpis.currentAmount).toBe(expectedCurrent);
      expect(result.trend[0]).toHaveProperty('previousDate');
      expect(result.trend[0]).toHaveProperty('currentAmount');
      expect(result.trend[0]).toHaveProperty('previousAmount');
    },
  );

  it('filters account aggregates before building every dashboard module', () => {
    const result = analyzeConsumption(
      [
        row('2026-08-07', 100, 'drop', '下降账户', 'DOMESTIC', '日志'),
        row('2026-08-14', 20, 'drop', '下降账户', 'DOMESTIC', '日志'),
        row('2026-08-07', 10, 'rise', '增长账户', 'OVERSEAS', 'APM'),
        row('2026-08-14', 30, 'rise', '增长账户', 'OVERSEAS', 'APM'),
      ],
      coverage('2026-08-07', 14),
      {
        period: 7,
        source: 'ALL',
        anomalyStatus: 'DROP',
        direction: 'DOWN',
        previousRangeStart: new Date('2026-08-07T00:00:00.000Z'),
        rangeStart: new Date('2026-08-14T00:00:00.000Z'),
        rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
        lastSyncedAt: null,
      },
    );

    expect(result.accountRanking.map((item) => item.accountId)).toEqual([
      'drop',
    ]);
    expect(result.kpis.currentAmount).toBe(20);
    expect(result.productDistribution.map((item) => item.product)).toEqual([
      '日志',
    ]);
    expect(result.sourceDistribution).toEqual([
      expect.objectContaining({ source: 'DOMESTIC', currentAmount: 20 }),
    ]);
  });

  it('classifies silence, drop, rise, and normal accounts', () => {
    const result = analyzeConsumption(
      [
        row('2026-08-07', 100, 'drop', '下降账户'),
        row('2026-08-14', 20, 'drop', '下降账户'),
        row('2026-08-07', 10, 'rise', '增长账户'),
        row('2026-08-14', 30, 'rise', '增长账户'),
        row('2026-08-10', 40, 'silent', '沉默账户'),
        row('2026-08-10', 20, 'normal', '正常账户'),
        row('2026-08-18', 20, 'normal', '正常账户'),
      ],
      coverage('2026-08-07', 14),
      {
        period: 7,
        source: 'DOMESTIC',
        anomalyStatus: 'ALL',
        direction: 'ALL',
        previousRangeStart: new Date('2026-08-07T00:00:00.000Z'),
        rangeStart: new Date('2026-08-14T00:00:00.000Z'),
        rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
        lastSyncedAt: null,
      },
    );

    expect(result.accountRanking).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'drop', anomalyStatus: 'DROP' }),
        expect.objectContaining({ accountId: 'rise', anomalyStatus: 'RISE' }),
        expect.objectContaining({
          accountId: 'silent',
          anomalyStatus: 'SILENT',
        }),
        expect.objectContaining({
          accountId: 'normal',
          anomalyStatus: 'NORMAL',
        }),
      ]),
    );
    expect(result.anomalies).toHaveLength(3);
  });

  it('returns null amounts for missing days and zero for covered zero days', () => {
    const result = analyzeConsumption(
      [],
      coverage('2026-08-07', 14, '2026-08-16'),
      {
        period: 7,
        source: 'ALL',
        anomalyStatus: 'ALL',
        direction: 'ALL',
        previousRangeStart: new Date('2026-08-07T00:00:00.000Z'),
        rangeStart: new Date('2026-08-14T00:00:00.000Z'),
        rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
        lastSyncedAt: null,
      },
    );

    expect(
      result.trend.find((item) => item.currentDate === '2026-08-16')
        ?.currentAmount,
    ).toBeNull();
    expect(
      result.trend.find((item) => item.currentDate === '2026-08-17')
        ?.currentAmount,
    ).toBe(0);
    expect(result.missingDates).toContain('2026-08-16');
  });
});
