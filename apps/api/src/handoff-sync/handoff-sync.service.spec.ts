import { ConflictException, Logger } from '@nestjs/common';
import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { createHandoffSecretProvider } from './handoff-sync.module';
import { HandoffSyncService } from './handoff-sync.service';

function sourceRecord(
  id: string,
  customerName = '客户甲',
  checklist: unknown = '数据库密码是 secret-123',
) {
  return {
    record_id: id,
    fields: {
      客户名称: customerName,
      部署清单: checklist,
      交接状态: '已交接',
    },
  };
}

function lastArgument(mock: jest.Mock) {
  const calls = mock.mock.calls as unknown[][];
  return calls.at(-1)?.[0] as Record<string, unknown>;
}

function createPrismaMock() {
  const prisma = {
    handoffSyncRun: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'run-1' }),
      update: jest.fn().mockResolvedValue({ id: 'run-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    customer: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'customer-1', name: '客户甲' }]),
    },
    feishuHandoffProfile: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest
        .fn()
        .mockImplementation(
          ({ where }: { where: { externalRecordId: string } }) =>
            Promise.resolve({ id: `profile-${where.externalRecordId}` }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    feishuHandoffSecret: {
      upsert: jest.fn().mockResolvedValue({ id: 'secret-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (operation: (client: typeof prisma) => Promise<unknown>) =>
      operation(prisma),
  );
  return prisma;
}

describe('HandoffSyncService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let feishu: { listAllRecords: jest.Mock };
  let secrets: { encrypt: jest.Mock };
  let values: Record<string, unknown>;
  let service: HandoffSyncService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T02:00:00+08:00'));
    prisma = createPrismaMock();
    feishu = { listAllRecords: jest.fn().mockResolvedValue([]) };
    secrets = {
      encrypt: jest.fn().mockReturnValue({
        formatVersion: 1,
        keyId: 'key-id',
        ciphertext: 'encrypted-value',
        iv: 'iv-value',
        authTag: 'tag-value',
      }),
    };
    values = {
      FEISHU_HANDOFF_SYNC_ENABLED: true,
      FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff-app-token',
      FEISHU_HANDOFF_TABLE_ID: 'handoff-table-id',
      FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/base/handoff',
    };
    const config = {
      get: jest.fn((key: string) => values[key]),
      getOrThrow: jest.fn((key: string) => {
        if (values[key] === undefined) throw new Error(`missing ${key}`);
        return values[key];
      }),
    };
    service = new HandoffSyncService(
      prisma as never,
      feishu as never,
      config as never,
      secrets as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reports enabled, running, recent runs, source URL, and the next Shanghai 02:30 schedule', async () => {
    const success = { id: 'success-1', status: 'SUCCESS' };
    const latest = { id: 'latest-1', status: 'FAILED' };
    prisma.handoffSyncRun.findFirst
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(latest);

    await expect(service.getStatus()).resolves.toEqual({
      enabled: true,
      running: false,
      lastSuccessfulRun: success,
      lastRun: latest,
      nextScheduledAt: '2026-08-20T18:30:00.000Z',
      sourceUrl: 'https://example.feishu.cn/base/handoff',
    });
  });

  it('creates a run, fully reads the handoff table, idempotently upserts profiles, and completes with counts', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('r1'),
      sourceRecord('r2', '客户乙', null),
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'customer-1', name: '客户甲' },
      { id: 'customer-2', name: '客户乙' },
    ]);
    prisma.feishuHandoffProfile.findMany.mockResolvedValue([
      {
        externalRecordId: 'r2',
        customerId: 'customer-2',
        deletedAt: null,
        customer: { deletedAt: null },
      },
      {
        externalRecordId: 'gone',
        customerId: null,
        deletedAt: null,
        customer: null,
      },
    ]);
    prisma.feishuHandoffProfile.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.run('admin-1');

    expect(prisma.handoffSyncRun.create).toHaveBeenCalledWith({
      data: { status: 'RUNNING', requestedById: 'admin-1' },
    });
    expect(feishu.listAllRecords).toHaveBeenCalledWith({
      appToken: 'handoff-app-token',
      tableId: 'handoff-table-id',
    });
    expect(prisma.feishuHandoffProfile.upsert).toHaveBeenCalledTimes(2);
    expect(lastArgument(prisma.handoffSyncRun.update)).toMatchObject({
      where: { id: 'run-1' },
      data: {
        status: 'SUCCESS',
        readCount: 2,
        createdCount: 1,
        updatedCount: 1,
        unlinkedCount: 0,
        deletedCount: 1,
        failedCount: 0,
      },
    });
    expect(result).toMatchObject({ status: 'SUCCESS', readCount: 2 });
  });

  it('links only a uniquely normalized active customer and counts zero or multiple matches as unlinked', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('unique', '  ACME：上海  ', null),
      sourceRecord('missing', '不存在', null),
      sourceRecord('duplicate', 'ＡＣＭＥ', null),
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'unique-id', name: 'acme:上海' },
      { id: 'duplicate-1', name: 'ACME' },
      { id: 'duplicate-2', name: 'ＡＣＭＥ' },
    ]);

    await service.run();

    const calls = prisma.feishuHandoffProfile.upsert.mock.calls as unknown as {
      create: { customerId: string | null };
    }[][];
    expect(calls[0][0].create.customerId).toBe('unique-id');
    expect(calls[1][0].create.customerId).toBeNull();
    expect(calls[2][0].create.customerId).toBeNull();
    expect(lastArgument(prisma.handoffSyncRun.update)).toMatchObject({
      data: { unlinkedCount: 2 },
    });
  });

  it('preserves an existing live customer link even when name matching points elsewhere', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('r1', '新客户', null),
    ]);
    prisma.customer.findMany.mockResolvedValue([
      { id: 'new-customer', name: '新客户' },
    ]);
    prisma.feishuHandoffProfile.findMany.mockResolvedValue([
      {
        externalRecordId: 'r1',
        customerId: 'stable-customer',
        deletedAt: null,
        customer: { deletedAt: null },
      },
    ]);

    await service.run();

    expect(lastArgument(prisma.feishuHandoffProfile.upsert)).toMatchObject({
      create: { customerId: 'stable-customer' },
      update: { customerId: 'stable-customer' },
    });
  });

  it('drops a link to a soft-deleted customer and relinks only through a unique active name match', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('r1', '客户甲', null),
    ]);
    prisma.feishuHandoffProfile.findMany.mockResolvedValue([
      {
        externalRecordId: 'r1',
        customerId: 'deleted-customer',
        deletedAt: null,
        customer: { deletedAt: new Date() },
      },
    ]);

    await service.run();

    expect(lastArgument(prisma.feishuHandoffProfile.upsert)).toMatchObject({
      update: { customerId: 'customer-1' },
    });
  });

  it('encrypts a non-empty checklist with record context and persists profile and secret atomically without plaintext', async () => {
    const plaintext = 'database-password=do-not-leak';
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('r-secret', '客户甲', plaintext),
    ]);

    await service.run();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(secrets.encrypt).toHaveBeenCalledWith(
      { externalRecordId: 'r-secret', fieldName: 'deploymentChecklist' },
      plaintext,
    );
    expect(prisma.feishuHandoffSecret.upsert).toHaveBeenCalledWith({
      where: {
        profileId_fieldName: {
          profileId: 'profile-r-secret',
          fieldName: 'deploymentChecklist',
        },
      },
      create: {
        profileId: 'profile-r-secret',
        fieldName: 'deploymentChecklist',
        formatVersion: 1,
        keyId: 'key-id',
        ciphertext: 'encrypted-value',
        iv: 'iv-value',
        authTag: 'tag-value',
      },
      update: {
        formatVersion: 1,
        keyId: 'key-id',
        ciphertext: 'encrypted-value',
        iv: 'iv-value',
        authTag: 'tag-value',
      },
    });
    expect(
      JSON.stringify(prisma.feishuHandoffProfile.upsert.mock.calls),
    ).not.toContain(plaintext);
    expect(
      JSON.stringify(prisma.handoffSyncRun.update.mock.calls),
    ).not.toContain(plaintext);
  });

  it('deletes an old checklist secret when the source field is empty', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('r1', '客户甲', '   '),
    ]);

    await service.run();

    expect(prisma.feishuHandoffSecret.upsert).not.toHaveBeenCalled();
    expect(prisma.feishuHandoffSecret.deleteMany).toHaveBeenCalledWith({
      where: {
        profileId: 'profile-r1',
        fieldName: 'deploymentChecklist',
      },
    });
  });

  it('records a safe per-record failure and continues without leaking an unknown error', async () => {
    const plaintext = 'top-secret-source-value';
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('bad', '客户甲', plaintext),
      sourceRecord('good', '客户甲', null),
    ]);
    prisma.$transaction
      .mockRejectedValueOnce(new Error(`database rejected ${plaintext}`))
      .mockImplementationOnce(
        (operation: (client: typeof prisma) => Promise<unknown>) =>
          operation(prisma),
      );

    await service.run();

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(lastArgument(prisma.handoffSyncRun.update)).toMatchObject({
      data: {
        status: 'SUCCESS',
        createdCount: 1,
        failedCount: 1,
        errorSummary: 'bad: record mapping or persistence failed',
      },
    });
    expect(
      JSON.stringify(prisma.handoffSyncRun.update.mock.calls),
    ).not.toContain(plaintext);
  });

  it('limits the safe error summary to twenty records', async () => {
    feishu.listAllRecords.mockResolvedValue(
      Array.from({ length: 22 }, (_, index) => ({
        record_id: `bad-${index + 1}`,
        fields: {},
      })),
    );

    await service.run();

    const summary = (
      lastArgument(prisma.handoffSyncRun.update).data as {
        errorSummary: string;
      }
    ).errorSummary;
    expect(summary.split('\n')).toHaveLength(20);
    expect(summary).toContain('bad-1: 客户名称 is required');
    expect(summary).not.toContain('bad-21');
  });

  it('soft-deletes missing active profiles only after the complete fetch and iteration', async () => {
    feishu.listAllRecords.mockResolvedValue([
      sourceRecord('present', '客户甲', null),
    ]);
    prisma.feishuHandoffProfile.findMany.mockResolvedValue([
      {
        externalRecordId: 'present',
        customerId: null,
        deletedAt: null,
        customer: null,
      },
      {
        externalRecordId: 'missing',
        customerId: null,
        deletedAt: null,
        customer: null,
      },
      {
        externalRecordId: 'already-deleted',
        customerId: null,
        deletedAt: new Date(),
        customer: null,
      },
    ]);

    await service.run();

    expect(lastArgument(prisma.feishuHandoffProfile.updateMany)).toMatchObject({
      where: {
        externalRecordId: { in: ['missing'] },
        deletedAt: null,
      },
    });
    const deletion = lastArgument(prisma.feishuHandoffProfile.updateMany) as {
      data: { deletedAt: unknown };
    };
    expect(deletion.data.deletedAt).toBeInstanceOf(Date);
  });

  it('never soft-deletes when the full fetch fails, marks the run failed safely, and resets running', async () => {
    feishu.listAllRecords.mockRejectedValue(
      new Error('fetch failed with deployment-password'),
    );

    await expect(service.run()).rejects.toThrow(
      'fetch failed with deployment-password',
    );

    expect(prisma.feishuHandoffProfile.updateMany).not.toHaveBeenCalled();
    expect(lastArgument(prisma.handoffSyncRun.update)).toMatchObject({
      data: {
        status: 'FAILED',
        errorSummary: 'Handoff synchronization failed',
      },
    });
    const failedUpdate = lastArgument(prisma.handoffSyncRun.update) as {
      data: { finishedAt: unknown };
    };
    expect(failedUpdate.data.finishedAt).toBeInstanceOf(Date);
    expect(service.isRunning).toBe(false);
  });

  it('rejects disabled and concurrent synchronization attempts and always releases the lock', async () => {
    values.FEISHU_HANDOFF_SYNC_ENABLED = false;
    await expect(service.run()).rejects.toBeInstanceOf(ConflictException);

    values.FEISHU_HANDOFF_SYNC_ENABLED = true;
    let release: (() => void) | undefined;
    feishu.listAllRecords.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = () => resolve([]);
        }),
    );
    const first = service.run();
    await Promise.resolve();
    await expect(service.run()).rejects.toBeInstanceOf(ConflictException);
    release?.();
    await first;
    expect(service.isRunning).toBe(false);
  });

  it('recovers interrupted runs on startup', async () => {
    await service.onModuleInit();

    expect(lastArgument(prisma.handoffSyncRun.updateMany)).toMatchObject({
      where: { status: 'RUNNING' },
      data: {
        status: 'FAILED',
        errorSummary: 'API process restarted before synchronization completed',
      },
    });
    const recovery = lastArgument(prisma.handoffSyncRun.updateMany) as {
      data: { finishedAt: unknown };
    };
    expect(recovery.data.finishedAt).toBeInstanceOf(Date);
  });

  it('uses the 02:30 Asia/Shanghai cron and skips disabled schedules', async () => {
    const scheduledMethod = Object.getOwnPropertyDescriptor(
      HandoffSyncService.prototype,
      'runScheduledSync',
    )?.value as unknown as object;
    const metadata = Reflect.getMetadata(
      SCHEDULE_CRON_OPTIONS,
      scheduledMethod,
    ) as { cronTime: string; timeZone: string };
    expect(metadata).toMatchObject({
      cronTime: '30 2 * * *',
      timeZone: 'Asia/Shanghai',
    });

    values.FEISHU_HANDOFF_SYNC_ENABLED = false;
    const run = jest.spyOn(service, 'run');
    await service.runScheduledSync();
    expect(run).not.toHaveBeenCalled();
  });

  it('logs only a generic message when a scheduled run fails', async () => {
    const logger = (service as unknown as { logger: { error: jest.Mock } })
      .logger;
    jest.spyOn(logger, 'error');
    jest
      .spyOn(service, 'run')
      .mockRejectedValue(new Error('secret scheduled failure'));

    await service.runScheduledSync();

    expect(logger.error).toHaveBeenCalledWith(
      'Scheduled handoff synchronization failed; inspect synchronization history',
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
  });
});

describe('createHandoffSecretProvider', () => {
  it('does not require an encryption key while handoff synchronization is disabled', () => {
    const config = {
      get: jest.fn().mockReturnValue(false),
      getOrThrow: jest.fn(),
    };

    expect(() => createHandoffSecretProvider(config as never)).not.toThrow();
    expect(config.getOrThrow).not.toHaveBeenCalled();
  });
});
