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
    };
    const service = new CustomersService(prisma as never);

    await expect(
      service.list({ page: 2, pageSize: 10, keyword: '太保', status: CustomerStatus.ACTIVE }),
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
