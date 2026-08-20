import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ServiceRecordStatus } from '../generated/prisma/enums';
import { yearRange } from '../service-analysis/service-analysis.service';

const OPEN_SERVICE_STATUSES = new Set<ServiceRecordStatus>([
  ServiceRecordStatus.IN_PROGRESS,
  ServiceRecordStatus.WAITING_REPLY,
  ServiceRecordStatus.ESCALATED,
  ServiceRecordStatus.UNKNOWN,
  ServiceRecordStatus.OTHER,
]);

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: CustomerQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where = {
      deletedAt: null,
      ...(query.keyword ? { name: { contains: query.keyword.trim() } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true } },
          _count: {
            select: {
              issues: {
                where: {
                  deletedAt: null,
                  status: { notIn: ['RESOLVED', 'CLOSED'] },
                },
              },
            },
          },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);
    const customerIds = items.map((customer) => customer.id);
    const serviceYear = yearRange();
    const serviceRecords = customerIds.length
      ? await this.prisma.feishuServiceRecord.findMany({
          where: {
            customerId: { in: customerIds },
            deletedAt: null,
            startDate: { gte: serviceYear.start, lt: serviceYear.end },
          },
          select: {
            customerId: true,
            startDate: true,
            normalizedStatus: true,
          },
        })
      : [];
    const summaries = new Map<
      string,
      { total: number; open: number; lastServiceAt: Date | null }
    >();
    for (const record of serviceRecords) {
      if (!record.customerId) continue;
      const summary = summaries.get(record.customerId) ?? {
        total: 0,
        open: 0,
        lastServiceAt: null,
      };
      summary.total += 1;
      if (OPEN_SERVICE_STATUSES.has(record.normalizedStatus)) summary.open += 1;
      if (!summary.lastServiceAt || record.startDate > summary.lastServiceAt) {
        summary.lastServiceAt = record.startDate;
      }
      summaries.set(record.customerId, summary);
    }
    return {
      items: items.map((customer) => ({
        ...customer,
        service2026: summaries.get(customer.id) ?? {
          total: 0,
          open: 0,
          lastServiceAt: null,
        },
      })),
      page,
      pageSize,
      total,
    };
  }

  async create(input: CreateCustomerDto) {
    try {
      return await this.prisma.customer.create({ data: input });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('客户名称已经存在');
      }
      throw error;
    }
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        issues: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        },
        consumptions: { orderBy: { date: 'desc' }, take: 30 },
      },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    const serviceYear = yearRange();
    const records = await this.prisma.feishuServiceRecord.findMany({
      where: {
        customerId: id,
        deletedAt: null,
        startDate: { gte: serviceYear.start, lt: serviceYear.end },
      },
      select: {
        startDate: true,
        normalizedStatus: true,
        issueTypeNormalized: true,
      },
      orderBy: { startDate: 'desc' },
    });
    const monthCounts = new Map<string, number>();
    const issueCounts = new Map<string, number>();
    for (const record of records) {
      const shanghaiDate = new Date(
        record.startDate.getTime() + 8 * 60 * 60 * 1000,
      );
      const month = `${shanghaiDate.getUTCFullYear()}-${String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0')}`;
      monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
      const issueType = record.issueTypeNormalized || '未分类';
      issueCounts.set(issueType, (issueCounts.get(issueType) ?? 0) + 1);
    }
    return {
      ...customer,
      service2026: {
        total: records.length,
        open: records.filter((record) =>
          OPEN_SERVICE_STATUSES.has(record.normalizedStatus),
        ).length,
        lastServiceAt: records[0]?.startDate ?? null,
        monthlyTrend: [...monthCounts.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([month, count]) => ({ month, count })),
        topIssueTypes: [...issueCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 5)
          .map(([issueType, count]) => ({ issueType, count })),
      },
    };
  }

  async update(id: string, input: UpdateCustomerDto) {
    await this.findOne(id);
    try {
      return await this.prisma.customer.update({ where: { id }, data: input });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException('客户名称已经存在');
      }
      throw error;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }
}
