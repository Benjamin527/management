import { ConflictException } from '@nestjs/common';
import { CustomerStatus } from '../generated/prisma/enums';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  it('lists active records with normalized pagination and filters', async () => {
    const prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      feishuServiceRecord: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CustomersService(prisma as never);

    await expect(
      service.list({
        page: 2,
        pageSize: 10,
        keyword: '太保',
        status: CustomerStatus.ACTIVE,
      }),
    ).resolves.toEqual({ items: [], page: 2, pageSize: 10, total: 0 });
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

  it('adds monthly trend and high-frequency issue types to customer detail', async () => {
    const prisma = {
      customer: {
        findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: '太保' }),
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
