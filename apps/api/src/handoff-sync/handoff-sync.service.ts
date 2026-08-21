import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
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
const LEASE_HEARTBEAT_MS = 5 * 60 * 1000;
const TRANSACTION_MAX_WAIT_MS = 10_000;
const TRANSACTION_TIMEOUT_MS = 120_000;
const DEFAULT_CRON = '30 2 * * *';
const TIME_ZONE = 'Asia/Shanghai';
const CRON_JOB_NAME = 'feishu-handoff-sync';
const LEASE_LOST_MESSAGE = 'Handoff synchronization lease lost';

export interface HandoffSyncLeaseIdentity {
  ownerId: string;
  fence: number;
}

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

interface HeartbeatState {
  lost: boolean;
  timer: ReturnType<typeof setInterval> | null;
  renewal: Promise<void> | null;
}

@Injectable()
export class HandoffSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HandoffSyncService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feishu: FeishuClientService,
    private readonly config: ConfigService<AppEnvironment, true>,
    private readonly secrets: HandoffSecretService,
    private readonly scheduler: SchedulerRegistry,
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
    this.registerSchedule();
  }

  onModuleDestroy() {
    if (this.scheduler.doesExist('cron', CRON_JOB_NAME)) {
      this.scheduler.deleteCronJob(CRON_JOB_NAME);
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

  async acquireLease(): Promise<HandoffSyncLeaseIdentity> {
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
        fence: { increment: 1 },
        expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    if (acquired.count !== 1) {
      throw new ConflictException(
        'A handoff synchronization is already running',
      );
    }
    const lease = await this.prisma.handoffSyncLease.findUnique({
      where: { id: LEASE_ID, ownerId },
      select: { ownerId: true, fence: true },
    });
    if (!lease?.ownerId) throw new Error(LEASE_LOST_MESSAGE);
    return { ownerId: lease.ownerId, fence: lease.fence };
  }

  async run(requestedById?: string): Promise<HandoffSyncResult> {
    const lease = await this.acquireLease();
    return this.runWithLease(lease, requestedById);
  }

  async runWithLease(
    lease: HandoffSyncLeaseIdentity,
    requestedById?: string,
  ): Promise<HandoffSyncResult> {
    this.running = true;
    const heartbeat = this.startHeartbeat(lease);
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
      await this.assertActiveLease(lease, heartbeat);
      const reconciliation = await this.reconcile(
        run.id,
        sourceRecords,
        lease,
        heartbeat,
      );
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
      await this.stopHeartbeat(heartbeat);
      try {
        await this.releaseLease(lease);
      } catch {
        this.logger.error('Failed to release handoff synchronization lease');
      }
    }
  }

  private async reconcile(
    runId: string,
    sourceRecords: Awaited<ReturnType<FeishuClientService['listAllRecords']>>,
    lease: HandoffSyncLeaseIdentity,
    heartbeat: HeartbeatState,
  ): Promise<ReconciliationResult> {
    return this.prisma.$transaction(
      async (transaction) => {
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
            await transaction.$executeRawUnsafe(
              `RELEASE SAVEPOINT ${savepoint}`,
            );
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
        if (heartbeat.lost) throw new Error(LEASE_LOST_MESSAGE);
        const fenced = await transaction.handoffSyncLease.updateMany({
          where: {
            id: LEASE_ID,
            ownerId: lease.ownerId,
            fence: lease.fence,
            expiresAt: { gt: finishedAt },
          },
          data: {
            expiresAt: new Date(finishedAt.getTime() + LEASE_DURATION_MS),
          },
        });
        if (fenced.count !== 1) throw new Error(LEASE_LOST_MESSAGE);
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
      },
      {
        maxWait: TRANSACTION_MAX_WAIT_MS,
        timeout: TRANSACTION_TIMEOUT_MS,
      },
    );
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

  private startHeartbeat(lease: HandoffSyncLeaseIdentity): HeartbeatState {
    const state: HeartbeatState = {
      lost: false,
      timer: null,
      renewal: null,
    };
    state.timer = setInterval(() => {
      if (state.lost || state.renewal) return;
      const renewal = this.renewLease(lease)
        .then((renewed) => {
          if (!renewed) state.lost = true;
        })
        .catch(() => {
          state.lost = true;
        })
        .finally(() => {
          if (state.renewal === renewal) state.renewal = null;
        });
      state.renewal = renewal;
    }, LEASE_HEARTBEAT_MS);
    return state;
  }

  private async stopHeartbeat(state: HeartbeatState) {
    if (state.timer) clearInterval(state.timer);
    await state.renewal;
  }

  private async renewLease(lease: HandoffSyncLeaseIdentity) {
    const now = new Date();
    const renewed = await this.prisma.handoffSyncLease.updateMany({
      where: {
        id: LEASE_ID,
        ownerId: lease.ownerId,
        fence: lease.fence,
        expiresAt: { gt: now },
      },
      data: {
        expiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      },
    });
    return renewed.count === 1;
  }

  private async assertActiveLease(
    lease: HandoffSyncLeaseIdentity,
    heartbeat: HeartbeatState,
  ) {
    if (heartbeat.lost) throw new Error(LEASE_LOST_MESSAGE);
    const active = await this.prisma.handoffSyncLease.findFirst({
      where: {
        id: LEASE_ID,
        ownerId: lease.ownerId,
        fence: lease.fence,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (!active) {
      heartbeat.lost = true;
      throw new Error(LEASE_LOST_MESSAGE);
    }
  }

  private async releaseLease(lease: HandoffSyncLeaseIdentity) {
    await this.prisma.handoffSyncLease.updateMany({
      where: {
        id: LEASE_ID,
        ownerId: lease.ownerId,
        fence: lease.fence,
      },
      data: { ownerId: null, expiresAt: new Date() },
    });
  }

  private registerSchedule() {
    if (this.scheduler.doesExist('cron', CRON_JOB_NAME)) {
      this.scheduler.deleteCronJob(CRON_JOB_NAME);
    }
    const job = CronJob.from({
      cronTime: this.cronExpression,
      onTick: () => {
        void this.runScheduledSync();
      },
      start: false,
      timeZone: TIME_ZONE,
    });
    this.scheduler.addCronJob(CRON_JOB_NAME, job);
    job.start();
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
    return new CronTime(this.cronExpression, TIME_ZONE)
      .getNextDateFrom(now, TIME_ZONE)
      .toJSDate()
      .toISOString();
  }

  private get cronExpression() {
    return this.config.get<string>('FEISHU_HANDOFF_SYNC_CRON') ?? DEFAULT_CRON;
  }
}
