import { BadRequestException, Injectable } from '@nestjs/common';
import { ServiceRecordStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface AnalysisRecord {
  startDate: Date;
  customerName: string;
  normalizedStatus: ServiceRecordStatus;
  feedbackTypeNormalized: string | null;
  issueTypeNormalized: string | null;
  sourceType: string | null;
  deploymentType: string | null;
  firstLineEngineer: string | null;
  thirdLineEngineer: string | null;
  satisfaction: number | null;
  ticketId: string | null;
  keyIssue: boolean;
  rawFields: unknown;
  syncedAt: Date;
}

export type AnalysisDimension =
  | 'status'
  | 'feedbackType'
  | 'issueType'
  | 'sourceType'
  | 'deploymentType'
  | 'engineer';

const OPEN_STATUSES = new Set<ServiceRecordStatus>([
  ServiceRecordStatus.IN_PROGRESS,
  ServiceRecordStatus.WAITING_REPLY,
  ServiceRecordStatus.ESCALATED,
  ServiceRecordStatus.UNKNOWN,
  ServiceRecordStatus.OTHER,
]);

@Injectable()
export class ServiceAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(year: number) {
    return buildSummary(await this.records(year));
  }

  async trend(year: number) {
    const records = await this.records(year);
    const months = Array.from({ length: 12 }, (_, index) => ({
      month: `${year}-${String(index + 1).padStart(2, '0')}`,
      total: 0,
      statuses: Object.fromEntries(
        Object.values(ServiceRecordStatus).map((status) => [status, 0]),
      ) as Record<ServiceRecordStatus, number>,
    }));
    for (const record of records) {
      const month = shanghaiMonth(record.startDate);
      const bucket = months[month - 1];
      bucket.total += 1;
      bucket.statuses[record.normalizedStatus] += 1;
    }
    return months;
  }

  async distribution(year: number, dimension: AnalysisDimension) {
    return buildDistribution(await this.records(year), dimension);
  }

  async customers(year: number, limit = 10) {
    const records = await this.records(year);
    const groups = new Map<
      string,
      {
        customerName: string;
        total: number;
        open: number;
        lastServiceAt: Date;
        issueTypes: Map<string, number>;
      }
    >();
    for (const record of records) {
      if (record.customerName === '未填写客户') continue;
      const current = groups.get(record.customerName) ?? {
        customerName: record.customerName,
        total: 0,
        open: 0,
        lastServiceAt: record.startDate,
        issueTypes: new Map<string, number>(),
      };
      current.total += 1;
      if (OPEN_STATUSES.has(record.normalizedStatus)) current.open += 1;
      if (record.startDate > current.lastServiceAt) {
        current.lastServiceAt = record.startDate;
      }
      const issueType = record.issueTypeNormalized || '未分类';
      current.issueTypes.set(
        issueType,
        (current.issueTypes.get(issueType) ?? 0) + 1,
      );
      groups.set(record.customerName, current);
    }
    return [...groups.values()]
      .sort((left, right) => right.total - left.total)
      .slice(0, Math.min(Math.max(limit, 1), 100))
      .map(({ issueTypes, ...customer }) => ({
        ...customer,
        topIssueType:
          [...issueTypes.entries()].sort(
            (left, right) => right[1] - left[1],
          )[0]?.[0] ?? null,
      }));
  }

  private async records(year: number): Promise<AnalysisRecord[]> {
    assertAnalysisYear(year);
    const range = yearRange(year);
    return this.prisma.feishuServiceRecord.findMany({
      where: {
        deletedAt: null,
        startDate: { gte: range.start, lt: range.end },
      },
      select: {
        startDate: true,
        customerName: true,
        normalizedStatus: true,
        feedbackTypeNormalized: true,
        issueTypeNormalized: true,
        sourceType: true,
        deploymentType: true,
        firstLineEngineer: true,
        thirdLineEngineer: true,
        satisfaction: true,
        ticketId: true,
        keyIssue: true,
        rawFields: true,
        syncedAt: true,
      },
    });
  }
}

export function buildSummary(records: AnalysisRecord[]) {
  const total = records.length;
  const countStatus = (status: ServiceRecordStatus) =>
    records.filter((record) => record.normalizedStatus === status).length;
  const resolvedOrClosed = records.filter(
    (record) =>
      record.normalizedStatus === ServiceRecordStatus.RESOLVED ||
      record.normalizedStatus === ServiceRecordStatus.CLOSED,
  ).length;
  const bugCount = records.filter(
    (record) => record.feedbackTypeNormalized?.toLowerCase() === 'bug',
  ).length;
  const populated = (predicate: (record: AnalysisRecord) => boolean) =>
    coverage(records.filter(predicate).length, total);
  const latest = (field: 'syncedAt' | 'startDate') =>
    records.reduce<Date | null>(
      (value, record) =>
        !value || record[field] > value ? record[field] : value,
      null,
    );

  return {
    total,
    waitingReply: countStatus(ServiceRecordStatus.WAITING_REPLY),
    inProgress: countStatus(ServiceRecordStatus.IN_PROGRESS),
    escalated: countStatus(ServiceRecordStatus.ESCALATED),
    bugCount,
    bugRate: percentage(bugCount, total),
    resolvedOrClosedRate: percentage(resolvedOrClosed, total),
    customerCount: new Set(
      records
        .map((record) => record.customerName)
        .filter((name) => name !== '未填写客户'),
    ).size,
    freshness: {
      lastSyncedAt: latest('syncedAt'),
      dataThrough: latest('startDate'),
    },
    quality: {
      firstLineEngineer: populated((record) =>
        Boolean(record.firstLineEngineer),
      ),
      satisfaction: populated((record) => record.satisfaction !== null),
      ticketId: populated((record) => Boolean(record.ticketId)),
      keyIssue: populated((record) =>
        hasRawField(record.rawFields, '重点问题'),
      ),
      supportsPreciseSla: false,
    },
  };
}

export function buildDistribution(
  records: AnalysisRecord[],
  dimension: AnalysisDimension,
) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const value = dimensionValue(record, dimension) || '未填写';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);
  if (dimension !== 'issueType' || rows.length <= 10) return rows;
  return [
    ...rows.slice(0, 10),
    {
      key: '其他',
      count: rows.slice(10).reduce((sum, row) => sum + row.count, 0),
    },
  ];
}

export function assertAnalysisYear(year: number) {
  if (year !== 2026) {
    throw new BadRequestException('Only 2026 service data is available');
  }
}

export function yearRange(year = 2026) {
  const offset = 8 * 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, 0, 1) - offset),
    end: new Date(Date.UTC(year + 1, 0, 1) - offset),
  };
}

function dimensionValue(record: AnalysisRecord, dimension: AnalysisDimension) {
  const values: Record<AnalysisDimension, string | null> = {
    status: record.normalizedStatus,
    feedbackType: record.feedbackTypeNormalized,
    issueType: record.issueTypeNormalized,
    sourceType: record.sourceType,
    deploymentType: record.deploymentType,
    engineer: record.firstLineEngineer,
  };
  return values[dimension];
}

function percentage(count: number, total: number) {
  return total ? Math.round((count / total) * 10_000) / 100 : 0;
}

function coverage(populated: number, total: number) {
  return { populated, total, rate: percentage(populated, total) };
}

function hasRawField(value: unknown, key: string) {
  return Boolean(value && typeof value === 'object' && key in value);
}

function shanghaiMonth(date: Date) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).getUTCMonth() + 1;
}
