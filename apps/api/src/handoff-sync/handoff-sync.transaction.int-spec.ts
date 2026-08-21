import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { SchedulerRegistry } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import {
  HandoffLinkSource,
  HandoffSyncStatus,
} from '../generated/prisma/enums';
import { parseMySqlUrl } from '../prisma/mysql-url';
import { HandoffSyncService } from './handoff-sync.service';

const testDatabaseUrl = process.env.HANDOFF_TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const missingCiDatabaseDescribe =
  process.env.CI === 'true' && !testDatabaseUrl ? describe : describe.skip;

missingCiDatabaseDescribe(
  'HandoffSyncService transaction integration configuration',
  () => {
    it('requires an isolated test database in CI', () => {
      throw new Error(
        'HANDOFF_TEST_DATABASE_URL is required in CI; never use a production database',
      );
    });
  },
);

integrationDescribe('HandoffSyncService transaction integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const adapter = new PrismaMariaDb(parseMySqlUrl(testDatabaseUrl as string));
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('rolls back missing-profile deletion and customer unlink when the final SUCCESS update fails', async () => {
    const suffix = randomUUID();
    const requestedById = `handoff-int-${suffix}`;
    const customer = await prisma.customer.create({
      data: { name: `handoff-int-customer-${suffix}` },
      select: { id: true, name: true },
    });
    const profile = await prisma.feishuHandoffProfile.create({
      data: {
        externalRecordId: `handoff-int-record-${suffix}`,
        customerId: customer.id,
        linkSource: HandoffLinkSource.AUTO,
        linkedAt: new Date(),
        customerName: customer.name,
        normalizedCustomerName: customer.name,
        rawFieldsMasked: {},
      },
      select: { id: true },
    });
    await prisma.handoffSyncLease.upsert({
      where: { id: 1 },
      create: { id: 1, ownerId: null, fence: 0, expiresAt: new Date(0) },
      update: { ownerId: null, fence: 0, expiresAt: new Date(0) },
    });

    const prismaWithFailingSuccess = {
      handoffSyncLease: prisma.handoffSyncLease,
      handoffSyncRun: prisma.handoffSyncRun,
      $transaction: <T>(
        operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      ) =>
        prisma.$transaction(async (transaction) => {
          const failingTransaction = {
            customer: transaction.customer,
            feishuHandoffProfile: transaction.feishuHandoffProfile,
            feishuHandoffSecret: transaction.feishuHandoffSecret,
            $queryRaw: transaction.$queryRaw.bind(transaction),
            handoffSyncLease: transaction.handoffSyncLease,
            handoffSyncRun: {
              update: async (input: Prisma.HandoffSyncRunUpdateArgs) => {
                const status = (input.data as { status?: string }).status;
                if (status === HandoffSyncStatus.SUCCESS) {
                  await transaction.handoffSyncRun.delete({
                    where: input.where,
                  });
                }
                return transaction.handoffSyncRun.update(input);
              },
            },
          } as unknown as Prisma.TransactionClient;
          return operation(failingTransaction);
        }),
    };
    const configValues: Record<string, unknown> = {
      FEISHU_HANDOFF_SYNC_ENABLED: true,
      FEISHU_HANDOFF_BASE_APP_TOKEN: 'integration-app-token',
      FEISHU_HANDOFF_TABLE_ID: 'integration-table-id',
      FEISHU_HANDOFF_SYNC_CRON: '30 2 * * *',
    };
    const service = new HandoffSyncService(
      prismaWithFailingSuccess as never,
      { listAllRecords: () => Promise.resolve([]) } as never,
      {
        get: (key: string) => configValues[key],
        getOrThrow: (key: string) => configValues[key],
      } as never,
      { encrypt: () => null } as never,
      new SchedulerRegistry(),
    );

    try {
      await expect(service.run(requestedById)).rejects.toThrow();

      await expect(
        prisma.feishuHandoffProfile.findUniqueOrThrow({
          where: { id: profile.id },
          select: { deletedAt: true, customerId: true },
        }),
      ).resolves.toEqual({ deletedAt: null, customerId: customer.id });
      await expect(
        prisma.handoffSyncRun.findFirstOrThrow({
          where: { requestedById },
          orderBy: { createdAt: 'desc' },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: HandoffSyncStatus.FAILED });
    } finally {
      await prisma.feishuHandoffProfile.deleteMany({
        where: { id: profile.id },
      });
      await prisma.handoffSyncRun.deleteMany({ where: { requestedById } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.handoffSyncLease.updateMany({
        where: { id: 1 },
        data: { ownerId: null, expiresAt: new Date(0) },
      });
    }
  });
});
