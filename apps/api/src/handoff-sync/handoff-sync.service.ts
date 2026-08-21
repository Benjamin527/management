import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { CronTime } from 'cron';
import { randomUUID } from 'node:crypto';
import { AppEnvironment } from '../config/env.validation';
import { FeishuClientService } from '../feishu/feishu-client.service';
import { Prisma } from '../generated/prisma/client';
import {
  HandoffLinkSource,
  type HandoffLinkSource as HandoffLinkSourceType,
  HandoffSyncStatus,
} from '../generated/prisma/enums';
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
const LEASE_ID = 1;
const LEASE_DURATION_MS = 30 * 60 * 1000;
const DEFAULT_CRON = '30 2 * * *';
const TIME_ZONE = 'Asia/Shanghai';

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
  linkSource: HandoffLinkSourceType | null;
  linkedAt: Date | null;
  linkedById: string | null;
  deletedAt: Date | null;
  customer: { deletedAt: Date | null } | null;
}

interface LinkDecision {
  customerId: string | null;
  linkSource: HandoffLinkSourceType | null;
  linkedAt: Date | null;
  linkedById: string | null;
}

interface ReconciliationResult {
  createdCount: number;
  updatedCount: number;
  unlinkedCount: number;
  deletedCount: number;
  failedCount: number;
  errorSummary: string | null;
  finishedAt: Date;
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
    const now = new Date();
    const lease = await this.prisma.handoffSyncLease.findUnique({
      where: { id: LEASE_ID },
      select: { ownerId: true, expiresAt: true },
    });
    if (!lease?.ownerId || lease.expiresAt <= now) {
      await this.prisma.handoffSyncRun.updateMany({
        where: {
          status: HandoffSyncStatus.RUNNING,
          startedAt: { lt: now },
        },
        data: {
          status: HandoffSyncStatus.FAILED,
          finishedAt: now,
          errorSummary:
            'API process restarted before synchronization completed',
        },
      });
    }
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
    const now = new Date();
    const [lastSuccessfulRun, lastRun, lease] = await Promise.all([
      this.prisma.handoffSyncRun.findFirst({
        where: { status: HandoffSyncStatus.SUCCESS },
        orderBy: { finishedAt: 'desc' },
      }),
      this.prisma.handoffSyncRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      this.prisma.handoffSyncLease.findUnique({
        where: { id: LEASE_ID },
        select: { ownerId: true, expiresAt: true },
      }),
    ]);

    return {
      enabled: this.enabled,
      running: Boolean(lease?.ownerId && lease.expiresAt > now),
      lastSuccessfulRun,
      lastRun,
      nextScheduledAt: this.enabled ? this.nextScheduledAt(now) : null,
      sourceUrl: this.config.get<string>('FEISHU_HANDOFF_BASE_URL') ?? '',
    };
  }

  @Cron(process.env.FEISHU_HANDOFF_SYNC_CRON || DEFAULT_CRON, {
    timeZone: TIME_ZONE,
  })
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

  async acquireLease(): Promise<string> {
    if (!this.enabled) {
      throw new ConflictException('Feishu handoff synchronization is disabled');
    }
    const now = new Date();
    const ownerId = randomUUID();
    const acquired = await this.prisma.handoffSyncLease.updateMany({
      where: {
        id: LEASE_ID,
        expiresAt: { lte: now },
      },
      data: {
        ownerId,
        expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    if (acquired.count !== 1) {
      throw new ConflictException(
        'A handoff synchronization is already running',
      );
    }
    return ownerId;
  }

  async run(requestedById?: string): Promise<HandoffSyncResult> {
    const ownerId = await this.acquireLease();
    return this.runWithLease(ownerId, requestedById);
  }

  async runWithLease(
    ownerId: string,
    requestedById?: string,
  ): Promise<HandoffSyncResult> {
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
      const sourceRecords = await this.feishu.listAllRecords({
        appToken: this.config.getOrThrow<string>(
          'FEISHU_HANDOFF_BASE_APP_TOKEN',
        ),
        tableId: this.config.getOrThrow<string>('FEISHU_HANDOFF_TABLE_ID'),
      });
      const reconciliation = await this.reconcile(run.id, sourceRecords);
      return {
        id: run.id,
        status: 'SUCCESS',
        readCount: sourceRecords.length,
        ...reconciliation,
      };
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
      try {
        await this.releaseLease(ownerId);
      } catch {
        this.logger.error('Failed to release handoff synchronization lease');
      }
    }
  }

  private async reconcile(
    runId: string,
    sourceRecords: Awaited<ReturnType<FeishuClientService['listAllRecords']>>,
  ): Promise<ReconciliationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const [customers, existingProfiles] = await Promise.all([
        transaction.customer.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
        }),
        transaction.feishuHandoffProfile.findMany({
          select: {
            externalRecordId: true,
            customerId: true,
            linkSource: true,
            linkedAt: true,
            linkedById: true,
            deletedAt: true,
            customer: { select: { deletedAt: true } },
          },
        }),
      ]);
      const customerIdsByName = this.indexCustomers(customers);
      const profilesByRecordId = new Map(
        (existingProfiles as ExistingProfile[]).map((profile) => [
          profile.externalRecordId,
          profile,
        ]),
      );
      const fetchedIds = new Set(
        sourceRecords.map((record) => record.record_id),
      );
      const missingIds = (existingProfiles as ExistingProfile[])
        .filter(
          (profile) =>
            profile.deletedAt === null &&
            !fetchedIds.has(profile.externalRecordId),
        )
        .map((profile) => profile.externalRecordId);
      const reconciledAt = new Date();
      const deleted = missingIds.length
        ? await transaction.feishuHandoffProfile.updateMany({
            where: {
              externalRecordId: { in: missingIds },
              deletedAt: null,
            },
            data: {
              deletedAt: reconciledAt,
              customerId: null,
              linkSource: null,
              linkedAt: null,
              linkedById: null,
            },
          })
        : { count: 0 };

      let createdCount = 0;
      let updatedCount = 0;
      let unlinkedCount = 0;
      const failures: string[] = [];
      for (const [index, sourceRecord] of sourceRecords.entries()) {
        let savepoint: string | null = null;
        try {
          const mapped = mapHandoffRecord(sourceRecord);
          const existing = profilesByRecordId.get(sourceRecord.record_id);
          const link = this.resolveLink(
            mapped,
            existing,
            customerIdsByName,
            reconciledAt,
          );
          savepoint = `handoff_record_${index}`;
          await transaction.$executeRawUnsafe(`SAVEPOINT ${savepoint}`);
          await this.persistRecord(transaction, mapped, link);
          await transaction.$executeRawUnsafe(`RELEASE SAVEPOINT ${savepoint}`);
          savepoint = null;
          if (existing) updatedCount += 1;
          else createdCount += 1;
          if (!link.customerId) unlinkedCount += 1;
        } catch (error) {
          if (savepoint) {
            await transaction.$executeRawUnsafe(
              `ROLLBACK TO SAVEPOINT ${savepoint}`,
            );
            await transaction.$executeRawUnsafe(
              `RELEASE SAVEPOINT ${savepoint}`,
            );
          }
          failures.push(
            `${sourceRecord.record_id}: ${this.safeRecordError(error)}`,
          );
        }
      }

      const finishedAt = new Date();
      const errorSummary = failures.length
        ? failures.slice(0, 20).join('\n')
        : null;
      await transaction.handoffSyncRun.update({
        where: { id: runId },
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
      return {
        createdCount,
        updatedCount,
        unlinkedCount,
        deletedCount: deleted.count,
        failedCount: failures.length,
        errorSummary,
        finishedAt,
      };
    });
  }

  private indexCustomers(customers: { id: string; name: string }[]) {
    const customerIdsByName = new Map<string, string[]>();
    for (const customer of customers) {
      const key = normalizeCustomerName(customer.name);
      const ids = customerIdsByName.get(key) ?? [];
      ids.push(customer.id);
      customerIdsByName.set(key, ids);
    }
    return customerIdsByName;
  }

  private resolveLink(
    mapped: MappedHandoffRecord,
    existing: ExistingProfile | undefined,
    customerIdsByName: Map<string, string[]>,
    linkedAt: Date,
  ): LinkDecision {
    if (
      existing?.customerId &&
      existing.customer?.deletedAt === null &&
      existing.linkSource === HandoffLinkSource.MANUAL
    ) {
      return {
        customerId: existing.customerId,
        linkSource: HandoffLinkSource.MANUAL,
        linkedAt: existing.linkedAt,
        linkedById: existing.linkedById,
      };
    }
    const candidates =
      customerIdsByName.get(mapped.profile.normalizedCustomerName) ?? [];
    if (candidates.length !== 1) {
      return {
        customerId: null,
        linkSource: null,
        linkedAt: null,
        linkedById: null,
      };
    }
    const customerId = candidates[0];
    const stableAutoLink =
      existing?.linkSource === HandoffLinkSource.AUTO &&
      existing.customerId === customerId &&
      existing.customer?.deletedAt === null;
    return {
      customerId,
      linkSource: HandoffLinkSource.AUTO,
      linkedAt: stableAutoLink ? (existing.linkedAt ?? linkedAt) : linkedAt,
      linkedById: null,
    };
  }

  private async persistRecord(
    transaction: Prisma.TransactionClient,
    mapped: MappedHandoffRecord,
    link: LinkDecision,
  ) {
    const profileData = {
      ...mapped.profile,
      ...link,
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
  }

  private async releaseLease(ownerId: string) {
    await this.prisma.handoffSyncLease.updateMany({
      where: { id: LEASE_ID, ownerId },
      data: { ownerId: null, expiresAt: new Date() },
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

  private nextScheduledAt(now: Date) {
    const expression =
      this.config.get<string>('FEISHU_HANDOFF_SYNC_CRON') ?? DEFAULT_CRON;
    return new CronTime(expression, TIME_ZONE)
      .getNextDateFrom(now, TIME_ZONE)
      .toJSDate()
      .toISOString();
  }
}
