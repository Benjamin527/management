import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AppEnvironment } from '../config/env.validation';
import { FeishuClientService } from '../feishu/feishu-client.service';
import { Prisma } from '../generated/prisma/client';
import {
  ServiceSyncMode,
  ServiceSyncStatus,
  type ServiceSyncMode as ServiceSyncModeType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { mapServiceRecord } from './service-record.mapper';
import { computeSyncRange } from './sync-window';

export interface ServiceSyncResult {
  id: string;
  mode: ServiceSyncModeType;
  status: 'SUCCESS';
  rangeStart: Date;
  rangeEnd: Date;
  readCount: number;
  createdCount: number;
  updatedCount: number;
  deletedCount: number;
  failedCount: number;
  errorSummary: string | null;
  finishedAt: Date;
}

@Injectable()
export class ServiceSyncService implements OnModuleInit {
  private readonly logger = new Logger(ServiceSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feishu: FeishuClientService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  async onModuleInit() {
    await this.prisma.serviceSyncRun.updateMany({
      where: { status: ServiceSyncStatus.RUNNING },
      data: {
        status: ServiceSyncStatus.FAILED,
        finishedAt: new Date(),
        errorSummary: 'API process restarted before synchronization completed',
      },
    });
    if (!this.enabled) {
      this.logger.log('Feishu service synchronization is disabled');
    }
  }

  get isRunning() {
    return this.running;
  }

  get enabled() {
    return this.config.get<boolean>('FEISHU_SYNC_ENABLED') === true;
  }

  @Cron(process.env.FEISHU_SYNC_CRON || '0 2 * * *', {
    timeZone: 'Asia/Shanghai',
  })
  async runScheduledSync() {
    if (!this.enabled) return;
    try {
      await this.run(ServiceSyncMode.RECENT);
    } catch (error) {
      this.logger.error(
        `Scheduled Feishu sync failed: ${this.errorMessage(error)}`,
      );
    }
  }

  async run(
    mode: ServiceSyncModeType,
    requestedById?: string,
  ): Promise<ServiceSyncResult> {
    if (this.running) {
      throw new ConflictException(
        'A service synchronization is already running',
      );
    }
    if (!this.enabled) {
      throw new ConflictException('Feishu service synchronization is disabled');
    }
    this.running = true;

    let runId: string | null = null;
    try {
      const lastSuccessfulRun = await this.prisma.serviceSyncRun.findFirst({
        where: { status: ServiceSyncStatus.SUCCESS },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      });
      const year = this.config.get<number>('FEISHU_SYNC_YEAR') ?? 2026;
      const range = computeSyncRange({
        mode,
        now: new Date(),
        year,
        lastSuccessfulAt: lastSuccessfulRun?.finishedAt ?? null,
      });
      const run = await this.prisma.serviceSyncRun.create({
        data: {
          mode,
          status: ServiceSyncStatus.RUNNING,
          rangeStart: range.start,
          rangeEnd: range.end,
          requestedById,
        },
      });
      runId = run.id;

      const sourceRecords = await this.feishu.searchRecords(range);
      const fetchedIds = new Set(
        sourceRecords.map((record) => record.record_id),
      );
      let createdCount = 0;
      let updatedCount = 0;
      const failures: string[] = [];

      for (const sourceRecord of sourceRecords) {
        try {
          const mapped = mapServiceRecord(sourceRecord);
          if (mapped.startDate < range.start || mapped.startDate >= range.end) {
            throw new Error('开始日期 is outside the synchronization range');
          }
          const existed = await this.persistRecord(mapped);
          if (existed) updatedCount += 1;
          else createdCount += 1;
        } catch (error) {
          failures.push(
            `${sourceRecord.record_id}: ${this.errorMessage(error)}`,
          );
        }
      }

      const activeRecords = await this.prisma.feishuServiceRecord.findMany({
        where: {
          startDate: { gte: range.start, lt: range.end },
          deletedAt: null,
        },
        select: { externalRecordId: true },
      });
      const missingIds = activeRecords
        .map((record) => record.externalRecordId)
        .filter((id) => !fetchedIds.has(id));
      const deleted = missingIds.length
        ? await this.prisma.feishuServiceRecord.updateMany({
            where: { externalRecordId: { in: missingIds } },
            data: { deletedAt: new Date() },
          })
        : { count: 0 };

      const finishedAt = new Date();
      const errorSummary = failures.length
        ? failures.slice(0, 20).join('\n')
        : null;
      const result: ServiceSyncResult = {
        id: run.id,
        mode,
        status: 'SUCCESS',
        rangeStart: range.start,
        rangeEnd: range.end,
        readCount: sourceRecords.length,
        createdCount,
        updatedCount,
        deletedCount: deleted.count,
        failedCount: failures.length,
        errorSummary,
        finishedAt,
      };
      await this.prisma.serviceSyncRun.update({
        where: { id: run.id },
        data: {
          status: ServiceSyncStatus.SUCCESS,
          readCount: result.readCount,
          createdCount,
          updatedCount,
          deletedCount: result.deletedCount,
          failedCount: result.failedCount,
          errorSummary,
          finishedAt,
        },
      });
      return result;
    } catch (error) {
      if (runId) {
        await this.prisma.serviceSyncRun.update({
          where: { id: runId },
          data: {
            status: ServiceSyncStatus.FAILED,
            errorSummary: this.sanitizeError(error),
            finishedAt: new Date(),
          },
        });
      }
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async persistRecord(
    mapped: Prisma.FeishuServiceRecordUncheckedCreateInput,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.feishuServiceRecord.findUnique({
        where: { externalRecordId: mapped.externalRecordId },
        select: { id: true },
      });
      const customer =
        mapped.customerName === '未填写客户'
          ? null
          : await transaction.customer.upsert({
              where: { name: mapped.customerName },
              update: {},
              create: { name: mapped.customerName },
              select: { id: true },
            });
      const data = { ...mapped, customerId: customer?.id ?? null };
      await transaction.feishuServiceRecord.upsert({
        where: { externalRecordId: mapped.externalRecordId },
        create: data,
        update: data,
      });
      return Boolean(existing);
    });
  }

  private sanitizeError(error: unknown) {
    let message = this.errorMessage(error);
    for (const key of ['FEISHU_APP_SECRET', 'FEISHU_APP_ID'] as const) {
      const secret = this.config.get<string>(key);
      if (secret) message = message.replaceAll(secret, '[REDACTED]');
    }
    return message.slice(0, 4000);
  }

  private errorMessage(error: unknown) {
    return error instanceof Error
      ? error.message
      : 'Unknown synchronization error';
  }
}
