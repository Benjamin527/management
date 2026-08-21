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
import { HandoffSyncStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  mapHandoffRecord,
  normalizeCustomerName,
  type MappedHandoffRecord,
} from './handoff-record.mapper';
import { HandoffSecretService } from './handoff-secret.service';

const DEPLOYMENT_CHECKLIST_FIELD = 'deploymentChecklist';
const FAILED_RUN_MESSAGE = 'Handoff synchronization failed';
const RECORD_FAILURE_MESSAGE = 'record mapping or persistence failed';

export interface HandoffSyncResult {
  id: string;
  status: 'SUCCESS';
  readCount: number;
  createdCount: number;
  updatedCount: number;
  unlinkedCount: number;
  deletedCount: number;
  failedCount: number;
  errorSummary: string | null;
  finishedAt: Date;
}

interface ExistingProfile {
  externalRecordId: string;
  customerId: string | null;
  deletedAt: Date | null;
  customer: { deletedAt: Date | null } | null;
}

@Injectable()
export class HandoffSyncService implements OnModuleInit {
  private readonly logger = new Logger(HandoffSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feishu: FeishuClientService,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly secrets: HandoffSecretService,
  ) {}

  async onModuleInit() {
    await this.prisma.handoffSyncRun.updateMany({
      where: { status: HandoffSyncStatus.RUNNING },
      data: {
        status: HandoffSyncStatus.FAILED,
        finishedAt: new Date(),
        errorSummary: 'API process restarted before synchronization completed',
      },
    });
    if (!this.enabled) {
      this.logger.log('Feishu handoff synchronization is disabled');
    }
  }

  get isRunning() {
    return this.running;
  }

  get enabled() {
    return this.config.get<boolean>('FEISHU_HANDOFF_SYNC_ENABLED') === true;
  }

  async getStatus() {
    const [lastSuccessfulRun, lastRun] = await Promise.all([
      this.prisma.handoffSyncRun.findFirst({
        where: { status: HandoffSyncStatus.SUCCESS },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.handoffSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);

    return {
      enabled: this.enabled,
      running: this.running,
      lastSuccessfulRun,
      lastRun,
      nextScheduledAt: this.enabled ? this.nextScheduledAt() : null,
      sourceUrl: this.config.get<string>('FEISHU_HANDOFF_BASE_URL') ?? '',
    };
  }

  @Cron('30 2 * * *', { timeZone: 'Asia/Shanghai' })
  async runScheduledSync() {
    if (!this.enabled) return;
    try {
      await this.run();
    } catch {
      this.logger.error(
        'Scheduled handoff synchronization failed; inspect synchronization history',
      );
    }
  }

  async run(requestedById?: string): Promise<HandoffSyncResult> {
    if (this.running) {
      throw new ConflictException(
        'A handoff synchronization is already running',
      );
    }
    if (!this.enabled) {
      throw new ConflictException('Feishu handoff synchronization is disabled');
    }
    this.running = true;

    let runId: string | null = null;
    try {
      const run = await this.prisma.handoffSyncRun.create({
        data: {
          status: HandoffSyncStatus.RUNNING,
          requestedById,
        },
      });
      runId = run.id;

      const source = {
        appToken: this.config.getOrThrow<string>(
          'FEISHU_HANDOFF_BASE_APP_TOKEN',
        ),
        tableId: this.config.getOrThrow<string>('FEISHU_HANDOFF_TABLE_ID'),
      };
      const [sourceRecords, customers, existingProfiles] = await Promise.all([
        this.feishu.listAllRecords(source),
        this.prisma.customer.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
        }),
        this.prisma.feishuHandoffProfile.findMany({
          select: {
            externalRecordId: true,
            customerId: true,
            deletedAt: true,
            customer: { select: { deletedAt: true } },
          },
        }),
      ]);

      const customerIdsByName = new Map<string, string[]>();
      for (const customer of customers) {
        const key = normalizeCustomerName(customer.name);
        const ids = customerIdsByName.get(key) ?? [];
        ids.push(customer.id);
        customerIdsByName.set(key, ids);
      }
      const profilesByRecordId = new Map(
        (existingProfiles as ExistingProfile[]).map((profile) => [
          profile.externalRecordId,
          profile,
        ]),
      );
      const fetchedIds = new Set(
        sourceRecords.map((record) => record.record_id),
      );

      let createdCount = 0;
      let updatedCount = 0;
      let unlinkedCount = 0;
      const failures: string[] = [];

      for (const sourceRecord of sourceRecords) {
        try {
          const mapped = mapHandoffRecord(sourceRecord);
          const existing = profilesByRecordId.get(sourceRecord.record_id);
          const customerId = this.resolveCustomerId(
            mapped,
            existing,
            customerIdsByName,
          );
          await this.persistRecord(mapped, customerId);
          if (existing) updatedCount += 1;
          else createdCount += 1;
          if (!customerId) unlinkedCount += 1;
        } catch (error) {
          failures.push(
            `${sourceRecord.record_id}: ${this.safeRecordError(error)}`,
          );
        }
      }

      const missingIds = (existingProfiles as ExistingProfile[])
        .filter(
          (profile) =>
            profile.deletedAt === null &&
            !fetchedIds.has(profile.externalRecordId),
        )
        .map((profile) => profile.externalRecordId);
      const finishedAt = new Date();
      const errorSummary = failures.length
        ? failures.slice(0, 20).join('\n')
        : null;
      const deletedCount = await this.prisma.$transaction(
        async (transaction) => {
          const deleted = missingIds.length
            ? await transaction.feishuHandoffProfile.updateMany({
                where: {
                  externalRecordId: { in: missingIds },
                  deletedAt: null,
                },
                data: { deletedAt: new Date() },
              })
            : { count: 0 };
          await transaction.handoffSyncRun.update({
            where: { id: run.id },
            data: {
              status: HandoffSyncStatus.SUCCESS,
              readCount: sourceRecords.length,
              createdCount,
              updatedCount,
              unlinkedCount,
              deletedCount: deleted.count,
              failedCount: failures.length,
              errorSummary,
              finishedAt,
            },
          });
          return deleted.count;
        },
      );
      const result: HandoffSyncResult = {
        id: run.id,
        status: 'SUCCESS',
        readCount: sourceRecords.length,
        createdCount,
        updatedCount,
        unlinkedCount,
        deletedCount,
        failedCount: failures.length,
        errorSummary,
        finishedAt,
      };
      return result;
    } catch (error) {
      if (runId) {
        try {
          await this.prisma.handoffSyncRun.update({
            where: { id: runId },
            data: {
              status: HandoffSyncStatus.FAILED,
              errorSummary: FAILED_RUN_MESSAGE,
              finishedAt: new Date(),
            },
          });
        } catch {
          this.logger.error('Failed to record handoff synchronization failure');
        }
      }
      throw error;
    } finally {
      this.running = false;
    }
  }

  private resolveCustomerId(
    mapped: MappedHandoffRecord,
    existing: ExistingProfile | undefined,
    customerIdsByName: Map<string, string[]>,
  ): string | null {
    if (existing?.customerId && existing.customer?.deletedAt === null) {
      return existing.customerId;
    }
    const candidates =
      customerIdsByName.get(mapped.profile.normalizedCustomerName) ?? [];
    return candidates.length === 1 ? candidates[0] : null;
  }

  private async persistRecord(
    mapped: MappedHandoffRecord,
    customerId: string | null,
  ) {
    await this.prisma.$transaction(async (transaction) => {
      const profileData = {
        ...mapped.profile,
        customerId,
        syncedAt: new Date(),
        deletedAt: null,
      } as Prisma.FeishuHandoffProfileUncheckedCreateInput;
      const profile = await transaction.feishuHandoffProfile.upsert({
        where: { externalRecordId: mapped.profile.externalRecordId },
        create: profileData,
        update: profileData,
        select: { id: true },
      });

      const context = {
        externalRecordId: mapped.profile.externalRecordId,
        fieldName: DEPLOYMENT_CHECKLIST_FIELD,
      };
      const encrypted = mapped.deploymentChecklistSecret
        ? this.secrets.encrypt(context, mapped.deploymentChecklistSecret)
        : null;
      if (encrypted) {
        const secretData = {
          formatVersion: encrypted.formatVersion,
          keyId: encrypted.keyId,
          ciphertext: encrypted.ciphertext,
          iv: encrypted.iv,
          authTag: encrypted.authTag,
        };
        await transaction.feishuHandoffSecret.upsert({
          where: {
            profileId_fieldName: {
              profileId: profile.id,
              fieldName: DEPLOYMENT_CHECKLIST_FIELD,
            },
          },
          create: {
            profileId: profile.id,
            fieldName: DEPLOYMENT_CHECKLIST_FIELD,
            ...secretData,
          },
          update: secretData,
        });
      } else {
        await transaction.feishuHandoffSecret.deleteMany({
          where: {
            profileId: profile.id,
            fieldName: DEPLOYMENT_CHECKLIST_FIELD,
          },
        });
      }
    });
  }

  private safeRecordError(error: unknown) {
    if (!(error instanceof Error)) return RECORD_FAILURE_MESSAGE;
    if (error.message === '客户名称 is required') return error.message;
    if (
      /^rawFieldsMasked contains unsupported JSON value: (non-finite number|Date|bigint|function|symbol|undefined)$/.test(
        error.message,
      )
    ) {
      return error.message;
    }
    return RECORD_FAILURE_MESSAGE;
  }

  private nextScheduledAt() {
    const shanghaiOffset = 8 * 60 * 60 * 1000;
    const now = Date.now();
    const shifted = new Date(now + shanghaiOffset);
    let next =
      Date.UTC(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        2,
        30,
      ) - shanghaiOffset;
    if (next <= now) next += 24 * 60 * 60 * 1000;
    return new Date(next).toISOString();
  }
}
