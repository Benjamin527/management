export type ConsumptionRow = {
  date: Date;
  amount: number | string | { toString(): string };
  product: string;
  unit: string | null;
  customer: {
    id: string;
    name: string;
    owner: { name: string } | null;
  };
};

type CustomerAggregate = {
  id: string;
  name: string;
  owner: string | null;
  amount: number;
  previousAmount: number;
  products: Set<string>;
  lastActiveDate: string | null;
};

const dayMs = 86_400_000;

function startOfUtcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * dayMs);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function changeRate(current: number, previous: number) {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function rounded(value: number) {
  return Number(value.toFixed(4));
}

export function consumptionPeriodStart(days: number, now = new Date()) {
  return addDays(startOfUtcDay(now), -(days * 2 - 1));
}

export function analyzeConsumption(
  rows: ConsumptionRow[],
  options: { days: 7 | 30 | 60; now?: Date },
) {
  const now = options.now ?? new Date();
  const today = startOfUtcDay(now);
  const currentStart = addDays(today, -(options.days - 1));
  const previousStart = addDays(currentStart, -options.days);
  const currentStartKey = dateKey(currentStart);
  const todayKey = dateKey(today);
  const previousStartKey = dateKey(previousStart);
  const totalsByDate = new Map<string, number>();
  const customers = new Map<string, CustomerAggregate>();
  const products = new Map<string, { amount: number; unit: string | null }>();
  const currentUnits = new Set<string>();

  for (const row of rows) {
    const key = dateKey(row.date);
    if (key < previousStartKey || key > todayKey) continue;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount)) continue;
    const aggregate = customers.get(row.customer.id) ?? {
      id: row.customer.id,
      name: row.customer.name,
      owner: row.customer.owner?.name ?? null,
      amount: 0,
      previousAmount: 0,
      products: new Set<string>(),
      lastActiveDate: null,
    };

    if (key >= currentStartKey) {
      aggregate.amount += amount;
      aggregate.products.add(row.product);
      aggregate.lastActiveDate =
        !aggregate.lastActiveDate || key > aggregate.lastActiveDate
          ? key
          : aggregate.lastActiveDate;
      totalsByDate.set(key, (totalsByDate.get(key) ?? 0) + amount);
      const product = products.get(row.product) ?? { amount: 0, unit: row.unit };
      product.amount += amount;
      products.set(row.product, product);
      if (row.unit) currentUnits.add(row.unit);
    } else {
      aggregate.previousAmount += amount;
    }
    customers.set(row.customer.id, aggregate);
  }

  const trend = Array.from({ length: options.days }, (_, index) => {
    const key = dateKey(addDays(currentStart, index));
    return { date: key, amount: rounded(totalsByDate.get(key) ?? 0) };
  });
  const customerRanking = [...customers.values()]
    .filter((customer) => customer.amount > 0)
    .map((customer) => ({
      customerId: customer.id,
      customerName: customer.name,
      owner: customer.owner,
      amount: rounded(customer.amount),
      previousAmount: rounded(customer.previousAmount),
      changeRate: changeRate(customer.amount, customer.previousAmount),
      products: [...customer.products].sort(),
      lastActiveDate: customer.lastActiveDate,
    }))
    .sort((a, b) => b.amount - a.amount);
  const silentCutoff = dateKey(addDays(today, -6));
  const anomalies = [...customers.values()]
    .map((customer) => {
      const base = {
        customerId: customer.id,
        customerName: customer.name,
        owner: customer.owner,
        amount: rounded(customer.amount),
        previousAmount: rounded(customer.previousAmount),
        changeRate: changeRate(customer.amount, customer.previousAmount),
      };
      if (
        customer.previousAmount > 0 &&
        (customer.amount === 0 ||
          (customer.lastActiveDate && customer.lastActiveDate < silentCutoff))
      ) {
        return { ...base, type: 'SILENT' as const, reason: '最近 7 天无消费记录' };
      }
      if (
        customer.previousAmount > 0 &&
        customer.amount < customer.previousAmount * 0.7
      ) {
        return { ...base, type: 'DROP' as const, reason: '较上一周期下降超过 30%' };
      }
      if (
        customer.previousAmount > 0 &&
        customer.amount > customer.previousAmount * 1.5
      ) {
        return { ...base, type: 'RISE' as const, reason: '较上一周期增长超过 50%' };
      }
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => {
      const order = { SILENT: 0, DROP: 1, RISE: 2 };
      return order[a.type] - order[b.type];
    });
  const totalAmount = customerRanking.reduce(
    (sum, customer) => sum + customer.amount,
    0,
  );
  const previousAmount = [...customers.values()].reduce(
    (sum, customer) => sum + customer.previousAmount,
    0,
  );

  return {
    periodDays: options.days,
    range: { from: currentStartKey, to: todayKey },
    unit:
      currentUnits.size === 1
        ? [...currentUnits][0]
        : currentUnits.size > 1
          ? '多单位'
          : null,
    kpis: {
      totalAmount: rounded(totalAmount),
      previousAmount: rounded(previousAmount),
      changeRate: changeRate(totalAmount, previousAmount),
      activeCustomers: customerRanking.length,
      anomalyCustomers: anomalies.length,
    },
    trend,
    productDistribution: [...products.entries()]
      .map(([product, value]) => ({
        product,
        amount: rounded(value.amount),
        unit: value.unit,
        share: totalAmount
          ? Number(((value.amount / totalAmount) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.amount - a.amount),
    customerRanking,
    anomalies,
    filters: {
      products: [...products.keys()].sort(),
    },
  };
}
