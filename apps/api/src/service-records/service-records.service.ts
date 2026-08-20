import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/env.validation';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { yearRange } from '../service-analysis/service-analysis.service';
import { ListServiceRecordsDto } from './dto/list-service-records.dto';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class ServiceRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async list(query: ListServiceRecordsDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where = this.buildWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.feishuServiceRecord.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ startDate: 'desc' }, { externalRecordId: 'desc' }],
        select: {
          id: true,
          externalRecordId: true,
          serviceRecordNo: true,
          startDate: true,
          endDate: true,
          customerId: true,
          customerName: true,
          summary: true,
          sourceType: true,
          feedbackTypeNormalized: true,
          issueTypeNormalized: true,
          deploymentType: true,
          normalizedStatus: true,
          sourceStatus: true,
          firstLineEngineer: true,
          thirdLineEngineer: true,
          ticketId: true,
          keyIssue: true,
          syncedAt: true,
        },
      }),
      this.prisma.feishuServiceRecord.count({ where }),
    ]);
    return { items, page, pageSize, total };
  }

  async findOne(id: string) {
    const range = yearRange();
    const record = await this.prisma.feishuServiceRecord.findFirst({
      where: {
        id,
        deletedAt: null,
        startDate: { gte: range.start, lt: range.end },
      },
      include: { customer: { select: { id: true, name: true } } },
    });
    if (!record) throw new NotFoundException('Service record not found');
    return {
      ...record,
      sourceUrl: this.recordSourceUrl(record.externalRecordId),
    };
  }

  private buildWhere(query: ListServiceRecordsDto) {
    const range = boundedDateRange(query.dateFrom, query.dateTo);
    const where: Prisma.FeishuServiceRecordWhereInput = {
      deletedAt: null,
      startDate: { gte: range.start, lt: range.end },
      ...(query.customer
        ? { customerName: { contains: query.customer.trim() } }
        : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { normalizedStatus: query.status } : {}),
      ...(query.feedbackType
        ? { feedbackTypeNormalized: query.feedbackType }
        : {}),
      ...(query.issueType ? { issueTypeNormalized: query.issueType } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.deploymentType ? { deploymentType: query.deploymentType } : {}),
    };

    if (query.keyword?.trim()) {
      const contains = query.keyword.trim();
      where.OR = [
        { serviceRecordNo: { contains } },
        { customerName: { contains } },
        { summary: { contains } },
        { conclusion: { contains } },
        { ticketId: { contains } },
      ];
    }
    if (query.engineer?.trim()) {
      const contains = query.engineer.trim();
      where.AND = [
        {
          OR: [
            { firstLineEngineer: { contains } },
            { secondLineEngineer: { contains } },
            { thirdLineEngineer: { contains } },
          ],
        },
      ];
    }
    return where;
  }

  private recordSourceUrl(recordId: string) {
    const source = this.config.get<string>('FEISHU_SERVICE_BASE_URL');
    if (!source) return '';
    const url = new URL(source);
    url.searchParams.set('record', recordId);
    return url.toString();
  }
}

function boundedDateRange(dateFrom?: string, dateTo?: string) {
  const year = yearRange();
  const requestedStart = dateFrom ? shanghaiDate(dateFrom) : year.start;
  const requestedEnd = dateTo
    ? new Date(shanghaiDate(dateTo).getTime() + DAY)
    : year.end;
  return {
    start: new Date(Math.max(requestedStart.getTime(), year.start.getTime())),
    end: new Date(Math.min(requestedEnd.getTime(), year.end.getTime())),
  };
}

function shanghaiDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return yearRange().start;
  const [, year, month, day] = match;
  return new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)) - 8 * 60 * 60 * 1000,
  );
}
