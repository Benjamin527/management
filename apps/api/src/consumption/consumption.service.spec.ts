import { ConsumptionService } from './consumption.service';

describe('ConsumptionService', () => {
  it('queries the requested customer and product across current and previous periods', async () => {
    const prisma = {
      consumptionDaily: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ConsumptionService(prisma as never);

    const result = await service.analysis(
      { days: 30, customerId: 'c1', product: '日志' },
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(prisma.consumptionDaily.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: 'c1', product: '日志' }),
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              owner: { select: { name: true } },
            },
          },
        },
      }),
    );
    expect(result).toMatchObject({ periodDays: 30, trend: expect.any(Array) });
  });
});
