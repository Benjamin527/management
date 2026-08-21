import { consumptionWindow, dateKey } from './consumption-window';

describe('consumption window', () => {
  it('builds twenty-eight inclusive dates ending at the latest business day', () => {
    expect(consumptionWindow(new Date('2026-08-19T00:00:00.000Z'))).toEqual({
      start: new Date('2026-07-23T00:00:00.000Z'),
      end: new Date('2026-08-19T00:00:00.000Z'),
    });
  });

  it('can build a shorter inclusive analysis window', () => {
    expect(consumptionWindow(new Date('2026-08-19T00:00:00.000Z'), 14)).toEqual(
      {
        start: new Date('2026-08-06T00:00:00.000Z'),
        end: new Date('2026-08-19T00:00:00.000Z'),
      },
    );
  });

  it('normalizes dates to UTC date-only keys', () => {
    expect(dateKey(new Date('2026-08-19T15:30:00.000Z'))).toBe('2026-08-19');
  });

  it('rejects an invalid source date', () => {
    expect(() => consumptionWindow(new Date('invalid'))).toThrow(
      'Latest consumption date is invalid',
    );
  });
});
