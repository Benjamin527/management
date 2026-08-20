import {
  buildDistribution,
  buildSummary,
  ServiceAnalysisService,
  type AnalysisRecord,
} from './service-analysis.service';

function analysisRecord(
  status: AnalysisRecord['normalizedStatus'],
  overrides: Partial<AnalysisRecord> = {},
): AnalysisRecord {
  return {
    startDate: new Date('2026-01-10T00:00:00+08:00'),
    customerName: '客户甲',
    normalizedStatus: status,
    feedbackTypeNormalized: '产品使用',
    issueTypeNormalized: '监控问题',
    sourceType: '飞书',
    deploymentType: 'SaaS',
    firstLineEngineer: '工程师甲',
    thirdLineEngineer: null,
    satisfaction: null,
    ticketId: null,
    keyIssue: false,
    rawFields: {},
    syncedAt: new Date('2026-08-20T02:00:00+08:00'),
    ...overrides,
  };
}

describe('service analysis aggregation', () => {
  const records: AnalysisRecord[] = [
    analysisRecord('RESOLVED', {
      customerName: '客户甲',
      feedbackTypeNormalized: 'Bug',
      issueTypeNormalized: 'DataKit 问题',
      satisfaction: 5,
      ticketId: 'ticket-1',
      keyIssue: true,
      rawFields: { 重点问题: true },
    }),
    analysisRecord('RESOLVED', {
      customerName: '客户乙',
      issueTypeNormalized: 'DataKit 问题',
    }),
    analysisRecord('CLOSED', { customerName: '客户乙' }),
    analysisRecord('WAITING_REPLY', { customerName: '客户丙' }),
    analysisRecord('IN_PROGRESS', { customerName: '客户丙' }),
    analysisRecord('ESCALATED', {
      customerName: '客户丁',
      thirdLineEngineer: '研发甲',
    }),
    analysisRecord('UNKNOWN', {
      customerName: '未填写客户',
      firstLineEngineer: null,
    }),
  ];

  it('builds the agreed 2026 KPI definitions', () => {
    expect(buildSummary(records)).toMatchObject({
      total: 7,
      waitingReply: 1,
      inProgress: 1,
      escalated: 1,
      bugCount: 1,
      bugRate: 14.29,
      resolvedOrClosedRate: 42.86,
      customerCount: 4,
      quality: {
        firstLineEngineer: { populated: 6, total: 7, rate: 85.71 },
        satisfaction: { populated: 1, total: 7, rate: 14.29 },
        ticketId: { populated: 1, total: 7, rate: 14.29 },
        keyIssue: { populated: 1, total: 7, rate: 14.29 },
        supportsPreciseSla: false,
      },
    });
  });

  it('groups normalized issue types', () => {
    expect(buildDistribution(records, 'issueType')).toContainEqual({
      key: 'DataKit 问题',
      count: 2,
    });
  });

  it('queries only active records inside 2026', async () => {
    const findMany = jest.fn().mockResolvedValue(records);
    const service = new ServiceAnalysisService({
      feishuServiceRecord: { findMany },
    } as never);

    await service.summary(2026);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          startDate: {
            gte: new Date('2025-12-31T16:00:00.000Z'),
            lt: new Date('2026-12-31T16:00:00.000Z'),
          },
        },
      }),
    );
  });

  it('rejects analysis years other than 2026', async () => {
    const service = new ServiceAnalysisService({} as never);
    await expect(service.summary(2025)).rejects.toThrow(
      'Only 2026 service data is available',
    );
  });
});
