import type {
  ConsumptionAnomalyFilter,
  ConsumptionDirectionFilter,
  ConsumptionPeriod,
  ConsumptionSourceFilter,
} from './dto/consumption-query.dto';
import { addUtcDays, dateKey } from './consumption-window';

type ConsumptionSource = Exclude<ConsumptionSourceFilter, 'ALL'>;
export type ConsumptionAnomalyStatus = 'SILENT' | 'DROP' | 'RISE' | 'NORMAL';
export type ConsumptionDirection = 'UP' | 'DOWN' | 'FLAT' | 'UNCOMPARABLE';

export type ConsumptionRow = {
  date: Date;
  amount: number | string | { toString(): string };
  product: string;
  unit: string | null;
  account: {
    id: string;
    source: ConsumptionSource;
    externalId: string;
    displayName: string;
    managerName: string | null;
  };
};

export type ConsumptionCoverageRow = {
  source: ConsumptionSource;
  date: Date;
  recordCount: number;
  amount: number | string | { toString(): string };
};

type AccountAggregate = {
  accountId: string;
  externalId: string;
  accountName: string;
  source: ConsumptionSource;
  managerName: string | null;
  currentAmount: number;
  previousAmount: number;
  currentByDate: Map<string, number>;
  previousByDate: Map<string, number>;
  currentProducts: Map<string, number>;
  previousProducts: Map<string, number>;
  products: Set<string>;
  lastActiveDate: string | null;
};

type EnrichedAccount = AccountAggregate & {
  changeRate: number | null;
  direction: ConsumptionDirection;
  anomalyStatus: ConsumptionAnomalyStatus;
  reason: string | null;
};

type AnalysisOptions = {
  period: ConsumptionPeriod;
  source: ConsumptionSourceFilter;
  anomalyStatus: ConsumptionAnomalyFilter;
  direction: ConsumptionDirectionFilter;
  previousRangeStart: Date;
  rangeStart: Date;
  rangeEnd: Date;
  lastSyncedAt: Date | null;
};

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function changeRate(current: number, previous: number) {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function classifyDirection(
  current: number,
  previous: number,
): ConsumptionDirection {
  const value = changeRate(current, previous);
  if (value === null) return 'UNCOMPARABLE';
  if (value > 0) return 'UP';
  if (value < 0) return 'DOWN';
  return 'FLAT';
}

export function classifyAnomaly(
  current: number,
  previous: number,
): ConsumptionAnomalyStatus {
  if (previous > 0 && current === 0) return 'SILENT';
  if (previous > 0 && current < previous * 0.7) return 'DROP';
  if (previous > 0 && current > previous * 1.5) return 'RISE';
  return 'NORMAL';
}

function anomalyReason(status: ConsumptionAnomalyStatus, period: number) {
  if (status === 'SILENT') return `最近 ${period} 天无消费记录`;
  if (status === 'DROP') return '较上一周期下降超过 30%';
  if (status === 'RISE') return '较上一周期增长超过 50%';
  return null;
}

function addAmount(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function coverageFor(coverageRows: ConsumptionCoverageRow[], dates: string[]) {
  const result = new Map(
    dates.map((date) => [date, { domestic: false, overseas: false }]),
  );
  for (const item of coverageRows) {
    const day = result.get(dateKey(item.date));
    if (!day) continue;
    if (item.source === 'DOMESTIC') day.domestic = true;
    if (item.source === 'OVERSEAS') day.overseas = true;
  }
  return result;
}

function isAvailable(
  day: { domestic: boolean; overseas: boolean },
  source: ConsumptionSourceFilter,
) {
  if (source === 'DOMESTIC') return day.domestic;
  if (source === 'OVERSEAS') return day.overseas;
  return day.domestic && day.overseas;
}

function buildSummary(
  currentAmount: number,
  previousAmount: number,
  productDistribution: Array<{
    product: string;
    currentAmount: number;
    previousAmount: number;
  }>,
  accounts: EnrichedAccount[],
  missingDates: string[],
) {
  const summary: string[] = [];
  if (missingDates.length) {
    summary.push(`${missingDates.length} 个日期数据不完整，经营结论为低置信度`);
  }
  const rate = changeRate(currentAmount, previousAmount);
  if (rate === null) {
    summary.push('上一周期消费为 0，暂无法计算周期环比');
  } else if (rate === 0) {
    summary.push('本期消费与上一周期持平');
  } else {
    summary.push(
      `本期消费较上一周期${rate > 0 ? '增长' : '下降'} ${Math.abs(rate)}%`,
    );
  }

  const contribution = [...productDistribution].sort(
    (left, right) =>
      Math.abs(right.currentAmount - right.previousAmount) -
      Math.abs(left.currentAmount - left.previousAmount),
  )[0];
  if (contribution) {
    const delta = contribution.currentAmount - contribution.previousAmount;
    summary.push(
      `${contribution.product} 是本期最大的${delta >= 0 ? '增长' : '下降'}来源`,
    );
  }

  if (summary.length < 3) {
    const anomalyCount = accounts.filter(
      (item) => item.anomalyStatus !== 'NORMAL',
    ).length;
    summary.push(
      anomalyCount ? `${anomalyCount} 个账户需要关注` : '当前没有账户异常信号',
    );
  }
  return summary.slice(0, 3);
}

export function analyzeConsumption(
  rows: ConsumptionRow[],
  coverageRows: ConsumptionCoverageRow[],
  options: AnalysisOptions,
) {
  const previousStartKey = dateKey(options.previousRangeStart);
  const currentStartKey = dateKey(options.rangeStart);
  const rangeEndKey = dateKey(options.rangeEnd);
  const comparisonDates = Array.from(
    { length: options.period * 2 },
    (_, index) => dateKey(addUtcDays(options.previousRangeStart, index)),
  );
  const currentDates = comparisonDates.slice(options.period);
  const previousDates = comparisonDates.slice(0, options.period);
  const coverageMap = coverageFor(coverageRows, comparisonDates);
  const coverage = comparisonDates.map((date) => ({
    date,
    ...(coverageMap.get(date) ?? { domestic: false, overseas: false }),
  }));
  const missingDates = coverage
    .filter((day) => !isAvailable(day, options.source))
    .map((day) => day.date);
  const missingDateSet = new Set(missingDates);
  const confidence = missingDates.length ? ('LOW' as const) : ('HIGH' as const);
  const accounts = new Map<string, AccountAggregate>();

  for (const row of rows) {
    const key = dateKey(row.date);
    if (key < previousStartKey || key > rangeEndKey) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const aggregate = accounts.get(row.account.id) ?? {
      accountId: row.account.id,
      externalId: row.account.externalId,
      accountName: row.account.displayName,
      source: row.account.source,
      managerName: row.account.managerName,
      currentAmount: 0,
      previousAmount: 0,
      currentByDate: new Map<string, number>(),
      previousByDate: new Map<string, number>(),
      currentProducts: new Map<string, number>(),
      previousProducts: new Map<string, number>(),
      products: new Set<string>(),
      lastActiveDate: null,
    };

    const current = key >= currentStartKey;
    if (current) {
      aggregate.currentAmount += amount;
      addAmount(aggregate.currentByDate, key, amount);
      addAmount(aggregate.currentProducts, row.product, amount);
    } else {
      aggregate.previousAmount += amount;
      addAmount(aggregate.previousByDate, key, amount);
      addAmount(aggregate.previousProducts, row.product, amount);
    }
    aggregate.products.add(row.product);
    if (
      amount !== 0 &&
      (!aggregate.lastActiveDate || key > aggregate.lastActiveDate)
    ) {
      aggregate.lastActiveDate = key;
    }
    accounts.set(row.account.id, aggregate);
  }

  const enriched = [...accounts.values()].map<EnrichedAccount>((account) => {
    const anomalyStatus = classifyAnomaly(
      account.currentAmount,
      account.previousAmount,
    );
    return {
      ...account,
      changeRate: changeRate(account.currentAmount, account.previousAmount),
      direction: classifyDirection(
        account.currentAmount,
        account.previousAmount,
      ),
      anomalyStatus,
      reason: anomalyReason(anomalyStatus, options.period),
    };
  });

  const filteredAccounts = enriched.filter((account) => {
    const anomalyMatches =
      options.anomalyStatus === 'ALL' ||
      account.anomalyStatus === options.anomalyStatus;
    const directionMatches =
      options.direction === 'ALL' || account.direction === options.direction;
    return anomalyMatches && directionMatches;
  });

  const currentAmount = filteredAccounts.reduce(
    (sum, account) => sum + account.currentAmount,
    0,
  );
  const previousAmount = filteredAccounts.reduce(
    (sum, account) => sum + account.previousAmount,
    0,
  );
  const productTotals = new Map<
    string,
    { currentAmount: number; previousAmount: number }
  >();
  const sourceTotals = new Map<
    ConsumptionSource,
    { currentAmount: number; previousAmount: number }
  >();

  for (const account of filteredAccounts) {
    for (const product of account.products) {
      const aggregate = productTotals.get(product) ?? {
        currentAmount: 0,
        previousAmount: 0,
      };
      aggregate.currentAmount += account.currentProducts.get(product) ?? 0;
      aggregate.previousAmount += account.previousProducts.get(product) ?? 0;
      productTotals.set(product, aggregate);
    }
    const source = sourceTotals.get(account.source) ?? {
      currentAmount: 0,
      previousAmount: 0,
    };
    source.currentAmount += account.currentAmount;
    source.previousAmount += account.previousAmount;
    sourceTotals.set(account.source, source);
  }

  const productDistribution = [...productTotals.entries()]
    .map(([product, value]) => ({
      product,
      currentAmount: rounded(value.currentAmount),
      previousAmount: rounded(value.previousAmount),
      changeRate: changeRate(value.currentAmount, value.previousAmount),
      share: currentAmount
        ? Number(((value.currentAmount / currentAmount) * 100).toFixed(1))
        : 0,
    }))
    .sort((left, right) => right.currentAmount - left.currentAmount);
  const sourceDistribution = [...sourceTotals.entries()]
    .map(([source, value]) => ({
      source,
      currentAmount: rounded(value.currentAmount),
      previousAmount: rounded(value.previousAmount),
      changeRate: changeRate(value.currentAmount, value.previousAmount),
      share: currentAmount
        ? Number(((value.currentAmount / currentAmount) * 100).toFixed(1))
        : 0,
    }))
    .sort((left, right) => right.currentAmount - left.currentAmount);

  const accountRanking = filteredAccounts
    .map((account) => ({
      accountId: account.accountId,
      externalId: account.externalId,
      accountName: account.accountName,
      source: account.source,
      managerName: account.managerName,
      currentAmount: rounded(account.currentAmount),
      previousAmount: rounded(account.previousAmount),
      changeRate: account.changeRate,
      direction: account.direction,
      anomalyStatus: account.anomalyStatus,
      products: [...account.products].sort(),
      lastActiveDate: account.lastActiveDate,
      reason: account.reason,
      confidence,
    }))
    .sort(
      (left, right) =>
        right.currentAmount - left.currentAmount ||
        right.previousAmount - left.previousAmount,
    );

  const trend = currentDates.map((currentDate, index) => {
    const previousDate = previousDates[index];
    const currentTotal = filteredAccounts.reduce(
      (sum, account) => sum + (account.currentByDate.get(currentDate) ?? 0),
      0,
    );
    const previousTotal = filteredAccounts.reduce(
      (sum, account) => sum + (account.previousByDate.get(previousDate) ?? 0),
      0,
    );
    return {
      index,
      currentDate,
      previousDate,
      currentAmount: missingDateSet.has(currentDate)
        ? null
        : rounded(currentTotal),
      previousAmount: missingDateSet.has(previousDate)
        ? null
        : rounded(previousTotal),
    };
  });
  const kpis = {
    currentAmount: rounded(currentAmount),
    previousAmount: rounded(previousAmount),
    changeRate: changeRate(currentAmount, previousAmount),
    dailyAverage: rounded(currentAmount / options.period),
    activeAccounts: filteredAccounts.filter(
      (account) => account.currentAmount !== 0,
    ).length,
    anomalyAccounts: filteredAccounts.filter(
      (account) => account.anomalyStatus !== 'NORMAL',
    ).length,
  };

  return {
    periodDays: options.period,
    source: options.source,
    range: {
      current: { from: currentStartKey, to: rangeEndKey },
      previous: {
        from: previousStartKey,
        to: dateKey(addUtcDays(options.rangeStart, -1)),
      },
    },
    dataThrough: rangeEndKey,
    lastSyncedAt: options.lastSyncedAt?.toISOString() ?? null,
    unit: 'CNY' as const,
    kpis,
    trend,
    coverage,
    missingDates,
    productDistribution,
    sourceDistribution,
    accountRanking,
    anomalies: accountRanking.filter(
      (account) => account.anomalyStatus !== 'NORMAL',
    ),
    summary: buildSummary(
      currentAmount,
      previousAmount,
      productDistribution,
      filteredAccounts,
      missingDates,
    ),
    filters: {
      accounts: enriched
        .map((account) => ({
          id: account.accountId,
          source: account.source,
          externalId: account.externalId,
          displayName: account.accountName,
          managerName: account.managerName,
        }))
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName, 'zh-CN'),
        ),
      products: [
        ...new Set(enriched.flatMap((account) => [...account.products])),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
      managers: [
        ...new Set(
          enriched
            .map((account) => account.managerName)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((left, right) => left.localeCompare(right, 'zh-CN')),
    },
  };
}
