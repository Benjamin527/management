import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { analyzeConsumption } from './consumption-analysis';
import { addUtcDays, consumptionWindow } from './consumption-window';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

@Injectable()
export class ConsumptionService {
  constructor(private readonly prisma: PrismaService) {}

  async analysis(query: ConsumptionQueryDto, now = new Date()) {
    const source = query.source ?? 'ALL';
    const period = query.period ?? 14;
    const lastSuccessfulRun = await this.prisma.consumptionSyncRun.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { finishedAt: 'desc' },
      select: { rangeStart: true, rangeEnd: true, finishedAt: true },
    });
    const rangeEnd = lastSuccessfulRun?.rangeEnd ?? consumptionWindow(now).end;
    const rangeStart = addUtcDays(rangeEnd, -(period - 1));
    const previousRangeStart = addUtcDays(rangeStart, -period);
    const accountFilter = {
      ...(query.accountId ? { id: query.accountId } : {}),
      ...(source === 'ALL' ? {} : { source }),
      ...(query.managerName ? { managerName: query.managerName } : {}),
    };
    const [rows, coverage] = await Promise.all([
      this.prisma.consumptionDaily.findMany({
        where: {
          date: { gte: previousRangeStart, lte: rangeEnd },
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
        where: { date: { gte: previousRangeStart, lte: rangeEnd } },
        orderBy: { date: 'asc' },
      }),
    ]);

    return analyzeConsumption(rows, coverage, {
      source,
      period,
      anomalyStatus: query.anomalyStatus ?? 'ALL',
      direction: query.direction ?? 'ALL',
      previousRangeStart,
      rangeStart,
      rangeEnd,
      lastSyncedAt: lastSuccessfulRun?.finishedAt ?? null,
    });
  }
}
