import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AppEnvironment } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { ConsumptionSourceClient } from './consumption-source.client';
import { consumptionWindow } from './consumption-window';

@Injectable()
export class ConsumptionSyncService implements OnModuleInit {
  private readonly logger = new Logger(ConsumptionSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly source: ConsumptionSourceClient,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  get isRunning() {
    return this.running;
  }

  get enabled() {
    return this.config.get<boolean>('CONSUMPTION_SYNC_ENABLED') === true;
  }

  async onModuleInit() {
    await this.prisma.consumptionSyncRun.updateMany({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        errorSummary: 'API process restarted before synchronization completed',
      },
    });
    if (!this.enabled) {
      this.logger.log('Consumption synchronization is disabled');
    }
  }

  async getStatus() {
    const [lastSuccessfulRun, lastRun] = await Promise.all([
      this.prisma.consumptionSyncRun.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.consumptionSyncRun.findFirst({
        orderBy: { startedAt: 'desc' },
      }),
    ]);
    return {
      enabled: this.enabled,
      running: this.running,
      lastSuccessfulRun,
      lastRun,
      nextScheduledAt: this.enabled ? this.nextScheduledAt() : null,
    };
  }

  @Cron(process.env.CONSUMPTION_SYNC_CRON || '0 13 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async runScheduledSync() {
    if (!this.enabled || this.running) return;
    try {
      await this.run();
    } catch {
      this.logger.error('Scheduled consumption synchronization failed');
    }
  }

  async run() {
    if (!this.enabled) {
      throw new ConflictException('Consumption synchronization is disabled');
    }
    if (this.running) {
      throw new ConflictException(
        'A consumption synchronization is already running',
      );
    }
    this.running = true;
    let runId: string | null = null;
    try {
      const latest = await this.source.latestBusinessDate();
      const range = consumptionWindow(latest);
      const run = await this.prisma.consumptionSyncRun.create({
        data: {
          status: 'RUNNING',
          rangeStart: range.start,
          rangeEnd: range.end,
        },
      });
      runId = run.id;
      const [rows, coverage] = await Promise.all([
        this.source.readWindow(range),
        this.source.readCoverage(range),
      ]);
      const accountKeys = new Map<
        string,
        { id: string; source: 'DOMESTIC' | 'OVERSEAS'; externalId: string }
      >();

      await this.prisma.$transaction(async (transaction) => {
        for (const row of rows) {
          const key = `${row.source}:${row.externalId}`;
          if (accountKeys.has(key)) continue;
          const account = await transaction.consumptionAccount.upsert({
            where: {
              source_externalId: {
                source: row.source,
                externalId: row.externalId,
              },
            },
            create: {
              source: row.source,
              externalId: row.externalId,
              displayName: row.displayName,
              managerName: row.managerName,
            },
            update: {
              displayName: row.displayName,
              managerName: row.managerName,
            },
            select: { id: true, source: true, externalId: true },
          });
          accountKeys.set(key, account);
        }

        await transaction.consumptionDaily.deleteMany({
          where: { date: { gte: range.start, lte: range.end } },
        });
        if (rows.length) {
          await transaction.consumptionDaily.createMany({
            data: rows.map((row) => ({
              accountId: accountKeys.get(`${row.source}:${row.externalId}`)!.id,
              date: row.date,
              product: row.product,
              amount: row.amount,
              unit: 'CNY',
            })),
          });
        }
        await transaction.consumptionDaily.deleteMany({
          where: {
            OR: [{ date: { lt: range.start } }, { date: { gt: range.end } }],
          },
        });

        await transaction.consumptionSourceDay.deleteMany({
          where: { date: { gte: range.start, lte: range.end } },
        });
        if (coverage.length) {
          await transaction.consumptionSourceDay.createMany({
            data: coverage.map((day) => ({
              source: day.source,
              date: day.date,
              recordCount: day.recordCount,
              amount: day.amount,
            })),
          });
        }
        await transaction.consumptionSourceDay.deleteMany({
          where: {
            OR: [{ date: { lt: range.start } }, { date: { gt: range.end } }],
          },
        });
      });

      const finishedAt = new Date();
      await this.prisma.consumptionSyncRun.update({
        where: { id: runId },
        data: {
          status: 'SUCCESS',
          readCount: rows.length,
          accountCount: accountKeys.size,
          rowCount: rows.length,
          finishedAt,
          errorSummary: null,
        },
      });
      return {
        id: runId,
        status: 'SUCCESS' as const,
        rangeStart: range.start,
        rangeEnd: range.end,
        readCount: rows.length,
        accountCount: accountKeys.size,
        rowCount: rows.length,
        finishedAt,
      };
    } catch {
      if (runId) {
        await this.prisma.consumptionSyncRun.update({
          where: { id: runId },
          data: {
            status: 'FAILED',
            finishedAt: new Date(),
            errorSummary: 'Consumption sync failed',
          },
        });
      }
      throw new Error('Consumption sync failed');
    } finally {
      this.running = false;
    }
  }

  private nextScheduledAt(now = new Date()) {
    const offset = 8 * 60 * 60 * 1000;
    const shanghai = new Date(now.getTime() + offset);
    const next = new Date(
      Date.UTC(
        shanghai.getUTCFullYear(),
        shanghai.getUTCMonth(),
        shanghai.getUTCDate(),
        13,
      ),
    );
    if (next.getTime() <= shanghai.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return new Date(next.getTime() - offset).toISOString();
  }
}
