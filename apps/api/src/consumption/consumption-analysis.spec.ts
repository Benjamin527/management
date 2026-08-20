import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';
import { analyzeConsumption } from './consumption-analysis';

const row = (
  date: string,
  amount: number,
  customerId = 'c1',
  customerName = '太保',
  product = '日志',
) => ({
  date: new Date(`${date}T00:00:00.000Z`),
  amount,
  product,
  unit: 'GB',
  customer: { id: customerId, name: customerName, owner: { name: '王雨轩' } },
});

describe('consumption analysis', () => {
  it.each([7, 30, 60])('accepts the supported %i-day period', (days) => {
    const query = Object.assign(new ConsumptionQueryDto(), { days });
    expect(validateSync(query)).toHaveLength(0);
  });

  it('rejects periods beyond the supported 60-day maximum', () => {
    const query = Object.assign(new ConsumptionQueryDto(), { days: 90 });
    expect(validateSync(query)).not.toHaveLength(0);
  });

  it('fills missing trend dates and calculates customer period change', () => {
    const result = analyzeConsumption(
      [
        row('2026-08-14', 50),
        row('2026-08-19', 60),
        row('2026-08-20', 90),
      ],
      { days: 7, now: new Date('2026-08-20T12:00:00.000Z') },
    );

    expect(result.trend).toHaveLength(7);
    expect(result.trend[0]).toEqual({ date: '2026-08-14', amount: 50 });
    expect(result.trend[1]).toEqual({ date: '2026-08-15', amount: 0 });
    expect(result.kpis.totalAmount).toBe(200);
    expect(result.customerRanking[0]).toMatchObject({
      customerId: 'c1',
      amount: 200,
      previousAmount: 0,
      changeRate: null,
    });
  });

  it('detects drop, rise, and seven-day silence signals', () => {
    const result = analyzeConsumption(
      [
        row('2026-08-01', 100, 'drop', '下降客户'),
        row('2026-08-08', 20, 'drop', '下降客户'),
        row('2026-08-01', 10, 'rise', '增长客户'),
        row('2026-08-08', 30, 'rise', '增长客户'),
        row('2026-08-05', 40, 'silent', '沉默客户'),
      ],
      { days: 7, now: new Date('2026-08-14T12:00:00.000Z') },
    );

    expect(result.anomalies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ customerId: 'drop', type: 'DROP' }),
        expect.objectContaining({ customerId: 'rise', type: 'RISE' }),
        expect.objectContaining({ customerId: 'silent', type: 'SILENT' }),
      ]),
    );
  });
});
