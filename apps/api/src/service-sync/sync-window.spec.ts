import { computeSyncRange } from './sync-window';

describe('computeSyncRange', () => {
  it('uses a one-day overlap around the seven-natural-day business window', () => {
    const range = computeSyncRange({
      mode: 'RECENT',
      now: new Date('2026-08-20T10:30:00+08:00'),
      year: 2026,
      lastSuccessfulAt: new Date('2026-08-19T02:00:00+08:00'),
    });

    expect(range.start.toISOString()).toBe('2026-08-12T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-08-20T16:00:00.000Z');
  });

  it('expands to one day before the last success after a long failure', () => {
    const range = computeSyncRange({
      mode: 'RECENT',
      now: new Date('2026-08-20T10:30:00+08:00'),
      year: 2026,
      lastSuccessfulAt: new Date('2026-08-08T02:00:00+08:00'),
    });

    expect(range.start.toISOString()).toBe('2026-08-06T16:00:00.000Z');
  });

  it('clamps recent compensation to the start of 2026', () => {
    const range = computeSyncRange({
      mode: 'RECENT',
      now: new Date('2026-01-04T10:30:00+08:00'),
      year: 2026,
      lastSuccessfulAt: null,
    });

    expect(range.start.toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-01-04T16:00:00.000Z');
  });

  it('returns the complete 2026 range for a full-year run', () => {
    expect(
      computeSyncRange({
        mode: 'FULL_YEAR',
        now: new Date('2026-08-20T10:30:00+08:00'),
        year: 2026,
        lastSuccessfulAt: null,
      }),
    ).toEqual({
      start: new Date('2025-12-31T16:00:00.000Z'),
      end: new Date('2026-12-31T16:00:00.000Z'),
    });
  });
});
