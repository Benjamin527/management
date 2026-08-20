import { addUtcDays, dateKey } from './consumption-window';

export type ConsumptionSourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS';
type ConsumptionSource = Exclude<ConsumptionSourceFilter, 'ALL'>;

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
  amount: number;
  recent7Amount: number;
  previous7Amount: number;
  products: Set<string>;
  lastActiveDate: string | null;
};

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function changeRate(current: number, previous: number) {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function analyzeConsumption(
  rows: ConsumptionRow[],
  coverageRows: ConsumptionCoverageRow[],
  options: {
    source: ConsumptionSourceFilter;
    rangeStart: Date;
    rangeEnd: Date;
    lastSyncedAt: Date | null;
  },
) {
  const rangeStartKey = dateKey(options.rangeStart);
  const rangeEndKey = dateKey(options.rangeEnd);
  const recentStartKey = dateKey(addUtcDays(options.rangeStart, 7));
  const dates = Array.from({ length: 14 }, (_, index) =>
    dateKey(addUtcDays(options.rangeStart, index)),
  );
  const totalsByDate = new Map<string, number>();
  const accounts = new Map<string, AccountAggregate>();
  const products = new Map<string, number>();

  for (const row of rows) {
    const key = dateKey(row.date);
    if (key < rangeStartKey || key > rangeEndKey) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const aggregate = accounts.get(row.account.id) ?? {
      accountId: row.account.id,
      externalId: row.account.externalId,
      accountName: row.account.displayName,
      source: row.account.source,
      managerName: row.account.managerName,
      amount: 0,
      recent7Amount: 0,
      previous7Amount: 0,
      products: new Set<string>(),
      lastActiveDate: null,
    };

    aggregate.amount += amount;
    if (key >= recentStartKey) aggregate.recent7Amount += amount;
    else aggregate.previous7Amount += amount;
    aggregate.products.add(row.product);
    if (amount !== 0) {
      aggregate.lastActiveDate =
        !aggregate.lastActiveDate || key > aggregate.lastActiveDate
          ? key
          : aggregate.lastActiveDate;
    }
    accounts.set(row.account.id, aggregate);
    totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + amount);
    products.set(row.product, (products.get(row.product) ?? 0) + amount);
  }

  const sourceCoverage = new Map<
    string,
    { domestic: boolean; overseas: boolean }
  >();
  for (const day of dates) {
    sourceCoverage.set(day, { domestic: false, overseas: false });
  }
  for (const row of coverageRows) {
    const key = dateKey(row.date);
    const day = sourceCoverage.get(key);
    if (!day) continue;
    if (row.source === 'DOMESTIC') day.domestic = true;
    if (row.source === 'OVERSEAS') day.overseas = true;
  }
  const coverage = dates.map((date) => ({
    date,
    ...(sourceCoverage.get(date) ?? { domestic: false, overseas: false }),
  }));
  const isAvailable = (day: (typeof coverage)[number]) => {
    if (options.source === 'DOMESTIC') return day.domestic;
    if (options.source === 'OVERSEAS') return day.overseas;
    return day.domestic && day.overseas;
  };
  const availableDates = coverage.filter(isAvailable).map((day) => day.date);
  const missingDates = coverage
    .filter((day) => !isAvailable(day))
    .map((day) => day.date);
  const confidence = missingDates.length ? ('LOW' as const) : ('HIGH' as const);

  const accountRanking = [...accounts.values()]
    .filter((account) => account.amount !== 0)
    .map((account) => ({
      accountId: account.accountId,
      externalId: account.externalId,
      accountName: account.accountName,
      source: account.source,
      managerName: account.managerName,
      amount: rounded(account.amount),
      recent7Amount: rounded(account.recent7Amount),
      previous7Amount: rounded(account.previous7Amount),
      changeRate: changeRate(account.recent7Amount, account.previous7Amount),
      products: [...account.products].sort(),
      lastActiveDate: account.lastActiveDate,
    }))
    .sort((left, right) => right.amount - left.amount);

  const anomalies = [...accounts.values()]
    .map((account) => {
      const base = {
        accountId: account.accountId,
        externalId: account.externalId,
        accountName: account.accountName,
        source: account.source,
        managerName: account.managerName,
        amount: rounded(account.amount),
        recent7Amount: rounded(account.recent7Amount),
        previous7Amount: rounded(account.previous7Amount),
        changeRate: changeRate(account.recent7Amount, account.previous7Amount),
        confidence,
      };
      if (account.previous7Amount > 0 && account.recent7Amount === 0) {
        return {
          ...base,
          type: 'SILENT' as const,
          reason: '最近 7 天无消费记录',
        };
      }
      if (
        account.previous7Amount > 0 &&
        account.recent7Amount < account.previous7Amount * 0.7
      ) {
        return {
          ...base,
          type: 'DROP' as const,
          reason: '较此前 7 天下降超过 30%',
        };
      }
      if (
        account.previous7Amount > 0 &&
        account.recent7Amount > account.previous7Amount * 1.5
      ) {
        return {
          ...base,
          type: 'RISE' as const,
          reason: '较此前 7 天增长超过 50%',
        };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => {
      const order = { SILENT: 0, DROP: 1, RISE: 2 };
      return order[left.type] - order[right.type];
    });

  const recent7Amount = dates
    .slice(7)
    .reduce((sum, date) => sum + (totalsByDate.get(date) ?? 0), 0);
  const previous7Amount = dates
    .slice(0, 7)
    .reduce((sum, date) => sum + (totalsByDate.get(date) ?? 0), 0);
  const totalAmount = recent7Amount + previous7Amount;

  return {
    periodDays: 14,
    source: options.source,
    range: { from: rangeStartKey, to: rangeEndKey },
    dataThrough: rangeEndKey,
    lastSyncedAt: options.lastSyncedAt?.toISOString() ?? null,
    unit: 'CNY',
    kpis: {
      totalAmount: rounded(totalAmount),
      recent7Amount: rounded(recent7Amount),
      previous7Amount: rounded(previous7Amount),
      changeRate: changeRate(recent7Amount, previous7Amount),
      activeAccounts: accountRanking.length,
      anomalyAccounts: anomalies.length,
    },
    trend: dates.map((date) => ({
      date,
      amount: rounded(totalsByDate.get(date) ?? 0),
    })),
    coverage,
    availableDates,
    missingDates,
    productDistribution: [...products.entries()]
      .map(([product, amount]) => ({
        product,
        amount: rounded(amount),
        unit: 'CNY',
        share: totalAmount
          ? Number(((amount / totalAmount) * 100).toFixed(1))
          : 0,
      }))
      .sort((left, right) => right.amount - left.amount),
    accountRanking,
    anomalies,
    filters: {
      accounts: [...accounts.values()]
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
      products: [...products.keys()].sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    },
  };
}
