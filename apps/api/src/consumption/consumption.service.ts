import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analyzeConsumption } from './consumption-analysis';
import { consumptionWindow } from './consumption-window';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

@Injectable()
export class ConsumptionService {
  constructor(private readonly prisma: PrismaService) {}

  async analysis(query: ConsumptionQueryDto, now = new Date()) {
    const source = query.source ?? 'ALL';
    const lastSuccessfulRun = await this.prisma.consumptionSyncRun.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { rangeStart: true, rangeEnd: true, finishedAt: true },
    });
    const range = lastSuccessfulRun
      ? {
          start: lastSuccessfulRun.rangeStart,
          end: lastSuccessfulRun.rangeEnd,
        }
      : consumptionWindow(now);
    const accountFilter = {
      ...(query.accountId ? { id: query.accountId } : {}),
      ...(source === 'ALL' ? {} : { source }),
    };
    const [rows, coverage] = await Promise.all([
      this.prisma.consumptionDaily.findMany({
        where: {
          date: { gte: range.start, lte: range.end },
          ...(query.product ? { product: query.product } : {}),
          ...(Object.keys(accountFilter).length
            ? { account: accountFilter }
            : {}),
        },
        include: {
          account: {
            select: {
              id: true,
              source: true,
              externalId: true,
              displayName: true,
              managerName: true,
            },
          },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.consumptionSourceDay.findMany({
        where: { date: { gte: range.start, lte: range.end } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return analyzeConsumption(rows, coverage, {
      source,
      rangeStart: range.start,
      rangeEnd: range.end,
      lastSyncedAt: lastSuccessfulRun?.finishedAt ?? null,
    });
  }
}
