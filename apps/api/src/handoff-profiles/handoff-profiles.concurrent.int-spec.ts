import { ConflictException } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { SchedulerRegistry } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../generated/prisma/client';
import { HandoffLinkSource } from '../generated/prisma/enums';
import { HandoffSyncService } from '../handoff-sync/handoff-sync.service';
import { parseMySqlUrl } from '../prisma/mysql-url';
import { HandoffProfilesService } from './handoff-profiles.service';

const testDatabaseUrl = process.env.HANDOFF_TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;
const missingCiDatabaseDescribe =
  process.env.CI === 'true' && !testDatabaseUrl ? describe : describe.skip;

missingCiDatabaseDescribe(
  'Handoff profile concurrency integration configuration',
  () => {
    it('requires an isolated test database in CI', () => {
      throw new Error(
        'HANDOFF_TEST_DATABASE_URL is required in CI; never use a production database',
      );
    });
  },
);

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function withTransactionQueryHook(
  prisma: PrismaClient,
  hook: (execute: () => Promise<unknown>) => Promise<unknown>,
) {
  return {
    handoffSyncLease: prisma.handoffSyncLease,
    handoffSyncRun: prisma.handoffSyncRun,
    $transaction: <T>(
      operation: (transaction: Prisma.TransactionClient) => Promise<T>,
      options?: { maxWait?: number; timeout?: number },
    ) =>
      prisma.$transaction(async (transaction) => {
        const hooked = new Proxy(transaction, {
          get(target, property, receiver) {
            if (property === '$queryRaw') {
              return <R>(query: Prisma.Sql) =>
                hook(() => transaction.$queryRaw<R>(query)) as Promise<R>;
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            if (typeof value !== 'function') return value;
            const callable = value as (...args: unknown[]) => unknown;
            return (...args: unknown[]) => callable.apply(target, args);
          },
        });
        return operation(hooked);
      }, options),
  };
}

integrationDescribe('Handoff profile concurrency integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const adapter = new PrismaMariaDb(parseMySqlUrl(testDatabaseUrl as string));
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('allows only one target customer to win two concurrent manual links', async () => {
    const suffix = randomUUID();
    const customers = await Promise.all([
      prisma.customer.create({
        data: { name: `handoff-link-a-${suffix}` },
        select: { id: true },
      }),
      prisma.customer.create({
        data: { name: `handoff-link-b-${suffix}` },
        select: { id: true },
      }),
    ]);
    const profile = await prisma.feishuHandoffProfile.create({
      data: {
        externalRecordId: `handoff-link-profile-${suffix}`,
        customerName: `handoff-link-profile-${suffix}`,
        normalizedCustomerName: `handoff-link-profile-${suffix}`,
        rawFieldsMasked: {},
      },
      select: { id: true },
    });
    const service = new HandoffProfilesService(prisma as never, {} as never);

    try {
      const attempts = await Promise.allSettled([
        service.link(profile.id, customers[0].id, `admin-a-${suffix}`),
        service.link(profile.id, customers[1].id, `admin-b-${suffix}`),
      ]);

      expect(
        attempts.filter((attempt) => attempt.status === 'fulfilled'),
      ).toHaveLength(1);
      const rejected = attempts.find(
        (attempt) => attempt.status === 'rejected',
      );
      expect(rejected).toMatchObject({
        reason: expect.any(ConflictException) as ConflictException,
      });
      const persisted = await prisma.feishuHandoffProfile.findUniqueOrThrow({
        where: { id: profile.id },
        select: { customerId: true, linkSource: true },
      });
      expect(customers.map((customer) => customer.id)).toContain(
        persisted.customerId,
      );
      expect(persisted.linkSource).toBe(HandoffLinkSource.MANUAL);
    } finally {
      await prisma.feishuHandoffProfile.deleteMany({
        where: { id: profile.id },
      });
      await prisma.customer.deleteMany({
        where: { id: { in: customers.map((customer) => customer.id) } },
      });
    }
  });

  it('makes sync read the committed manual link instead of overwriting a stale snapshot', async () => {
    const suffix = randomUUID();
    const requestedById = `handoff-race-${suffix}`;
    const originalCustomer = await prisma.customer.create({
      data: { name: `handoff-race-original-${suffix}` },
      select: { id: true, name: true },
    });
    const renamedCustomer = await prisma.customer.create({
      data: { name: `handoff-race-renamed-${suffix}` },
      select: { id: true, name: true },
    });
    const profile = await prisma.feishuHandoffProfile.create({
      data: {
        externalRecordId: `handoff-race-profile-${suffix}`,
        customerId: originalCustomer.id,
        linkSource: HandoffLinkSource.AUTO,
        linkedAt: new Date(),
        customerName: originalCustomer.name,
        normalizedCustomerName: originalCustomer.name,
        rawFieldsMasked: {},
      },
      select: { id: true, externalRecordId: true },
    });
    await prisma.handoffSyncLease.upsert({
      where: { id: 1 },
      create: { id: 1, ownerId: null, fence: 0, expiresAt: new Date(0) },
      update: { ownerId: null, expiresAt: new Date(0) },
    });
    const manualLocked = deferred();
    const releaseManual = deferred();
    const syncLockAttempted = deferred();
    const manualPrisma = withTransactionQueryHook(prisma, async (execute) => {
      const result = await execute();
      manualLocked.resolve();
      await releaseManual.promise;
      return result;
    });
    const syncPrisma = withTransactionQueryHook(prisma, async (execute) => {
      syncLockAttempted.resolve();
      return execute();
    });
    const manualService = new HandoffProfilesService(
      manualPrisma as never,
      {} as never,
    );
    const configValues: Record<string, unknown> = {
      FEISHU_HANDOFF_SYNC_ENABLED: true,
      FEISHU_HANDOFF_BASE_APP_TOKEN: 'integration-app-token',
      FEISHU_HANDOFF_TABLE_ID: 'integration-table-id',
      FEISHU_HANDOFF_SYNC_CRON: '30 2 * * *',
    };
    const syncService = new HandoffSyncService(
      syncPrisma as never,
      {
        listAllRecords: () =>
          Promise.resolve([
            {
              record_id: profile.externalRecordId,
              fields: {
                客户名称: renamedCustomer.name,
                部署清单: null,
                交接状态: '已交接',
              },
            },
          ]),
      } as never,
      {
        get: (key: string) => configValues[key],
        getOrThrow: (key: string) => configValues[key],
      } as never,
      { encrypt: () => null } as never,
      new SchedulerRegistry(),
    );

    try {
      const manual = manualService.link(
        profile.id,
        originalCustomer.id,
        `admin-${suffix}`,
      );
      await manualLocked.promise;
      const sync = syncService.run(requestedById);
      await syncLockAttempted.promise;
      releaseManual.resolve();
      await Promise.all([manual, sync]);

      await expect(
        prisma.feishuHandoffProfile.findUniqueOrThrow({
          where: { id: profile.id },
          select: { customerId: true, linkSource: true, linkedById: true },
        }),
      ).resolves.toEqual({
        customerId: originalCustomer.id,
        linkSource: HandoffLinkSource.MANUAL,
        linkedById: `admin-${suffix}`,
      });
    } finally {
      releaseManual.resolve();
      await prisma.feishuHandoffProfile.deleteMany({
        where: { id: profile.id },
      });
      await prisma.handoffSyncRun.deleteMany({ where: { requestedById } });
      await prisma.customer.deleteMany({
        where: { id: { in: [originalCustomer.id, renamedCustomer.id] } },
      });
      await prisma.handoffSyncLease.updateMany({
        where: { id: 1 },
        data: { ownerId: null, expiresAt: new Date(0) },
      });
    }
  });
});
