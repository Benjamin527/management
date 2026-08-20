import { type ServiceSyncMode } from '../generated/prisma/enums';

const DAY = 24 * 60 * 60 * 1000;
const SHANGHAI_OFFSET = 8 * 60 * 60 * 1000;

export interface SyncRangeInput {
  mode: ServiceSyncMode;
  now: Date;
  year: number;
  lastSuccessfulAt: Date | null;
}

export interface SyncRange {
  start: Date;
  end: Date;
}

export function computeSyncRange(input: SyncRangeInput): SyncRange {
  const yearStart = shanghaiYearBoundary(input.year);
  const yearEnd = shanghaiYearBoundary(input.year + 1);
  if (input.mode === 'FULL_YEAR') {
    return { start: yearStart, end: yearEnd };
  }

  const today = shanghaiMidnight(input.now);
  const overlapStart = new Date(today.getTime() - 7 * DAY);
  const compensationStart = input.lastSuccessfulAt
    ? new Date(shanghaiMidnight(input.lastSuccessfulAt).getTime() - DAY)
    : overlapStart;
  const start = new Date(
    Math.max(
      yearStart.getTime(),
      Math.min(overlapStart.getTime(), compensationStart.getTime()),
    ),
  );
  const end = new Date(Math.min(today.getTime() + DAY, yearEnd.getTime()));
  return { start, end };
}

function shanghaiMidnight(value: Date) {
  const shifted = new Date(value.getTime() + SHANGHAI_OFFSET);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - SHANGHAI_OFFSET,
  );
}

function shanghaiYearBoundary(year: number) {
  return new Date(Date.UTC(year, 0, 1) - SHANGHAI_OFFSET);
}
