import type {
  ConsumptionAccountResult,
  ConsumptionAnalysis,
  ConsumptionFilters,
  ConsumptionSyncStatus,
} from '../../../api/types'

export const baseFilters: ConsumptionFilters = {
  period: 14,
  source: 'ALL',
  accountId: '',
  product: '',
  managerName: '',
  anomalyStatus: 'ALL',
  direction: 'ALL',
}

const account = (
  accountId: string,
  accountName: string,
  currentAmount: number,
  previousAmount: number,
  anomalyStatus: ConsumptionAccountResult['anomalyStatus'],
): ConsumptionAccountResult => ({
  accountId,
  externalId: `external-${accountId}`,
  accountName,
  source: accountId === 'rise' ? 'OVERSEAS' : 'DOMESTIC',
  managerName: accountId === 'rise' ? null : '王雨轩',
  currentAmount,
  previousAmount,
  changeRate: previousAmount
    ? ((currentAmount - previousAmount) / previousAmount) * 100
    : null,
  direction:
    previousAmount === 0
      ? 'UNCOMPARABLE'
      : currentAmount > previousAmount
        ? 'UP'
        : currentAmount < previousAmount
          ? 'DOWN'
          : 'FLAT',
  anomalyStatus,
  products: [accountId === 'rise' ? 'APM' : '日志'],
  lastActiveDate: currentAmount ? '2026-08-20' : '2026-08-06',
  reason: anomalyStatus === 'NORMAL' ? null : '周期消费变化超过异常阈值',
  confidence: 'HIGH',
})

export const accountItems = [
  account('drop', '下降账户', 20, 100, 'DROP'),
  account('rise', '增长账户', 90, 30, 'RISE'),
  account('silent', '停用账户', 0, 40, 'SILENT'),
]

export const productItems = [
  {
    product: '日志',
    currentAmount: 20,
    previousAmount: 140,
    changeRate: -85.7,
    share: 18.2,
  },
  {
    product: 'APM',
    currentAmount: 90,
    previousAmount: 30,
    changeRate: 200,
    share: 81.8,
  },
]

const currentDates = Array.from(
  { length: 14 },
  (_, index) => `2026-08-${String(index + 7).padStart(2, '0')}`,
)
const previousDates = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 24 + index))
  return date.toISOString().slice(0, 10)
})

export const dashboardAnalysis: ConsumptionAnalysis = {
  periodDays: 14,
  source: 'ALL',
  range: {
    current: { from: '2026-08-07', to: '2026-08-20' },
    previous: { from: '2026-07-24', to: '2026-08-06' },
  },
  dataThrough: '2026-08-20',
  lastSyncedAt: '2026-08-20T05:00:03.000Z',
  unit: 'CNY',
  kpis: {
    currentAmount: 110,
    previousAmount: 170,
    changeRate: -35.3,
    dailyAverage: 7.8571,
    activeAccounts: 2,
    anomalyAccounts: 3,
  },
  trend: currentDates.map((currentDate, index) => ({
    index,
    currentDate,
    previousDate: previousDates[index],
    currentAmount: index === 13 ? 110 : 0,
    previousAmount: index === 13 ? 170 : 0,
  })),
  coverage: currentDates.map((date) => ({
    date,
    domestic: true,
    overseas: true,
  })),
  missingDates: [],
  productDistribution: productItems,
  sourceDistribution: [
    {
      source: 'DOMESTIC',
      currentAmount: 20,
      previousAmount: 140,
      changeRate: -85.7,
      share: 18.2,
    },
    {
      source: 'OVERSEAS',
      currentAmount: 90,
      previousAmount: 30,
      changeRate: 200,
      share: 81.8,
    },
  ],
  accountRanking: accountItems,
  anomalies: accountItems,
  summary: [
    '本期消费较上期下降 35.3%',
    'APM 是本期最大增长来源',
    '3 个账户需要关注',
  ],
  filters: {
    products: ['APM', '日志'],
    managers: ['王雨轩'],
    accounts: accountItems.map((item) => ({
      id: item.accountId,
      source: item.source,
      externalId: item.externalId,
      displayName: item.accountName,
      managerName: item.managerName,
    })),
  },
}

export const successStatus: ConsumptionSyncStatus = {
  enabled: true,
  running: false,
  lastSuccessfulRun: {
    id: 'run-1',
    status: 'SUCCESS',
    rangeStart: '2026-07-24',
    rangeEnd: '2026-08-20',
    readCount: 100,
    accountCount: 20,
    rowCount: 80,
    errorSummary: null,
    startedAt: '2026-08-20T05:00:00.000Z',
    finishedAt: '2026-08-20T05:00:03.000Z',
  },
  lastRun: null,
  nextScheduledAt: '2026-08-21T05:00:00.000Z',
}
