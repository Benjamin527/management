# Consumption Analysis Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有固定 14 天消费页面升级为支持 7/14 天等长对比、统一多维筛选和经营报告式 Dashboard 的完整分析页。

**Architecture:** 消费同步层把本地保留窗口从 14 天扩展到 28 天；分析 API 根据 `period` 切分当前周期和上一周期，并在账户聚合后应用异常状态与变化方向筛选，保证 KPI、趋势、结构、排行和异常清单口径一致。Vue 页面用 URL 作为筛选状态来源，将筛选、KPI、趋势、结构图、排行、异常和同步详情拆成聚焦组件，图表使用 SVG/CSS，不新增图表依赖。

**Tech Stack:** NestJS 11、Prisma 7、Jest 30、Vue 3 Composition API、Vue Router 5、Vitest 4、Vue Test Utils、原生 SVG/CSS。

---

## File Map

### API files

- Modify `apps/api/src/consumption/consumption-window.ts`: 支持可配置的包含式自然日窗口。
- Modify `apps/api/src/consumption/consumption-window.spec.ts`: 验证 28 天同步窗口。
- Reuse `apps/api/src/consumption/consumption-sync.service.ts`: 继续调用窗口函数，自动同步并保留最近 28 天。
- Modify `apps/api/src/consumption/consumption-sync.service.spec.ts`: 验证读取范围与窗口外清理。
- Modify `apps/api/src/consumption/dto/consumption-query.dto.ts`: 增加周期、负责人、异常状态和变化方向校验。
- Modify `apps/api/src/consumption/consumption-analysis.ts`: 实现双周期聚合、统一账户筛选、结构分布和经营摘要。
- Modify `apps/api/src/consumption/consumption-analysis.spec.ts`: 覆盖双周期、异常、方向、结构和缺失日期。
- Modify `apps/api/src/consumption/consumption.service.ts`: 查询 28 天数据、应用基础数据库筛选并调用分析器。
- Modify `apps/api/src/consumption/consumption.service.spec.ts`: 验证查询范围、负责人和返回契约。
- Modify `apps/api/src/consumption/consumption.controller.spec.ts`: 验证查询对象透传。

### Web files

- Modify `apps/web/src/api/types.ts`: 更新消费分析响应类型。
- Modify `apps/web/src/api/consumption.ts`: 序列化完整筛选参数并支持取消请求。
- Create `apps/web/src/composables/useConsumptionFilters.ts`: URL 筛选状态、有效值解析和重置逻辑。
- Create `apps/web/src/composables/__tests__/useConsumptionFilters.spec.ts`: 验证 URL 恢复与重置。
- Create `apps/web/src/components/consumption/AnalysisHeader.vue`: 标题、周期、数据日期和同步摘要。
- Create `apps/web/src/components/consumption/AnalysisFilters.vue`: 六类业务筛选与条件标签。
- Create `apps/web/src/components/consumption/KpiSummary.vue`: 五项 KPI。
- Create `apps/web/src/components/consumption/PeriodTrendChart.vue`: 双周期 SVG 趋势和提示框。
- Create `apps/web/src/components/consumption/BusinessSummary.vue`: 确定性摘要和覆盖提示。
- Create `apps/web/src/components/consumption/ProductMixChart.vue`: 产品结构及反向筛选。
- Create `apps/web/src/components/consumption/SourceMixChart.vue`: 来源比例及反向筛选。
- Create `apps/web/src/components/consumption/AccountRankingTable.vue`: 桌面排行、移动卡片和排序。
- Create `apps/web/src/components/consumption/AnomalyList.vue`: 异常清单和账户定位事件。
- Create `apps/web/src/components/consumption/SyncDetails.vue`: 折叠同步详情和手动同步。
- Create `apps/web/src/components/consumption/__tests__/PeriodTrendChart.spec.ts`: 验证断点和提示数据。
- Create `apps/web/src/components/consumption/__tests__/AnalysisFilters.spec.ts`: 验证筛选事件和清除行为。
- Create `apps/web/src/components/consumption/__tests__/fixtures.ts`: 共享强类型 Dashboard 测试数据。
- Modify `apps/web/src/views/ConsumptionView.vue`: 组装组件、请求竞态处理和保留旧数据刷新。
- Modify `apps/web/tests/consumption-view.spec.ts`: 覆盖页面集成行为。
- Modify `apps/web/src/style.css`: 移除旧消费页规则，保留仅被其他页面使用的通用规则。

无需 Prisma migration：现有表已经按日期存储，扩大保留窗口只改变同步和查询范围。

---

### Task 1: Expand the synchronized snapshot to 28 days

**Files:**
- Modify: `apps/api/src/consumption/consumption-window.ts`
- Modify: `apps/api/src/consumption/consumption-window.spec.ts`
- Modify: `apps/api/src/consumption/consumption-sync.service.spec.ts`

- [ ] **Step 1: Write failing window and sync-range tests**

Replace the fixed-window expectation in `consumption-window.spec.ts` with:

```ts
it('builds twenty-eight inclusive dates ending at the latest business date', () => {
  expect(consumptionWindow(new Date('2026-08-19T00:00:00.000Z'))).toEqual({
    start: new Date('2026-07-23T00:00:00.000Z'),
    end: new Date('2026-08-19T00:00:00.000Z'),
  });
});

it('can build a shorter inclusive analysis window', () => {
  expect(consumptionWindow(new Date('2026-08-19T00:00:00.000Z'), 14)).toEqual({
    start: new Date('2026-08-06T00:00:00.000Z'),
    end: new Date('2026-08-19T00:00:00.000Z'),
  });
});
```

Add this assertion to the successful sync test in `consumption-sync.service.spec.ts`:

```ts
expect(source.readWindow).toHaveBeenCalledWith({
  start: new Date('2026-07-23T00:00:00.000Z'),
  end: new Date('2026-08-19T00:00:00.000Z'),
});
expect(source.readCoverage).toHaveBeenCalledWith({
  start: new Date('2026-07-23T00:00:00.000Z'),
  end: new Date('2026-08-19T00:00:00.000Z'),
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```bash
npm run test -w apps/api -- --runInBand consumption-window.spec.ts consumption-sync.service.spec.ts
```

Expected: FAIL because `consumptionWindow` still starts 13 days before the end and does not accept a day-count argument.

- [ ] **Step 3: Make the window length explicit**

Change the function in `consumption-window.ts` to:

```ts
export function consumptionWindow(latest: Date, days = 28) {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('Consumption window days must be a positive integer');
  }
  const end = dateOnly(latest);
  return { start: addUtcDays(end, -(days - 1)), end };
}
```

Keep `ConsumptionSyncService.run()` calling `consumptionWindow(latest)` so the default 28-day range is used. Rename the sync spec description from “14-day snapshot” to “28-day snapshot.”

- [ ] **Step 4: Run focused tests and verify pass**

Run the command from Step 2.

Expected: PASS for both suites.

- [ ] **Step 5: Commit the synchronization window change**

```bash
git add apps/api/src/consumption/consumption-window.ts apps/api/src/consumption/consumption-window.spec.ts apps/api/src/consumption/consumption-sync.service.spec.ts
git commit -m "feat(api): retain 28 days of consumption data"
```

---

### Task 2: Define and validate the expanded analysis query

**Files:**
- Modify: `apps/api/src/consumption/dto/consumption-query.dto.ts`
- Modify: `apps/api/src/consumption/consumption-analysis.spec.ts`

- [ ] **Step 1: Add failing DTO validation cases**

Add to `consumption-analysis.spec.ts`:

```ts
it.each([7, 14])('accepts a %i-day period', (period) => {
  const query = Object.assign(new ConsumptionQueryDto(), { period });
  expect(validateSync(query)).toHaveLength(0);
});

it.each([1, 30, 'week'])('rejects unsupported period %s', (period) => {
  const query = Object.assign(new ConsumptionQueryDto(), { period });
  expect(validateSync(query)).not.toHaveLength(0);
});

it.each(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL'])(
  'accepts anomaly status %s',
  (anomalyStatus) => {
    const query = Object.assign(new ConsumptionQueryDto(), { anomalyStatus });
    expect(validateSync(query)).toHaveLength(0);
  },
);

it.each(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE'])(
  'accepts direction %s',
  (direction) => {
    const query = Object.assign(new ConsumptionQueryDto(), { direction });
    expect(validateSync(query)).toHaveLength(0);
  },
);
```

- [ ] **Step 2: Run the DTO suite and verify failure**

```bash
npm run test -w apps/api -- --runInBand consumption-analysis.spec.ts
```

Expected: FAIL because the new fields are not decorated and `period` does not transform from query-string text to a number.

- [ ] **Step 3: Implement the query DTO contract**

Replace `consumption-query.dto.ts` with:

```ts
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString } from 'class-validator';

export type ConsumptionPeriod = 7 | 14;
export type ConsumptionSourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS';
export type ConsumptionAnomalyFilter =
  | 'ALL'
  | 'SILENT'
  | 'DROP'
  | 'RISE'
  | 'NORMAL';
export type ConsumptionDirectionFilter =
  | 'ALL'
  | 'UP'
  | 'DOWN'
  | 'FLAT'
  | 'UNCOMPARABLE';

export class ConsumptionQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsIn([7, 14])
  period: ConsumptionPeriod = 14;

  @IsOptional()
  @IsIn(['ALL', 'DOMESTIC', 'OVERSEAS'])
  source: ConsumptionSourceFilter = 'ALL';

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  managerName?: string;

  @IsOptional()
  @IsIn(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL'])
  anomalyStatus: ConsumptionAnomalyFilter = 'ALL';

  @IsOptional()
  @IsIn(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE'])
  direction: ConsumptionDirectionFilter = 'ALL';
}
```

- [ ] **Step 4: Run the DTO suite and verify pass**

Run the command from Step 2.

Expected: PASS for supported and unsupported query values.

- [ ] **Step 5: Commit the API query contract**

```bash
git add apps/api/src/consumption/dto/consumption-query.dto.ts apps/api/src/consumption/consumption-analysis.spec.ts
git commit -m "feat(api): validate consumption dashboard filters"
```

---

### Task 3: Refactor the analysis engine for equal-period comparison

**Files:**
- Modify: `apps/api/src/consumption/consumption-analysis.ts`
- Modify: `apps/api/src/consumption/consumption-analysis.spec.ts`

- [ ] **Step 1: Replace the fixed 14-day test with equal-period tests**

Import `addUtcDays` and `dateKey` from `./consumption-window`. Replace the coverage helper with this date-count version, then add the assertions below:

```ts
const coverage = (start: string, count: number, missingOverseasDate?: string) =>
  Array.from({ length: count }, (_, index) => {
    const date = addUtcDays(new Date(`${start}T00:00:00.000Z`), index);
    return [
      { source: 'DOMESTIC' as const, date, recordCount: 10, amount: 1 },
      ...(dateKey(date) === missingOverseasDate
        ? []
        : [{ source: 'OVERSEAS' as const, date, recordCount: 2, amount: 1 }]),
    ];
  }).flat();

it.each([
  { period: 7 as const, currentStart: '2026-08-14', expectedCurrent: 50 },
  { period: 14 as const, currentStart: '2026-08-07', expectedCurrent: 150 },
])('compares $period days with an equal previous period', ({ period, currentStart, expectedCurrent }) => {
  const result = analyzeConsumption(
    [
      row('2026-07-24', 40),
      row('2026-08-07', 100),
      row('2026-08-14', 20),
      row('2026-08-20', 30),
    ],
    coverage('2026-07-24', 28),
    {
      period,
      source: 'ALL',
      anomalyStatus: 'ALL',
      direction: 'ALL',
      rangeStart: new Date(`${currentStart}T00:00:00.000Z`),
      rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
      previousRangeStart: new Date(
        `${period === 7 ? '2026-08-07' : '2026-07-24'}T00:00:00.000Z`,
      ),
      lastSyncedAt: new Date('2026-08-20T05:00:00.000Z'),
    },
  );

  expect(result.periodDays).toBe(period);
  expect(result.range.current.from).toBe(currentStart);
  expect(result.trend).toHaveLength(period);
  expect(result.kpis.currentAmount).toBe(expectedCurrent);
  expect(result.trend[0]).toHaveProperty('previousDate');
  expect(result.trend[0]).toHaveProperty('currentAmount');
  expect(result.trend[0]).toHaveProperty('previousAmount');
});
```

- [ ] **Step 2: Add failing tests for direction, anomaly, and missing-day filtering**

Add:

```ts
it('filters complete account aggregates before building every dashboard module', () => {
  const result = analyzeConsumption(
    [
      row('2026-08-07', 100, 'drop', '下降账户', 'DOMESTIC', '日志'),
      row('2026-08-14', 20, 'drop', '下降账户', 'DOMESTIC', '日志'),
      row('2026-08-07', 10, 'rise', '增长账户', 'OVERSEAS', 'APM'),
      row('2026-08-14', 30, 'rise', '增长账户', 'OVERSEAS', 'APM'),
    ],
    coverage('2026-08-07', 14),
    {
      period: 7,
      source: 'ALL',
      anomalyStatus: 'DROP',
      direction: 'DOWN',
      previousRangeStart: new Date('2026-08-07T00:00:00.000Z'),
      rangeStart: new Date('2026-08-14T00:00:00.000Z'),
      rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
      lastSyncedAt: null,
    },
  );

  expect(result.accountRanking.map((item) => item.accountId)).toEqual(['drop']);
  expect(result.kpis.currentAmount).toBe(20);
  expect(result.productDistribution.map((item) => item.product)).toEqual(['日志']);
  expect(result.sourceDistribution).toEqual([
    expect.objectContaining({ source: 'DOMESTIC', currentAmount: 20 }),
  ]);
});

it('returns null amounts for missing days and zero for covered zero days', () => {
  const result = analyzeConsumption([], coverage('2026-08-07', 14, '2026-08-16'), {
    period: 7,
    source: 'ALL',
    anomalyStatus: 'ALL',
    direction: 'ALL',
    previousRangeStart: new Date('2026-08-07T00:00:00.000Z'),
    rangeStart: new Date('2026-08-14T00:00:00.000Z'),
    rangeEnd: new Date('2026-08-20T00:00:00.000Z'),
    lastSyncedAt: null,
  });

  expect(result.trend.find((item) => item.currentDate === '2026-08-16')?.currentAmount).toBeNull();
  expect(result.trend.find((item) => item.currentDate === '2026-08-17')?.currentAmount).toBe(0);
});
```

- [ ] **Step 3: Run analysis tests and verify failure**

```bash
npm run test -w apps/api -- --runInBand consumption-analysis.spec.ts
```

Expected: FAIL because the analyzer still splits one 14-day window into two seven-day halves and aggregates trend/products before account-level filters.

- [ ] **Step 4: Introduce period-aware account aggregates**

In `consumption-analysis.ts`, define the public classification helpers and aggregate shape:

```ts
export type ConsumptionAnomalyStatus = 'SILENT' | 'DROP' | 'RISE' | 'NORMAL';
export type ConsumptionDirection = 'UP' | 'DOWN' | 'FLAT' | 'UNCOMPARABLE';

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

function rate(current: number, previous: number) {
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export function classifyDirection(current: number, previous: number): ConsumptionDirection {
  const value = rate(current, previous);
  if (value === null) return 'UNCOMPARABLE';
  if (value > 0) return 'UP';
  if (value < 0) return 'DOWN';
  return 'FLAT';
}

export function classifyAnomaly(current: number, previous: number): ConsumptionAnomalyStatus {
  if (previous > 0 && current === 0) return 'SILENT';
  if (previous > 0 && current < previous * 0.7) return 'DROP';
  if (previous > 0 && current > previous * 1.5) return 'RISE';
  return 'NORMAL';
}
```

Accumulate all rows from `previousRangeStart` through `rangeEnd` into account aggregates. Put dates before `rangeStart` into previous values and dates from `rangeStart` onward into current values. After aggregation, enrich each account with `changeRate`, `direction`, and `anomalyStatus`, then filter the enriched account list by `options.anomalyStatus` and `options.direction`.

- [ ] **Step 5: Build every response section from the filtered accounts**

Return this stable response shape from `analyzeConsumption`:

```ts
return {
  periodDays: options.period,
  source: options.source,
  range: {
    current: { from: dateKey(options.rangeStart), to: dateKey(options.rangeEnd) },
    previous: {
      from: dateKey(options.previousRangeStart),
      to: dateKey(addUtcDays(options.rangeStart, -1)),
    },
  },
  dataThrough: dateKey(options.rangeEnd),
  lastSyncedAt: options.lastSyncedAt?.toISOString() ?? null,
  unit: 'CNY' as const,
  kpis,
  trend,
  coverage,
  missingDates,
  productDistribution,
  sourceDistribution,
  accountRanking,
  anomalies: accountRanking.filter((item) => item.anomalyStatus !== 'NORMAL'),
  summary: buildSummary(kpis, productDistribution, accountRanking, missingDates),
  filters: {
    accounts: filterAccounts,
    products: filterProducts,
    managers: filterManagers,
  },
};
```

Use these field contracts:

```ts
type Kpis = {
  currentAmount: number;
  previousAmount: number;
  changeRate: number | null;
  dailyAverage: number;
  activeAccounts: number;
  anomalyAccounts: number;
};

type TrendPoint = {
  index: number;
  currentDate: string;
  previousDate: string;
  currentAmount: number | null;
  previousAmount: number | null;
};

type DistributionItem = {
  currentAmount: number;
  previousAmount: number;
  changeRate: number | null;
  share: number;
};
```

Product distribution includes `product`; source distribution includes `source`. Account ranking includes both amounts, `changeRate`, `direction`, `anomalyStatus`, products, source, manager, and last active date. Summary returns at most three Chinese strings and begins with a data-incomplete warning when `missingDates` is non-empty.

- [ ] **Step 6: Run the analysis suite and verify pass**

Run the command from Step 3.

Expected: PASS for both periods, unified filtering, anomaly classification, source/product structures, and missing-day behavior.

- [ ] **Step 7: Commit the analysis engine**

```bash
git add apps/api/src/consumption/consumption-analysis.ts apps/api/src/consumption/consumption-analysis.spec.ts
git commit -m "feat(api): add period-aware consumption analysis"
```

---

### Task 4: Query the correct 28-day comparison range in the service

**Files:**
- Modify: `apps/api/src/consumption/consumption.service.spec.ts`
- Modify: `apps/api/src/consumption/consumption.service.ts`
- Modify: `apps/api/src/consumption/consumption.controller.spec.ts`

- [ ] **Step 1: Write failing service query tests**

In `consumption.service.spec.ts`, set the successful sync range to `2026-07-24` through `2026-08-20`, call:

```ts
const result = await service.analysis({
  period: 14,
  source: 'DOMESTIC',
  accountId: 'a1',
  product: '日志',
  managerName: '王雨轩',
  anomalyStatus: 'ALL',
  direction: 'ALL',
});
```

Assert:

```ts
expect(capturedQuery.where).toMatchObject({
  date: {
    gte: new Date('2026-07-24T00:00:00.000Z'),
    lte: new Date('2026-08-20T00:00:00.000Z'),
  },
  account: { id: 'a1', source: 'DOMESTIC', managerName: '王雨轩' },
  product: '日志',
});
expect(result).toMatchObject({
  periodDays: 14,
  range: {
    current: { from: '2026-08-07', to: '2026-08-20' },
    previous: { from: '2026-07-24', to: '2026-08-06' },
  },
});
```

Add a 7-day test expecting the query to start on `2026-08-07` and the current range to start on `2026-08-14`.

- [ ] **Step 2: Run service tests and verify failure**

```bash
npm run test -w apps/api -- --runInBand consumption.service.spec.ts consumption.controller.spec.ts
```

Expected: FAIL because the service passes a single fixed range and ignores `period` and `managerName`.

- [ ] **Step 3: Implement service range calculation and query filters**

In `ConsumptionService.analysis`:

```ts
const period = query.period ?? 14;
const rangeEnd = lastSuccessfulRun?.rangeEnd ?? consumptionWindow(now).end;
const rangeStart = addUtcDays(rangeEnd, -(period - 1));
const previousRangeStart = addUtcDays(rangeStart, -period);

const accountFilter = {
  ...(query.accountId ? { id: query.accountId } : {}),
  ...(source === 'ALL' ? {} : { source }),
  ...(query.managerName ? { managerName: query.managerName } : {}),
};
```

Query daily rows and coverage from `previousRangeStart` through `rangeEnd`. Pass `period`, `anomalyStatus`, `direction`, `previousRangeStart`, `rangeStart`, and `rangeEnd` to `analyzeConsumption`.

If no synchronization has succeeded, still calculate the 28-day retained range from `now`; do not change `dataThrough` semantics.

- [ ] **Step 4: Verify controller query pass-through**

Add to `consumption.controller.spec.ts`:

```ts
it('passes dashboard filters to the analysis service', async () => {
  const query = {
    period: 7 as const,
    source: 'OVERSEAS' as const,
    product: 'APM',
    managerName: '王雨轩',
    anomalyStatus: 'RISE' as const,
    direction: 'UP' as const,
  };
  await controller.analysis(query);
  expect(analysis.analysis).toHaveBeenCalledWith(query);
});
```

- [ ] **Step 5: Run focused API tests and verify pass**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 6: Run the entire consumption API test group**

```bash
npm run test -w apps/api -- --runInBand consumption
```

Expected: all consumption-related suites PASS.

- [ ] **Step 7: Commit the service integration**

```bash
git add apps/api/src/consumption/consumption.service.ts apps/api/src/consumption/consumption.service.spec.ts apps/api/src/consumption/consumption.controller.spec.ts
git commit -m "feat(api): serve filtered consumption comparisons"
```

---

### Task 5: Update the web API contract and URL filter state

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/consumption.ts`
- Create: `apps/web/src/composables/useConsumptionFilters.ts`
- Create: `apps/web/src/composables/__tests__/useConsumptionFilters.spec.ts`
- Create: `apps/web/src/components/consumption/__tests__/fixtures.ts`

- [ ] **Step 1: Write failing URL-state tests**

Create `useConsumptionFilters.spec.ts` with these imports, a memory router, and the cases below:

```ts
import { defineComponent, h, type Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ConsumptionFilters } from '../../api/types';
import { useConsumptionFilters } from '../useConsumptionFilters';
```

```ts
it('restores valid consumption filters from the URL', async () => {
  const { router, filters } = await setup('/consumption?period=7&source=DOMESTIC&product=日志&managerName=王雨轩&anomalyStatus=DROP&direction=DOWN');
  expect(router.currentRoute.value.path).toBe('/consumption');
  expect(filters.value).toEqual({
    period: 7,
    source: 'DOMESTIC',
    accountId: '',
    product: '日志',
    managerName: '王雨轩',
    anomalyStatus: 'DROP',
    direction: 'DOWN',
  });
});

it('falls back to report defaults for invalid URL values', async () => {
  const { filters } = await setup('/consumption?period=90&source=OTHER&direction=SIDEWAYS');
  expect(filters.value.period).toBe(14);
  expect(filters.value.source).toBe('ALL');
  expect(filters.value.direction).toBe('ALL');
});

it('resets all filters and clears the query string', async () => {
  const { router, reset } = await setup('/consumption?period=7&product=日志');
  await reset();
  expect(router.currentRoute.value.query).toEqual({});
});
```

Use this local helper in the test file:

```ts
async function setup(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/consumption', component: { template: '<div />' } }],
  });
  await router.push(url);
  const exposed: Record<string, unknown> = {};
  const Harness = defineComponent({
    setup(_, { expose }) {
      const state = useConsumptionFilters();
      expose(state);
      return () => h('div');
    },
  });
  const wrapper = mount(Harness, { global: { plugins: [router] } });
  Object.assign(exposed, wrapper.vm);
  return {
    router,
    filters: exposed.filters as Ref<ConsumptionFilters>,
    reset: exposed.reset as () => Promise<void>,
  };
}
```

- [ ] **Step 2: Run the composable test and verify failure**

```bash
npm run test -w apps/web -- --run src/composables/__tests__/useConsumptionFilters.spec.ts
```

Expected: FAIL because the composable does not exist.

- [ ] **Step 3: Define shared web types**

Replace the consumption section in `api/types.ts` with exported types matching the API response:

```ts
export type ConsumptionPeriod = 7 | 14;
export type ConsumptionSourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS';
export type ConsumptionAnomalyStatus = 'ALL' | 'SILENT' | 'DROP' | 'RISE' | 'NORMAL';
export type ConsumptionDirection = 'ALL' | 'UP' | 'DOWN' | 'FLAT' | 'UNCOMPARABLE';
export type ConsumptionAnomalyState = Exclude<ConsumptionAnomalyStatus, 'ALL'>;
export type ConsumptionDirectionState = Exclude<ConsumptionDirection, 'ALL'>;

export interface ConsumptionFilters {
  period: ConsumptionPeriod;
  source: ConsumptionSourceFilter;
  accountId: string;
  product: string;
  managerName: string;
  anomalyStatus: ConsumptionAnomalyStatus;
  direction: ConsumptionDirection;
}

export interface ConsumptionComparisonRange {
  current: { from: string; to: string };
  previous: { from: string; to: string };
}

export interface ConsumptionAccountResult {
  accountId: string;
  externalId: string;
  accountName: string;
  source: Exclude<ConsumptionSourceFilter, 'ALL'>;
  managerName: string | null;
  currentAmount: number;
  previousAmount: number;
  changeRate: number | null;
  direction: ConsumptionDirectionState;
  anomalyStatus: ConsumptionAnomalyState;
  products: string[];
  lastActiveDate: string | null;
  reason: string | null;
  confidence: 'HIGH' | 'LOW';
}

export interface ConsumptionAnalysis {
  periodDays: ConsumptionPeriod;
  source: ConsumptionSourceFilter;
  range: ConsumptionComparisonRange;
  dataThrough: string;
  lastSyncedAt: string | null;
  unit: 'CNY';
  kpis: {
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    dailyAverage: number;
    activeAccounts: number;
    anomalyAccounts: number;
  };
  trend: Array<{
    index: number;
    currentDate: string;
    previousDate: string;
    currentAmount: number | null;
    previousAmount: number | null;
  }>;
  coverage: Array<{ date: string; domestic: boolean; overseas: boolean }>;
  missingDates: string[];
  productDistribution: Array<{
    product: string;
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    share: number;
  }>;
  sourceDistribution: Array<{
    source: Exclude<ConsumptionSourceFilter, 'ALL'>;
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    share: number;
  }>;
  accountRanking: ConsumptionAccountResult[];
  anomalies: ConsumptionAccountResult[];
  summary: string[];
  filters: {
    products: string[];
    managers: string[];
    accounts: Array<{
      id: string;
      source: Exclude<ConsumptionSourceFilter, 'ALL'>;
      externalId: string;
      displayName: string;
      managerName: string | null;
    }>;
  };
}
```

- [ ] **Step 4: Create reusable typed dashboard fixtures**

Create `apps/web/src/components/consumption/__tests__/fixtures.ts`:

```ts
import type {
  ConsumptionAccountResult,
  ConsumptionAnalysis,
  ConsumptionFilters,
  ConsumptionSyncStatus,
} from '../../../api/types';

export const baseFilters: ConsumptionFilters = {
  period: 14,
  source: 'ALL',
  accountId: '',
  product: '',
  managerName: '',
  anomalyStatus: 'ALL',
  direction: 'ALL',
};

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
  changeRate: previousAmount ? ((currentAmount - previousAmount) / previousAmount) * 100 : null,
  direction: previousAmount === 0 ? 'UNCOMPARABLE' : currentAmount > previousAmount ? 'UP' : currentAmount < previousAmount ? 'DOWN' : 'FLAT',
  anomalyStatus,
  products: [accountId === 'rise' ? 'APM' : '日志'],
  lastActiveDate: currentAmount ? '2026-08-20' : '2026-08-06',
  reason: anomalyStatus === 'NORMAL' ? null : '周期消费变化超过异常阈值',
  confidence: 'HIGH',
});

export const accountItems = [
  account('drop', '下降账户', 20, 100, 'DROP'),
  account('rise', '增长账户', 90, 30, 'RISE'),
  account('silent', '停用账户', 0, 40, 'SILENT'),
];

export const productItems = [
  { product: '日志', currentAmount: 20, previousAmount: 140, changeRate: -85.7, share: 18.2 },
  { product: 'APM', currentAmount: 90, previousAmount: 30, changeRate: 200, share: 81.8 },
];

const currentDates = Array.from({ length: 14 }, (_, index) =>
  `2026-08-${String(index + 7).padStart(2, '0')}`,
);
const previousDates = Array.from({ length: 14 }, (_, index) => {
  const date = new Date(Date.UTC(2026, 6, 24 + index));
  return date.toISOString().slice(0, 10);
});

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
  coverage: currentDates.map((date) => ({ date, domestic: true, overseas: true })),
  missingDates: [],
  productDistribution: productItems,
  sourceDistribution: [
    { source: 'DOMESTIC', currentAmount: 20, previousAmount: 140, changeRate: -85.7, share: 18.2 },
    { source: 'OVERSEAS', currentAmount: 90, previousAmount: 30, changeRate: 200, share: 81.8 },
  ],
  accountRanking: accountItems,
  anomalies: accountItems,
  summary: ['本期消费较上期下降 35.3%', 'APM 是本期最大增长来源', '3 个账户需要关注'],
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
};

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
};
```

- [ ] **Step 5: Implement query serialization and request cancellation**

Change `getConsumptionAnalysis` to:

```ts
export function getConsumptionAnalysis(
  params: ConsumptionFilters,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    period: String(params.period),
    source: params.source,
  });
  for (const key of ['accountId', 'product', 'managerName'] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  if (params.anomalyStatus !== 'ALL') query.set('anomalyStatus', params.anomalyStatus);
  if (params.direction !== 'ALL') query.set('direction', params.direction);
  return apiRequest<ConsumptionAnalysis>(`/consumption/analysis?${query}`, { signal });
}
```

`apiRequest` already accepts `RequestInit`, so `signal` passes through without changing `apps/web/src/api/client.ts`.

- [ ] **Step 6: Implement `useConsumptionFilters`**

Implement the composable with the following complete state and URL synchronization logic:

```ts
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ConsumptionFilters } from '../api/types';

export const defaultConsumptionFilters: ConsumptionFilters = {
  period: 14,
  source: 'ALL',
  accountId: '',
  product: '',
  managerName: '',
  anomalyStatus: 'ALL',
  direction: 'ALL',
};

const periods = new Set(['7', '14']);
const sources = new Set(['ALL', 'DOMESTIC', 'OVERSEAS']);
const anomalies = new Set(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL']);
const directions = new Set(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE']);

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function parse(query: Record<string, unknown>): ConsumptionFilters {
  const period = text(query.period);
  const source = text(query.source);
  const anomalyStatus = text(query.anomalyStatus);
  const direction = text(query.direction);
  return {
    period: periods.has(period) ? (Number(period) as 7 | 14) : 14,
    source: sources.has(source)
      ? (source as ConsumptionFilters['source'])
      : 'ALL',
    accountId: text(query.accountId),
    product: text(query.product),
    managerName: text(query.managerName),
    anomalyStatus: anomalies.has(anomalyStatus)
      ? (anomalyStatus as ConsumptionFilters['anomalyStatus'])
      : 'ALL',
    direction: directions.has(direction)
      ? (direction as ConsumptionFilters['direction'])
      : 'ALL',
  };
}

function serialize(value: ConsumptionFilters) {
  const query: Record<string, string> = {};
  if (value.period !== 14) query.period = String(value.period);
  if (value.source !== 'ALL') query.source = value.source;
  if (value.accountId) query.accountId = value.accountId;
  if (value.product) query.product = value.product;
  if (value.managerName) query.managerName = value.managerName;
  if (value.anomalyStatus !== 'ALL') query.anomalyStatus = value.anomalyStatus;
  if (value.direction !== 'ALL') query.direction = value.direction;
  return query;
}

export function useConsumptionFilters() {
  const route = useRoute();
  const router = useRouter();
  const filters = ref(parse(route.query));
  const activeFilters = computed(() =>
    Object.entries(filters.value).filter(
      ([key, value]) => value !== defaultConsumptionFilters[key as keyof ConsumptionFilters],
    ),
  );

  watch(
    () => route.query,
    (query) => { filters.value = parse(query); },
  );

  async function setFilters(patch: Partial<ConsumptionFilters>) {
    const next = { ...filters.value, ...patch };
    filters.value = next;
    await router.replace({ query: serialize(next) });
  }

  function removeFilter(key: keyof ConsumptionFilters) {
    return setFilters({
      [key]: defaultConsumptionFilters[key],
    } as Partial<ConsumptionFilters>);
  }

  async function reset() {
    filters.value = { ...defaultConsumptionFilters };
    await router.replace({ query: {} });
  }

  return { filters, activeFilters, setFilters, removeFilter, reset };
}
```

- [ ] **Step 7: Run composable and web type checks**

```bash
npm run test -w apps/web -- --run src/composables/__tests__/useConsumptionFilters.spec.ts
npm run lint -w apps/web
```

Expected: test PASS and `vue-tsc --noEmit` exits 0.

- [ ] **Step 8: Commit web contract and URL state**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/consumption.ts apps/web/src/composables/useConsumptionFilters.ts apps/web/src/composables/__tests__/useConsumptionFilters.spec.ts apps/web/src/components/consumption/__tests__/fixtures.ts
git commit -m "feat(web): add consumption dashboard filter state"
```

---

### Task 6: Build the report header, filters, and KPI strip

**Files:**
- Create: `apps/web/src/components/consumption/AnalysisHeader.vue`
- Create: `apps/web/src/components/consumption/AnalysisFilters.vue`
- Create: `apps/web/src/components/consumption/KpiSummary.vue`
- Create: `apps/web/src/components/consumption/__tests__/AnalysisFilters.spec.ts`

- [ ] **Step 1: Write failing filter component tests**

Create `AnalysisFilters.spec.ts`. Import `mount` from Vue Test Utils, `ConsumptionFilters` from the web API types, `AnalysisFilters`, and `baseFilters` plus `dashboardAnalysis` from `./fixtures`. Use this helper before the cases:

```ts
function mountFilters(patch: Partial<ConsumptionFilters> = {}) {
  return mount(AnalysisFilters, {
    props: {
      modelValue: { ...baseFilters, ...patch },
      accounts: dashboardAnalysis.filters.accounts,
      products: dashboardAnalysis.filters.products,
      managers: dashboardAnalysis.filters.managers,
      resultCount: dashboardAnalysis.accountRanking.length,
    },
  });
}
```

Verify:

```ts
it('emits a patch when period and source change', async () => {
  const wrapper = mountFilters();
  await wrapper.get('[data-period="7"]').trigger('click');
  await wrapper.get('[data-source="DOMESTIC"]').trigger('click');
  expect(wrapper.emitted('change')).toEqual([
    [{ period: 7 }],
    [{ source: 'DOMESTIC' }],
  ]);
});

it('renders active condition chips and clears them', async () => {
  const wrapper = mountFilters({ product: '日志', managerName: '王雨轩' });
  expect(wrapper.text()).toContain('产品：日志');
  expect(wrapper.text()).toContain('负责人：王雨轩');
  await wrapper.get('[data-action="clear-filters"]').trigger('click');
  expect(wrapper.emitted('reset')).toHaveLength(1);
});

it('announces dependent filters cleared by a source change', async () => {
  const wrapper = mountFilters({ product: '日志', managerName: '王雨轩' });
  await wrapper.get('[data-source="OVERSEAS"]').trigger('click');
  expect(wrapper.get('[aria-live="polite"]').text()).toContain('已清除账户、产品和负责人筛选');
});
```

- [ ] **Step 2: Run the component test and verify failure**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/AnalysisFilters.spec.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement `AnalysisHeader.vue`**

Props: `period`, `dataThrough`, `lastSyncedAt`, `syncing`, and `refreshing`. Emit `change-period` with `7 | 14`. Render:

- eyebrow `CONSUMPTION BUSINESS REVIEW`
- heading `消费经营分析`
- plain-language description
- 7/14 segmented control
- data-through date
- compact sync state button that emits `open-sync`

The header must not render the old dark command banner or the complete sync pipeline.

- [ ] **Step 4: Implement `AnalysisFilters.vue`**

Props: `modelValue: ConsumptionFilters`, `accounts`, `products`, `managers`, and `resultCount`. Emits: `change`, `reset`.

Use native selects for product, manager, anomaly status, and direction. Use a searchable `<input list="consumption-accounts">` plus datalist for account display names; map the selected display label back to account ID before emitting. Render active filter chips for non-default values and a single `清除全部` button.

When source changes, emit one patch that clears `accountId`, `product`, and `managerName`:

```ts
emit('change', {
  source: value,
  accountId: '',
  product: '',
  managerName: '',
});
```

If any of those three fields was selected, also update a visually compact `aria-live="polite"` message to `已清除账户、产品和负责人筛选`.

- [ ] **Step 5: Implement `KpiSummary.vue`**

Props: `kpis`, `range`, and `loading`. Render five semantic `<article>` elements with these labels and values:

```ts
const items = computed(() => [
  { key: 'amount', label: '本期消费', value: money(props.kpis.currentAmount) },
  { key: 'change', label: '周期环比', value: percent(props.kpis.changeRate) },
  { key: 'average', label: '日均消费', value: money(props.kpis.dailyAverage) },
  { key: 'active', label: '活跃账户', value: number(props.kpis.activeAccounts) },
  { key: 'anomaly', label: '异常账户', value: number(props.kpis.anomalyAccounts) },
]);
```

The change card also shows current/previous amounts. Apply risk color only to negative change and anomaly count; do not color every positive number.

- [ ] **Step 6: Run component tests and type checks**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/AnalysisFilters.spec.ts
npm run lint -w apps/web
```

Expected: PASS.

- [ ] **Step 7: Commit the report controls**

```bash
git add apps/web/src/components/consumption/AnalysisHeader.vue apps/web/src/components/consumption/AnalysisFilters.vue apps/web/src/components/consumption/KpiSummary.vue apps/web/src/components/consumption/__tests__/AnalysisFilters.spec.ts
git commit -m "feat(web): add consumption report controls"
```

---

### Task 7: Build the comparison trend and deterministic summary

**Files:**
- Create: `apps/web/src/components/consumption/PeriodTrendChart.vue`
- Create: `apps/web/src/components/consumption/BusinessSummary.vue`
- Create: `apps/web/src/components/consumption/__tests__/PeriodTrendChart.spec.ts`

- [ ] **Step 1: Write failing trend tests**

Create `PeriodTrendChart.spec.ts`, import `dashboardAnalysis` from `./fixtures`, and set `const completeTrend = dashboardAnalysis.trend` before the cases:

```ts
it('renders current and previous period paths', () => {
  const wrapper = mount(PeriodTrendChart, { props: { trend: completeTrend, period: 7 } });
  expect(wrapper.find('[data-series="current"]').exists()).toBe(true);
  expect(wrapper.find('[data-series="previous"]').exists()).toBe(true);
});

it('breaks the current line where source data is missing', () => {
  const wrapper = mount(PeriodTrendChart, {
    props: {
      period: 7,
      trend: completeTrend.map((item, index) =>
        index === 2 ? { ...item, currentAmount: null } : item,
      ),
    },
  });
  expect(wrapper.findAll('[data-series="current-segment"]')).toHaveLength(2);
  expect(wrapper.text()).toContain('数据缺失');
});

it('shows both actual dates and amounts for a focused point', async () => {
  const wrapper = mount(PeriodTrendChart, { props: { trend: completeTrend, period: 7 } });
  await wrapper.get('[data-point="2"]').trigger('focus');
  expect(wrapper.get('[role="tooltip"]').text()).toContain(completeTrend[2].currentDate);
  expect(wrapper.get('[role="tooltip"]').text()).toContain(completeTrend[2].previousDate);
});
```

- [ ] **Step 2: Run the trend test and verify failure**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/PeriodTrendChart.spec.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement SVG point scaling and segment splitting**

In `PeriodTrendChart.vue`, derive one shared maximum from all non-null current and previous amounts. Use a `720 × 220` view box. Implement:

```ts
function point(index: number, amount: number) {
  const x = props.trend.length === 1 ? 0 : (index / (props.trend.length - 1)) * 720;
  const y = 184 - (amount / maxAmount.value) * 148;
  return { x, y };
}

function segments(key: 'currentAmount' | 'previousAmount') {
  const result: string[][] = [];
  let active: string[] = [];
  props.trend.forEach((item, index) => {
    const amount = item[key];
    if (amount === null) {
      if (active.length) result.push(active);
      active = [];
      return;
    }
    const { x, y } = point(index, amount);
    active.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  if (active.length) result.push(active);
  return result;
}
```

Render previous segments as muted dashed polylines and current segments as solid teal polylines. Render focusable transparent point buttons in an overlaid HTML layer so keyboard users can open the same tooltip as pointer users.

- [ ] **Step 4: Implement `BusinessSummary.vue`**

Props: `summary: string[]`, `missingDates: string[]`, and `coverage`. Render at most three ordered findings. If missing dates exist, show `数据完整度影响本期结论` with the missing date count and mark the section `data-confidence="low"`. Include a compact 7/14-day coverage strip in this component instead of a full-width top panel.

- [ ] **Step 5: Run trend tests and type checks**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/PeriodTrendChart.spec.ts
npm run lint -w apps/web
```

Expected: PASS.

- [ ] **Step 6: Commit trend and summary components**

```bash
git add apps/web/src/components/consumption/PeriodTrendChart.vue apps/web/src/components/consumption/BusinessSummary.vue apps/web/src/components/consumption/__tests__/PeriodTrendChart.spec.ts
git commit -m "feat(web): add consumption period comparison"
```

---

### Task 8: Build product/source structures and account insights

**Files:**
- Create: `apps/web/src/components/consumption/ProductMixChart.vue`
- Create: `apps/web/src/components/consumption/SourceMixChart.vue`
- Create: `apps/web/src/components/consumption/AccountRankingTable.vue`
- Create: `apps/web/src/components/consumption/AnomalyList.vue`
- Create: `apps/web/src/components/consumption/__tests__/InsightComponents.spec.ts`

- [ ] **Step 1: Write failing insight component tests**

Create `InsightComponents.spec.ts`; import `mount`, both components, and `accountItems` plus `productItems` from `./fixtures`. Verify chart selection and local ranking sort:

```ts
it('emits the selected product', async () => {
  const wrapper = mount(ProductMixChart, {
    props: { items: productItems, selectedProduct: '' },
  });
  await wrapper.get('[data-product="日志"]').trigger('click');
  expect(wrapper.emitted('select')).toEqual([['日志']]);
});

it('sorts account results locally by change rate', async () => {
  const wrapper = mount(AccountRankingTable, {
    props: { items: accountItems, highlightAccountId: '' },
  });
  await wrapper.get('[data-sort="changeRate"]').trigger('click');
  expect(wrapper.findAll('[data-account-row]')[0].attributes('data-account-id')).toBe('rise');
});
```

- [ ] **Step 2: Run insight tests and verify failure**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/InsightComponents.spec.ts
```

Expected: FAIL because the four insight components do not exist.

- [ ] **Step 3: Implement product and source mix components**

`ProductMixChart.vue` props: `items`, `selectedProduct`; emit `select(product: string)`. Display the first six items returned by the API plus any selected product. Each row shows amount, share, change rate, and a horizontal share bar. Use a minimum visible width of 2% for non-zero values.

`SourceMixChart.vue` props: `items`, `selectedSource`; emit `select(source)`. Render a two-part proportion bar only when both sources exist; otherwise render a full-width single-source bar. Buttons use `data-source-mix="DOMESTIC|OVERSEAS"`, visible focus, amount, share, and change.

- [ ] **Step 4: Implement sortable account ranking**

`AccountRankingTable.vue` props: `items`, `highlightAccountId`. Keep local state:

```ts
type SortKey = 'currentAmount' | 'changeRate' | 'lastActiveDate';
const sortKey = ref<SortKey>('currentAmount');
const sortDirection = ref<'asc' | 'desc'>('desc');
```

Treat `null` change rates and dates as lower than real values in descending order. Render desktop table rows with `data-account-row` and a matching mobile card list. On `highlightAccountId` change, call `scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })` for the matching row.

- [ ] **Step 5: Implement anomaly list**

`AnomalyList.vue` props: `items`; emit `locate(accountId)`. Map labels exactly:

```ts
const labels = {
  SILENT: '本期停用',
  DROP: '明显下降',
  RISE: '异常增长',
} as const;
```

Each button shows source, account, manager, current amount, change, reason, and low-confidence badge when applicable. The empty state says `当前筛选范围内没有异常账户`.

- [ ] **Step 6: Run insight tests and type checks**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/InsightComponents.spec.ts
npm run lint -w apps/web
```

Expected: component tests PASS and `vue-tsc --noEmit` exits 0.

- [ ] **Step 7: Commit the insight components**

```bash
git add apps/web/src/components/consumption/ProductMixChart.vue apps/web/src/components/consumption/SourceMixChart.vue apps/web/src/components/consumption/AccountRankingTable.vue apps/web/src/components/consumption/AnomalyList.vue apps/web/src/components/consumption/__tests__/InsightComponents.spec.ts
git commit -m "feat(web): add consumption structure and account insights"
```

---

### Task 9: Move synchronization into a compact disclosure

**Files:**
- Create: `apps/web/src/components/consumption/SyncDetails.vue`
- Create: `apps/web/src/components/consumption/__tests__/SyncDetails.spec.ts`

- [ ] **Step 1: Write failing sync disclosure tests**

Create `SyncDetails.spec.ts`; import `mount`, `SyncDetails`, and `dashboardAnalysis` plus `successStatus` from `./fixtures`. Mount the component with `successStatus`:

```ts
it('keeps synchronization details collapsed until requested', async () => {
  const wrapper = mount(SyncDetails, {
    props: { status: successStatus, analysis: dashboardAnalysis, canManage: true, syncing: false, error: '' },
  });
  expect(wrapper.find('[data-sync-details]').isVisible()).toBe(false);
  await wrapper.get('[data-action="toggle-sync-details"]').trigger('click');
  expect(wrapper.get('[data-sync-details]').isVisible()).toBe(true);
  expect(wrapper.text()).toContain('本地 MySQL 快照');
});

it('preserves role-based synchronization permissions', async () => {
  const wrapper = mount(SyncDetails, {
    props: { status: successStatus, analysis: dashboardAnalysis, canManage: false, syncing: false, error: '' },
  });
  await wrapper.get('[data-action="toggle-sync-details"]').trigger('click');
  expect(wrapper.get('[data-action="sync-consumption"]').attributes()).toHaveProperty('disabled');
  expect(wrapper.text()).toContain('仅管理员和经理可手动同步');
});
```

- [ ] **Step 2: Run sync disclosure tests and verify failure**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/SyncDetails.spec.ts
```

Expected: FAIL because `SyncDetails.vue` does not exist.

- [ ] **Step 3: Implement `SyncDetails.vue`**

Props: `status`, `analysis`, `canManage`, `syncing`, `error`. Emits: `sync` and `toggle`. Use a native `<details>` or equivalent button/region pairing; keep the disclosure closed by default. The summary shows last successful update or `等待首次同步`. The expanded region contains source connection state, local snapshot counts, data-through date, next schedule, failure summary, and the real sync button.

Derive the disabled reason in the component:

```ts
const disabledReason = computed(() => {
  if (!props.canManage) return '仅管理员和经理可手动同步';
  if (!props.status?.enabled) return '服务器尚未配置消费数据源';
  if (props.status.running || props.syncing) return '同步任务正在运行';
  return '';
});
```

- [ ] **Step 4: Keep synchronization behavior in the view**

Do not move polling or API calls into the display component. `ConsumptionView` remains responsible for `runConsumptionSync`, polling every three seconds while running, and refreshing analysis once the run finishes.

- [ ] **Step 5: Run the component test and verify pass**

```bash
npm run test -w apps/web -- --run src/components/consumption/__tests__/SyncDetails.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the sync disclosure**

```bash
git add apps/web/src/components/consumption/SyncDetails.vue apps/web/src/components/consumption/__tests__/SyncDetails.spec.ts
git commit -m "feat(web): compact consumption sync details"
```

---

### Task 10: Assemble the report and handle request races

**Files:**
- Modify: `apps/web/src/views/ConsumptionView.vue`
- Modify: `apps/web/tests/consumption-view.spec.ts`

- [ ] **Step 1: Replace old page fixtures with the shared response contract**

Import `dashboardAnalysis` and `successStatus` from `../src/components/consumption/__tests__/fixtures`. Remove the old `emptyAnalysis` and local `successStatus`, then make `getConsumptionAnalysis` resolve the shared dashboard fixture in `beforeEach`.

Replace `mountView` with this router-aware helper:

```ts
async function mountViewWithRouter(role = 'ADMIN', url = '/consumption') {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.user = { id: 'user-1', email: 'user@example.com', name: '测试用户', role };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/consumption', component: ConsumptionView }],
  });
  await router.push(url);
  const wrapper = mount(ConsumptionView, {
    global: { plugins: [pinia, router] },
  });
  return { wrapper, router };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}
```

Update the initial request assertion to:

```ts
expect(getConsumptionAnalysis).toHaveBeenCalledWith(
  {
    period: 14,
    source: 'ALL',
    accountId: '',
    product: '',
    managerName: '',
    anomalyStatus: 'ALL',
    direction: 'ALL',
  },
  expect.any(AbortSignal),
);
```

- [ ] **Step 2: Add a failing stale-request test**

```ts
it('keeps old data during refresh and ignores stale responses', async () => {
  const first = deferred<ConsumptionAnalysis>();
  const second = deferred<ConsumptionAnalysis>();
  getConsumptionAnalysis.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const { wrapper } = await mountViewWithRouter();
  first.resolve(dashboardAnalysis);
  await flushPromises();

  await wrapper.get('[data-period="7"]').trigger('click');
  expect(wrapper.text()).toContain('消费总额');
  expect(wrapper.get('[data-refreshing]').exists()).toBe(true);

  second.resolve({ ...dashboardAnalysis, periodDays: 7 });
  await flushPromises();
  expect(wrapper.text()).toContain('最近 7 天');
});
```

Add the page-level interaction cases that prove the components share one query state:

```ts
it('writes product chart selection into the unified analysis query', async () => {
  const { wrapper } = await mountViewWithRouter();
  await flushPromises();
  await wrapper.get('[data-product="日志"]').trigger('click');
  await flushPromises();
  expect(getConsumptionAnalysis).toHaveBeenLastCalledWith(
    expect.objectContaining({ product: '日志' }),
    expect.any(AbortSignal),
  );
});

it('sorts ranking locally without requesting a new scope', async () => {
  const { wrapper } = await mountViewWithRouter();
  await flushPromises();
  const requests = getConsumptionAnalysis.mock.calls.length;
  await wrapper.get('[data-sort="changeRate"]').trigger('click');
  expect(getConsumptionAnalysis).toHaveBeenCalledTimes(requests);
});

it('keeps sync details collapsed and preserves role permissions', async () => {
  const { wrapper } = await mountViewWithRouter('AGENT');
  await flushPromises();
  expect(wrapper.find('[data-sync-details]').isVisible()).toBe(false);
  await wrapper.get('[data-action="toggle-sync-details"]').trigger('click');
  expect(wrapper.get('[data-action="sync-consumption"]').attributes()).toHaveProperty('disabled');
});
```

- [ ] **Step 3: Rewrite `ConsumptionView` as the orchestration layer**

The script must:

- import and render all components from Tasks 6–9;
- use `useConsumptionFilters()`;
- watch a stable serialized filter key and call `loadAnalysis` immediately;
- keep `initialLoading` separate from `refreshing`;
- keep the previous `analysis` value while refreshing;
- create a new `AbortController` for each request and abort the prior controller;
- ignore `AbortError` without showing a failure banner;
- expose `retry`, `setFilters`, `resetFilters`, chart selection, sorting, anomaly location, and sync handlers;
- abort the request and stop polling on unmount.

Use this request skeleton:

```ts
let analysisController: AbortController | null = null;

async function loadAnalysis() {
  analysisController?.abort();
  const controller = new AbortController();
  analysisController = controller;
  initialLoading.value = !analysis.value;
  refreshing.value = Boolean(analysis.value);
  error.value = '';
  try {
    analysis.value = await getConsumptionAnalysis(filters.value, controller.signal);
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return;
    error.value = reason instanceof Error ? reason.message : '消费数据读取失败';
  } finally {
    if (analysisController === controller) {
      initialLoading.value = false;
      refreshing.value = false;
    }
  }
}
```

The template order must be header, filters, retry banner, skeleton or KPI/report content, then sync disclosure. Do not render the old command banner, full-width coverage panel, single-line chart, or always-expanded sync track.

- [ ] **Step 4: Preserve data on refresh failure**

When `analysis` exists and a request fails, render a compact `role="alert"` banner with `重新加载`; keep all old modules visible. Only use the full empty error panel when no successful analysis exists.

- [ ] **Step 5: Run consumption page tests**

```bash
npm run test -w apps/web -- --run tests/consumption-view.spec.ts
```

Expected: all view integration tests PASS, including filter-to-query, URL defaults, chart selection, local ranking sort, sync permissions, old-data retention, and recoverable errors.

- [ ] **Step 6: Commit view assembly**

```bash
git add apps/web/src/views/ConsumptionView.vue apps/web/tests/consumption-view.spec.ts
git commit -m "feat(web): assemble consumption business dashboard"
```

---

### Task 11: Apply the report visual system and responsive layouts

**Files:**
- Modify: `apps/web/src/views/ConsumptionView.vue`
- Modify: `apps/web/src/components/consumption/*.vue`
- Modify: `apps/web/src/style.css`

- [ ] **Step 1: Add page-scoped visual tokens**

In the root of `ConsumptionView.vue` scoped styles or a `.consumption-report` block in `style.css`, define:

```css
.consumption-report {
  --report-bg: #f4f7f8;
  --report-surface: #fff;
  --report-ink: #173247;
  --report-muted: #6f818d;
  --report-teal: #168e82;
  --report-amber: #d3902f;
  --report-danger: #c95b52;
  --report-line: #dce5e8;
  color: var(--report-ink);
}
```

Use these tokens in every consumption component. Do not add another gradient hero or decorative orbit.

- [ ] **Step 2: Implement the desktop 12-column report layout**

Use:

```css
.report-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; }
.trend-section { grid-column: span 8; }
.summary-section { grid-column: span 4; }
.product-section { grid-column: span 7; }
.source-section { grid-column: span 5; }
.ranking-section { grid-column: span 8; }
.anomaly-section { grid-column: span 4; }
```

Panels use white surfaces, a 1px line, 12–14px radius, restrained shadow, and 18–22px padding. KPI values use tabular/monospace numerals; section headings use sentence case Chinese labels.

- [ ] **Step 3: Implement tablet and mobile behavior**

At `max-width: 980px`, make all report modules span 12 columns. At `max-width: 680px`:

- make the KPI strip horizontally scrollable with `scroll-snap-type: x mandatory`;
- hide the desktop ranking table and show account cards;
- place secondary filters inside a disclosure labeled `筛选`;
- keep period and source controls visible;
- ensure all touch targets are at least 40px high.

- [ ] **Step 4: Add accessibility and reduced-motion rules**

Add visible `:focus-visible` outlines, text labels for all status colors, and:

```css
@media (prefers-reduced-motion: reduce) {
  .consumption-report *,
  .consumption-report *::before,
  .consumption-report *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Remove obsolete consumption CSS selectors**

Delete selectors used only by the old page: `.consumption-command`, `.consumption-sync-track`, `.coverage-panel`, `.coverage-days`, `.consumption-kpis`, `.pulse-chart-panel`, `.pulse-chart`, `.product-bars`, and `.ranking-table` consumption-specific overrides. Keep `.panel`, `.segmented`, `.positive`, `.negative`, and other shared application selectors.

- [ ] **Step 6: Run web tests and production build**

```bash
npm run test -w apps/web -- --run
npm run build -w apps/web
```

Expected: all Vitest suites PASS and Vite production build exits 0.

- [ ] **Step 7: Commit report styling**

```bash
git add apps/web/src/views/ConsumptionView.vue apps/web/src/components/consumption apps/web/src/style.css
git commit -m "style(web): refine consumption report dashboard"
```

---

### Task 12: Run full regression and update operational documentation

**Files:**
- Modify: `docs/operations/consumption-sync.md`

- [ ] **Step 1: Update the sync runbook**

Change references from a 14-day local snapshot to a 28-day retained snapshot. State that the UI exposes 7/14-day analysis, that 14-day comparison needs all 28 retained days, and that a missing source date creates a chart gap and low-confidence anomaly result.

- [ ] **Step 2: Run API formatting checks without rewriting unrelated files**

```bash
npx prettier --check "apps/api/src/consumption/**/*.ts"
npm run lint -w apps/api
```

Expected: Prettier reports all matched files formatted and ESLint exits 0. If formatting is needed, run Prettier only on the consumption files changed by this plan.

- [ ] **Step 3: Run all API tests**

```bash
npm run test -w apps/api -- --runInBand
```

Expected: all Jest suites PASS.

- [ ] **Step 4: Run all web tests and type/build checks**

```bash
npm run test -w apps/web -- --run
npm run lint -w apps/web
npm run build -w apps/web
```

Expected: all Vitest suites PASS, Vue type checking exits 0, and the production bundle builds successfully.

- [ ] **Step 5: Run repository-wide verification**

```bash
npm run lint
npm run test
npm run build
git diff --check
git status --short
```

Expected: lint, tests, and builds all exit 0; `git diff --check` prints nothing; `git status --short` lists only the runbook change if it has not yet been committed.

- [ ] **Step 6: Commit the runbook and final verification state**

```bash
git add docs/operations/consumption-sync.md
git commit -m "docs: update consumption dashboard operations"
```

- [ ] **Step 7: Review the final commit series**

```bash
git log --oneline --decorate -12
git status --short
```

Expected: the task commits appear in order and the worktree is clean.
