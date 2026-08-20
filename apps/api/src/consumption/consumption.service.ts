import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  analyzeConsumption,
  consumptionPeriodStart,
} from './consumption-analysis';
import { ConsumptionQueryDto } from './dto/consumption-query.dto';

@Injectable()
export class ConsumptionService {
  constructor(private readonly prisma: PrismaService) {}

  async analysis(query: ConsumptionQueryDto, now = new Date()) {
    const days = query.days ?? 30;
    const rows = await this.prisma.consumptionDaily.findMany({
      where: {
        date: { gte: consumptionPeriodStart(days, now) },
        ...(query.customerId ? { customerId: query.customerId } : {}),
        ...(query.product ? { product: query.product } : {}),
        customer: { deletedAt: null },
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            owner: { select: { name: true } },
          },
        },
      },
      orderBy: { date: 'asc' },
    });
    return analyzeConsumption(rows, { days, now });
  }
}
