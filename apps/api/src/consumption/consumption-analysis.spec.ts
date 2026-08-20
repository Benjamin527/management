import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { analyzeConsumption } from './consumption-analysis';
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

const coverage = (missingOverseasDate?: string) =>
  Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 7 + index));
    return [
      { source: 'DOMESTIC' as const, date, recordCount: 10, amount: 1 },
      ...(date.toISOString().slice(0, 10) === missingOverseasDate
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

  it('returns a fixed 14-day window and compares the two seven-day halves', () => {
    const result = analyzeConsumption(
      [row('2026-08-07', 100), row('2026-08-14', 20), row('2026-08-20', 30)],
      coverage(),
      {
        source: 'ALL',
        rangeStart: new Date('2026-08-07T00:00:00.000Z'),
        rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
        lastSyncedAt: new Date('2026-08-20T05:00:00.000Z'),
      },
    );

    expect(result.periodDays).toBe(14);
    expect(result.trend).toHaveLength(14);
    expect(result.trend[1]).toEqual({ date: '2026-08-08', amount: 0 });
    expect(result.kpis).toMatchObject({
      totalAmount: 150,
      previous7Amount: 100,
      recent7Amount: 50,
      changeRate: -50,
      activeAccounts: 1,
    });
    expect(result.accountRanking[0]).toMatchObject({
      accountId: 'a1',
      accountName: '太保',
      source: 'DOMESTIC',
      amount: 150,
    });
  });

  it('detects drop, rise, and silence with account identities', () => {
    const result = analyzeConsumption(
      [
        row('2026-08-07', 100, 'drop', '下降账户'),
        row('2026-08-14', 20, 'drop', '下降账户'),
        row('2026-08-07', 10, 'rise', '增长账户'),
        row('2026-08-14', 30, 'rise', '增长账户'),
        row('2026-08-10', 40, 'silent', '沉默账户'),
      ],
      coverage(),
      {
        source: 'DOMESTIC',
        rangeStart: new Date('2026-08-07T00:00:00.000Z'),
        rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
        lastSyncedAt: null,
      },
    );

    expect(result.anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'drop', type: 'DROP' }),
        expect.objectContaining({ accountId: 'rise', type: 'RISE' }),
        expect.objectContaining({ accountId: 'silent', type: 'SILENT' }),
      ]),
    );
    expect(result.anomalies.every((item) => item.confidence === 'HIGH')).toBe(
      true,
    );
  });

  it('distinguishes a missing source day from a real zero day', () => {
    const result = analyzeConsumption([], coverage('2026-08-12'), {
      source: 'ALL',
      rangeStart: new Date('2026-08-07T00:00:00.000Z'),
      rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
      lastSyncedAt: null,
    });

    expect(result.trend.find((day) => day.date === '2026-08-12')?.amount).toBe(
      0,
    );
    expect(result.missingDates).toEqual(['2026-08-12']);
    expect(result.availableDates).toHaveLength(13);
    expect(result.coverage.find((day) => day.date === '2026-08-12')).toEqual({
      date: '2026-08-12',
      domestic: true,
      overseas: false,
    });
  });
});
