import { ConsumptionService } from './consumption.service';

describe('ConsumptionService', () => {
  it('queries the requested customer and product across current and previous periods', async () => {
    type QueryArgs = {
      where: { customerId?: string; product?: string };
      include: {
        customer: {
          select: {
            id: boolean;
            name: boolean;
            owner: { select: { name: boolean } };
          };
        };
      };
    };
    let capturedQuery: QueryArgs | undefined;
    const findMany = (args: QueryArgs) => {
      capturedQuery = args;
      return Promise.resolve([]);
    };
    const prisma = {
      consumptionDaily: { findMany },
    };
    const service = new ConsumptionService(prisma as never);

    const result = await service.analysis(
      { days: 30, customerId: 'c1', product: '日志' },
      new Date('2026-08-20T12:00:00.000Z'),
    );

    expect(capturedQuery).toBeDefined();
    if (!capturedQuery) throw new Error('Prisma query was not captured');
    expect(capturedQuery.where).toMatchObject({
      customerId: 'c1',
      product: '日志',
    });
    expect(capturedQuery.include).toEqual({
      customer: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true } },
        },
      },
    });
    expect(result.periodDays).toBe(30);
    expect(Array.isArray(result.trend)).toBe(true);
  });
});
