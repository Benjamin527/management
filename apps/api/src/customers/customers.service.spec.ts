import { ConflictException } from '@nestjs/common';
import { CustomerStatus } from '../generated/prisma/enums';
import { CustomersService } from './customers.service';

function firstCallArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

describe('CustomersService', () => {
  it('lists active records with normalized pagination and filters', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      feishuServiceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      feishuHandoffProfile: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CustomersService(prisma as never);

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        keyword: '太保',
        status: CustomerStatus.ACTIVE,
      }),
    ).resolves.toEqual({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
      handoffOverview: {
        customerTotal: 0,
        handedOver: 0,
        pending: 0,
        unmatched: 0,
        legacyIssues: 0,
      },
    });
    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: {
          deletedAt: null,
          name: { contains: '太保' },
          status: CustomerStatus.ACTIVE,
        },
      }),
    );
  });

  it('adds a batched 2026 service summary to customer rows', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'c1', name: '太保' }]),
        count: jest.fn().mockResolvedValue(1),
      },
      feishuServiceRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'c1',
            startDate: new Date('2026-08-19T03:20:00.000Z'),
            normalizedStatus: 'WAITING_REPLY',
          },
          {
            customerId: 'c1',
            startDate: new Date('2026-08-18T03:20:00.000Z'),
            normalizedStatus: 'RESOLVED',
          },
        ]),
      },
      feishuHandoffProfile: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new CustomersService(prisma as never);

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.items[0]).toMatchObject({
      service2026: {
        total: 2,
        open: 1,
        lastServiceAt: new Date('2026-08-19T03:20:00.000Z'),
      },
    });
    expect(prisma.feishuServiceRecord.findMany).toHaveBeenCalledTimes(1);
  });

  it('filters customers by handoff state, source status and deployment metadata', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValueOnce(0).mockResolvedValue(96),
      },
      feishuServiceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      feishuHandoffProfile: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new CustomersService(prisma as never);

    await service.list({
      page: 1,
      pageSize: 20,
      handoffState: 'HANDED_OVER',
      handoffStatus: '审核通过',
      deploymentType: 'SAAS',
      hasLegacyIssues: true,
    } as never);

    const call = firstCallArgument(prisma.customer.findMany);
    expect(call).toMatchObject({
      where: {
        deletedAt: null,
        handoffProfile: {
          is: {
            deletedAt: null,
            handoffStatus: '审核通过',
            deploymentType: 'SAAS',
            legacyIssues: { not: null },
          },
        },
      },
    });
    const typedCall = call as {
      include: { handoffProfile: { select: Record<string, boolean> } };
    };
    expect(typedCall.include.handoffProfile.select).not.toHaveProperty(
      'rawFieldsMasked',
    );
    expect(typedCall.include.handoffProfile.select).not.toHaveProperty(
      'secrets',
    );
    expect(typedCall.include.handoffProfile.select).not.toHaveProperty(
      'deploymentChecklistMasked',
    );
  });

  it('returns handoff overview counts independently from the current page filters', async () => {
    const customerCount = jest
      .fn()
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(96)
      .mockResolvedValueOnce(39);
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: customerCount,
      },
      feishuServiceRecord: { findMany: jest.fn().mockResolvedValue([]) },
      feishuHandoffProfile: {
        count: jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(7),
      },
    };
    const service = new CustomersService(prisma as never);

    const result = await service.list({
      page: 1,
      pageSize: 20,
      keyword: '太保',
    });

    expect(result.total).toBe(4);
    expect(result.handoffOverview).toEqual({
      customerTotal: 96,
      handedOver: 39,
      pending: 57,
      unmatched: 2,
      legacyIssues: 7,
    });
    expect(customerCount).toHaveBeenNthCalledWith(2, {
      where: { deletedAt: null },
    });
    expect(customerCount).toHaveBeenNthCalledWith(3, {
      where: { deletedAt: null, handoffProfile: { is: { deletedAt: null } } },
    });
  });

  it('adds monthly trend and high-frequency issue types to customer detail', async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          name: '太保',
          handoffProfile: {
            id: 'profile-1',
            externalRecordId: 'rec-1',
            deploymentType: 'SAAS',
            deploymentChecklistMasked: '包含受保护的部署信息',
            saasSites: ['杭州'],
            featureUsage: ['日志', 'APM'],
            logCollection: ['kubernetes 日志'],
            logCollectionNotes: '标准输出',
            apmProbes: ['ddtrace'],
            apmNotes: null,
            rumApps: ['Web'],
            rumNotes: null,
            customFeatures: '批量任务',
            handoffPeople: ['苏桐桐'],
            handoffAt: new Date('2026-04-14T00:00:00.000Z'),
            handoffStatus: '审核通过',
            importantIssues: '历史重要问题',
            legacyIssues: '仍需跟进',
            communicationChannel: '微信群',
            contactInfo: '廖老师',
            sourceUpdatedAt: new Date('2026-08-20T00:00:00.000Z'),
            syncedAt: new Date('2026-08-21T00:00:00.000Z'),
          },
        }),
      },
      feishuServiceRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            startDate: new Date('2026-01-10T00:00:00+08:00'),
            normalizedStatus: 'RESOLVED',
            issueTypeNormalized: '监控问题',
          },
          {
            startDate: new Date('2026-01-11T00:00:00+08:00'),
            normalizedStatus: 'WAITING_REPLY',
            issueTypeNormalized: '监控问题',
          },
        ]),
      },
    };
    const service = new CustomersService(prisma as never);

    const result = await service.findOne('c1');

    expect(result.service2026).toMatchObject({
      total: 2,
      open: 1,
      monthlyTrend: [{ month: '2026-01', count: 2 }],
      topIssueTypes: [{ issueType: '监控问题', count: 2 }],
    });
    expect(result.handoffProfile).toMatchObject({
      profileId: 'profile-1',
      deploymentType: 'SAAS',
      deploymentChecklistMasked: '包含受保护的部署信息',
      saasSites: ['杭州'],
      legacyIssues: '仍需跟进',
    });
    expect(result.handoffProfile).not.toHaveProperty('rawFieldsMasked');
    expect(result.handoffProfile).not.toHaveProperty('secrets');
    const findCall = firstCallArgument(prisma.customer.findFirst) as {
      include: { handoffProfile: { select: Record<string, boolean> } };
    };
    expect(findCall.include.handoffProfile.select).not.toHaveProperty(
      'rawFieldsMasked',
    );
    expect(findCall.include.handoffProfile.select).not.toHaveProperty(
      'secrets',
    );
  });

  it('turns duplicate names into a business conflict', async () => {
    const prisma = {
      customer: {
        create: jest.fn().mockRejectedValue({ code: 'P2002' }),
      },
    };
    const service = new CustomersService(prisma as never);

    await expect(service.create({ name: '太保' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
