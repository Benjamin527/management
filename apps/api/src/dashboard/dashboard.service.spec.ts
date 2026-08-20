import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('returns null consumption metrics when no consumption exists', async () => {
    const prisma = {
      customer: {
        count: jest.fn().mockResolvedValue(8),
        findMany: jest.fn().mockResolvedValue([]),
      },
      serviceIssue: {
        count: jest
          .fn()
          .mockResolvedValueOnce(5)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(10)
          .mockResolvedValueOnce(7),
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'PENDING', _count: { _all: 3 } }]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      consumptionDaily: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new DashboardService(prisma as never);

    const result = await service.summary();

    expect(result.kpis).toMatchObject({
      customerCount: 8,
      openIssueCount: 5,
      overdueIssueCount: 2,
      resolutionRate: 70,
      currentConsumption: null,
    });
  });
});
