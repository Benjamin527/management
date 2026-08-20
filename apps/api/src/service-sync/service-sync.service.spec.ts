import { ConflictException } from '@nestjs/common';
import { ServiceSyncService } from './service-sync.service';

function sourceRecord(id: string, customer = '太保') {
  return {
    record_id: id,
    fields: {
      客户名称: customer,
      开始日期: 1767225600000,
      状态: '跟进中',
      '反馈内容（简要描述）': `${id} 的问题`,
    },
  };
}

function lastCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls.at(-1)?.[0];
}

describe('ServiceSyncService', () => {
  let prisma: {
    serviceSyncRun: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    feishuServiceRecord: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
    customer: { upsert: jest.Mock };
    $transaction: jest.Mock;
  };
  let feishu: { searchRecords: jest.Mock };
  let service: ServiceSyncService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-08T10:00:00+08:00'));
    prisma = {
      serviceSyncRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sync-1' }),
        update: jest.fn().mockResolvedValue({ id: 'sync-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      feishuServiceRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'local-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      customer: {
        upsert: jest.fn().mockResolvedValue({ id: 'customer-1' }),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (operation: (client: typeof prisma) => Promise<unknown>) =>
        operation(prisma),
    );
    feishu = { searchRecords: jest.fn().mockResolvedValue([]) };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'FEISHU_SYNC_ENABLED') return true;
        if (key === 'FEISHU_SYNC_YEAR') return 2026;
        return undefined;
      }),
    };
    service = new ServiceSyncService(
      prisma as never,
      feishu as never,
      config as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('upserts fetched records and marks success only after deletion comparison', async () => {
    feishu.searchRecords.mockResolvedValue([
      sourceRecord('r1'),
      sourceRecord('r2'),
    ]);

    const result = await service.run('RECENT', 'admin-id');

    expect(prisma.feishuServiceRecord.upsert).toHaveBeenCalledTimes(2);
    expect(lastCallArgument(prisma.serviceSyncRun.update)).toMatchObject({
      where: { id: 'sync-1' },
      data: {
        status: 'SUCCESS',
        readCount: 2,
        createdCount: 2,
        failedCount: 0,
      },
    });
    expect(result).toMatchObject({ status: 'SUCCESS', readCount: 2 });
  });

  it('does not soft-delete or mark success when Feishu pagination fails', async () => {
    feishu.searchRecords.mockRejectedValue(new Error('page 2 failed'));

    await expect(service.run('RECENT', 'admin-id')).rejects.toThrow(
      'page 2 failed',
    );

    expect(prisma.feishuServiceRecord.updateMany).not.toHaveBeenCalled();
    expect(lastCallArgument(prisma.serviceSyncRun.update)).toMatchObject({
      where: { id: 'sync-1' },
      data: {
        status: 'FAILED',
        errorSummary: 'page 2 failed',
      },
    });
  });

  it('soft-deletes only IDs missing from a completely fetched range', async () => {
    feishu.searchRecords.mockResolvedValue([sourceRecord('r1')]);
    prisma.feishuServiceRecord.findMany.mockResolvedValue([
      { externalRecordId: 'r1' },
      { externalRecordId: 'r-old' },
    ]);
    prisma.feishuServiceRecord.updateMany.mockResolvedValue({ count: 1 });

    await service.run('RECENT', 'admin-id');

    expect(
      lastCallArgument(prisma.feishuServiceRecord.updateMany),
    ).toMatchObject({
      where: { externalRecordId: { in: ['r-old'] } },
      data: {},
    });
    const deletion = lastCallArgument(
      prisma.feishuServiceRecord.updateMany,
    ) as { data: { deletedAt: unknown } };
    expect(deletion.data.deletedAt).toBeInstanceOf(Date);
    expect(lastCallArgument(prisma.serviceSyncRun.update)).toMatchObject({
      where: { id: 'sync-1' },
      data: { deletedCount: 1 },
    });
  });

  it('keeps a fetched ID safe from deletion when its fields cannot be mapped', async () => {
    feishu.searchRecords.mockResolvedValue([
      sourceRecord('r1'),
      { record_id: 'r-bad', fields: { 客户名称: '太保' } },
    ]);
    prisma.feishuServiceRecord.findMany.mockResolvedValue([
      { externalRecordId: 'r1' },
      { externalRecordId: 'r-bad' },
    ]);

    await service.run('RECENT', 'admin-id');

    expect(prisma.feishuServiceRecord.updateMany).not.toHaveBeenCalled();
    expect(lastCallArgument(prisma.serviceSyncRun.update)).toMatchObject({
      where: { id: 'sync-1' },
      data: { status: 'SUCCESS', failedCount: 1 },
    });
  });

  it('rejects a concurrent synchronization', async () => {
    let release: (() => void) | undefined;
    feishu.searchRecords.mockImplementation(
      () =>
        new Promise<unknown[]>((resolve) => {
          release = () => resolve([]);
        }),
    );

    const first = service.run('RECENT', 'admin-id');
    await Promise.resolve();
    await expect(service.run('RECENT', 'admin-id')).rejects.toBeInstanceOf(
      ConflictException,
    );
    release?.();
    await first;
  });
});
