# Consumption V2 14-Day Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the latest 14 business days of domestic and overseas consumption from `guance_crm_v2` into independent local consumption accounts and serve a real 14-day analysis page without touching after-sales customer records.

**Architecture:** A dedicated MariaDB source client performs parameterized read-only aggregation against the new RDS schema. A scheduled NestJS synchronization service upserts independent `ConsumptionAccount` and `ConsumptionDaily` rows into the application MySQL database, while analysis and web requests use only those local tables. The existing consumption page becomes a fixed 14-day workspace with source/account/product filters, synchronization status, data-gap visibility, and 7-day-over-7-day signals.

**Tech Stack:** NestJS 11, TypeScript, Prisma 7, MariaDB connector, MySQL 8, Jest, Vue 3, Vue Router, Vitest

---

## File map

- `apps/api/prisma/schema.prisma` and `apps/api/prisma/migrations/20260820150000_consumption_accounts/` — independent consumption accounts, daily rows, source-date coverage, and sync history.
- `apps/api/src/config/env.validation.ts` — optional source database and cron configuration.
- `apps/api/src/consumption/consumption-window.ts` — deterministic 14-day business window helpers.
- `apps/api/src/consumption/consumption-source.client.ts` — read-only domestic/overseas RDS aggregation.
- `apps/api/src/consumption/consumption-sync.service.ts` — scheduled/manual synchronization and local transaction.
- `apps/api/src/consumption/consumption-analysis.ts` — pure 14-day analysis and anomaly calculation.
- `apps/api/src/consumption/consumption.service.ts` and `consumption.controller.ts` — local analysis, status, and manual-run endpoints.
- `apps/web/src/api/consumption.ts`, `apps/web/src/api/types.ts`, and `apps/web/src/views/ConsumptionView.vue` — typed API integration and 14-day interface.
- `docs/operations/consumption-sync.md` — server configuration, first synchronization, and verification commands.

### Task 1: Independent consumption schema and validated configuration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260820150000_consumption_accounts/migration.sql`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/src/config/env.validation.spec.ts`
- Modify: `.env.example`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write failing environment tests**

Add tests that prove the source integration is disabled when the URL is absent, accepts a MySQL URL and five-field cron, and rejects a non-MySQL URL:

```ts
it('enables consumption sync only when a source URL is configured', () => {
  expect(validateEnv(validEnv()).CONSUMPTION_SYNC_ENABLED).toBe(false);
  const result = validateEnv({
    ...validEnv(),
    CONSUMPTION_SOURCE_DATABASE_URL:
      'mysql://reader:secret@db.example.com:3306/guance_crm_v2',
    CONSUMPTION_SYNC_CRON: '0 13 * * *',
  });
  expect(result).toMatchObject({
    CONSUMPTION_SYNC_ENABLED: true,
    CONSUMPTION_SYNC_CRON: '0 13 * * *',
  });
});

it('rejects a non-MySQL consumption source URL', () => {
  expect(() =>
    validateEnv({
      ...validEnv(),
      CONSUMPTION_SOURCE_DATABASE_URL: 'postgres://db/guance_crm_v2',
    }),
  ).toThrow('CONSUMPTION_SOURCE_DATABASE_URL must be a MySQL connection string');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -w apps/api -- --runInBand env.validation.spec.ts`

Expected: FAIL because `CONSUMPTION_SYNC_ENABLED` and validation are not implemented.

- [ ] **Step 3: Add the environment contract**

Extend `AppEnvironment` and `validateEnv` with:

```ts
CONSUMPTION_SYNC_ENABLED: boolean;
CONSUMPTION_SOURCE_DATABASE_URL?: string;
CONSUMPTION_SYNC_CRON?: string;
```

Use `CONSUMPTION_SOURCE_DATABASE_URL.trim().length > 0` as the enable flag. Validate the URL with `new URL`, require protocol `mysql:`, and require exactly five cron fields. Default the cron to `0 13 * * *`.

- [ ] **Step 4: Replace the coupled Prisma model**

Update the Prisma schema to use these exact models:

```prisma
enum ConsumptionSource {
  DOMESTIC
  OVERSEAS
}

enum ConsumptionSyncStatus {
  RUNNING
  SUCCESS
  FAILED
}

model ConsumptionAccount {
  id          String              @id @default(cuid())
  source      ConsumptionSource
  externalId  String
  displayName String
  managerName String?
  consumptions ConsumptionDaily[]
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt

  @@unique([source, externalId])
  @@index([displayName])
}

model ConsumptionDaily {
  id        String             @id @default(cuid())
  accountId String
  account   ConsumptionAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date      DateTime           @db.Date
  product   String
  amount    Decimal            @db.Decimal(20, 4)
  unit      String             @default("CNY")
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  @@unique([accountId, date, product])
  @@index([date, accountId])
  @@index([date, product])
}

model ConsumptionSourceDay {
  id          String            @id @default(cuid())
  source      ConsumptionSource
  date        DateTime          @db.Date
  recordCount Int
  amount      Decimal           @db.Decimal(20, 4)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  @@unique([source, date])
  @@index([date])
}

model ConsumptionSyncRun {
  id           String                @id @default(cuid())
  status       ConsumptionSyncStatus
  rangeStart   DateTime              @db.Date
  rangeEnd     DateTime              @db.Date
  readCount    Int                   @default(0)
  accountCount Int                   @default(0)
  rowCount     Int                   @default(0)
  errorSummary String?               @db.Text
  startedAt    DateTime              @default(now())
  finishedAt   DateTime?
  createdAt    DateTime              @default(now())

  @@index([status, startedAt])
}
```

Remove `Customer.consumptions` so no relation remains between consumption and after-sales customers.

- [ ] **Step 5: Write the guarded SQL migration**

Create a migration that aborts when existing coupled rows are present, drops the old foreign key/table, and creates the independent structures:

```sql
CREATE TABLE `_ConsumptionMigrationGuard` (`id` INT NOT NULL PRIMARY KEY);
INSERT INTO `_ConsumptionMigrationGuard` (`id`)
SELECT 1 FROM `ConsumptionDaily` LIMIT 1;
INSERT INTO `_ConsumptionMigrationGuard` (`id`) VALUES (1);
DROP TABLE `_ConsumptionMigrationGuard`;

DROP TABLE `ConsumptionDaily`;
CREATE TABLE `ConsumptionAccount` (
  `id` VARCHAR(191) NOT NULL,
  `source` ENUM('DOMESTIC','OVERSEAS') NOT NULL,
  `externalId` VARCHAR(191) NOT NULL,
  `displayName` VARCHAR(191) NOT NULL,
  `managerName` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `ConsumptionAccount_source_externalId_key` (`source`,`externalId`),
  INDEX `ConsumptionAccount_displayName_idx` (`displayName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Complete the same migration with `ConsumptionDaily`, `ConsumptionSourceDay`, `ConsumptionSyncRun`, their declared indexes, and the `ConsumptionDaily_accountId_fkey` cascade constraint exactly matching the Prisma schema.

- [ ] **Step 6: Regenerate Prisma and verify GREEN**

Run:

```bash
npm run prisma:generate -w apps/api
npm run test -w apps/api -- --runInBand env.validation.spec.ts
npx prisma validate --config apps/api/prisma.config.ts
```

Expected: environment tests pass and Prisma reports a valid schema.

- [ ] **Step 7: Commit the schema slice**

```bash
git add -- apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260820150000_consumption_accounts/migration.sql apps/api/src/config/env.validation.ts apps/api/src/config/env.validation.spec.ts .env.example apps/api/.env.example apps/api/src/generated
git commit -m "feat: decouple consumption accounts from customers"
```

### Task 2: Deterministic window and read-only RDS source client

**Files:**
- Create: `apps/api/src/consumption/consumption-window.ts`
- Create: `apps/api/src/consumption/consumption-window.spec.ts`
- Create: `apps/api/src/consumption/consumption-source.client.ts`
- Create: `apps/api/src/consumption/consumption-source.client.spec.ts`

- [ ] **Step 1: Write failing 14-day window tests**

```ts
it('builds fourteen inclusive dates ending at the latest business day', () => {
  expect(consumptionWindow(new Date('2026-08-19T00:00:00.000Z'))).toEqual({
    start: new Date('2026-08-06T00:00:00.000Z'),
    end: new Date('2026-08-19T00:00:00.000Z'),
  });
});

it('rejects an invalid source date', () => {
  expect(() => consumptionWindow(new Date('invalid'))).toThrow(
    'Latest consumption date is invalid',
  );
});
```

- [ ] **Step 2: Run the window test and verify RED**

Run: `npm run test -w apps/api -- --runInBand consumption-window.spec.ts`

Expected: FAIL because `consumption-window.ts` does not exist.

- [ ] **Step 3: Implement the UTC date-only helper**

Export `consumptionWindow(latest: Date)`, `dateOnly(value)`, `addUtcDays(value, days)`, and `dateKey(value)`. Normalize every result to UTC midnight and return an inclusive 14-day window.

- [ ] **Step 4: Write failing source-client tests**

Inject a minimal pool interface and prove:

```ts
it('uses the latest domestic or overseas business date', async () => {
  query.mockResolvedValueOnce([{ domesticMax: '2026-08-19', overseasMax: '2026-08-18' }]);
  await expect(client.latestBusinessDate()).resolves.toEqual(
    new Date('2026-08-19T00:00:00.000Z'),
  );
});

it('maps domestic and overseas aggregates without linking Customer', async () => {
  query
    .mockResolvedValueOnce([{ externalId: 'd1', displayName: '国内甲', managerName: 'PE甲', date: '2026-08-19', product: '日志', amount: '12.34' }])
    .mockResolvedValueOnce([{ externalId: 'o1', displayName: '海外甲', managerName: null, date: '2026-08-19', product: 'APM', amount: '5.66' }]);
  await expect(client.readWindow(window)).resolves.toEqual([
    expect.objectContaining({ source: 'DOMESTIC', externalId: 'd1', amount: '12.34' }),
    expect.objectContaining({ source: 'OVERSEAS', externalId: 'o1', amount: '5.66' }),
  ]);
});
```

Also assert empty external IDs, invalid dates, negative/non-finite amounts, and missing latest dates raise stable errors without including the configured connection URL.

- [ ] **Step 5: Run source-client tests and verify RED**

Run: `npm run test -w apps/api -- --runInBand consumption-source.client.spec.ts`

Expected: FAIL because the client and pool token do not exist.

- [ ] **Step 6: Implement the source client**

Export:

```ts
export const CONSUMPTION_SOURCE_POOL = Symbol('CONSUMPTION_SOURCE_POOL');

export interface SourceConsumptionRow {
  source: 'DOMESTIC' | 'OVERSEAS';
  externalId: string;
  displayName: string;
  managerName: string | null;
  date: Date;
  product: string;
  amount: string;
}

export interface SourceDayCoverage {
  source: 'DOMESTIC' | 'OVERSEAS';
  date: Date;
  recordCount: number;
  amount: string;
}
```

Use parameterized queries with inclusive `start` and `end` values. The domestic SQL groups `daily_usage_details` by date, `customer_id`, `customer_name`, `tam_real_name`, and normalized `product_detail`. The overseas SQL groups `guance_abroad_consumption_detail`, left-joins `signed_abroad_customer` by `gc_account`, and normalizes an empty company/product to account ID/“未分类”. Cast `SUM(origin_amount)` to text before mapping so decimal precision is retained.

`readCoverage(window)` must query `daily_consumption_report` and `guance_abroad_consumption`, group each by its business date, and return `SourceDayCoverage[]`. A date with summary records and zero amount remains available; a date with no summary rows remains missing.

- [ ] **Step 7: Verify the source client and commit**

Run:

```bash
npm run test -w apps/api -- --runInBand consumption-window.spec.ts consumption-source.client.spec.ts
npm run lint -w apps/api
```

Expected: all focused tests pass with no lint errors.

```bash
git add -- apps/api/src/consumption/consumption-window.ts apps/api/src/consumption/consumption-window.spec.ts apps/api/src/consumption/consumption-source.client.ts apps/api/src/consumption/consumption-source.client.spec.ts
git commit -m "feat: read 14-day consumption aggregates"
```

### Task 3: Transactional scheduled and manual synchronization

**Files:**
- Create: `apps/api/src/consumption/consumption-sync.service.ts`
- Create: `apps/api/src/consumption/consumption-sync.service.spec.ts`
- Modify: `apps/api/src/consumption/consumption.module.ts`
- Modify: `apps/api/src/consumption/consumption.controller.ts`
- Create: `apps/api/src/consumption/consumption.controller.spec.ts`

- [ ] **Step 1: Write failing synchronization tests**

Build injected Prisma, source-client, and configuration fakes. Prove that `run()`:

```ts
expect(prisma.customer.create).not.toHaveBeenCalled();
expect(prisma.customer.update).not.toHaveBeenCalled();
expect(prisma.consumptionAccount.upsert).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { source_externalId: { source: 'DOMESTIC', externalId: 'd1' } },
  }),
);
expect(prisma.consumptionDaily.upsert).toHaveBeenCalled();
expect(prisma.consumptionSourceDay.upsert).toHaveBeenCalled();
```

Add tests for successful counts, removal of stale rows only after source reads succeed, removal outside the retained window, concurrent-run rejection, disabled integration, startup recovery of stale `RUNNING` records, scheduled invocation, and sanitized `FAILED` history that excludes connection credentials.

- [ ] **Step 2: Run synchronization tests and verify RED**

Run: `npm run test -w apps/api -- --runInBand consumption-sync.service.spec.ts`

Expected: FAIL because `ConsumptionSyncService` does not exist.

- [ ] **Step 3: Implement synchronization state and transaction**

Implement `OnModuleInit`, `getStatus()`, `run()`, and `@Cron(process.env.CONSUMPTION_SYNC_CRON || '0 13 * * *', { timeZone: 'Asia/Shanghai' })`. `run()` must:

```ts
const latest = await source.latestBusinessDate();
const range = consumptionWindow(latest);
const [rows, coverage] = await Promise.all([
  source.readWindow(range),
  source.readCoverage(range),
]);
const sourceKeys = new Set(rows.map((row) => `${row.source}:${row.externalId}:${dateKey(row.date)}:${row.product}`));
```

Then perform account upserts, daily upserts, coverage upserts, stale-window deletes, and outside-window deletes inside one local Prisma transaction. Do not include the `Customer` delegate in the transaction logic. Mark the run `SUCCESS` only after the transaction commits; on error mark it `FAILED` and rethrow a sanitized application error.

- [ ] **Step 4: Write failing controller authorization tests**

Prove `GET /consumption/sync/status` is authenticated, `POST /consumption/sync/run` accepts `ADMIN` and `MANAGER`, rejects `AGENT`, returns HTTP 202, and returns HTTP 409 while already running.

- [ ] **Step 5: Run controller tests and verify RED**

Run: `npm run test -w apps/api -- --runInBand consumption.controller.spec.ts`

Expected: FAIL because sync routes are absent.

- [ ] **Step 6: Register pool, services, and routes**

In `ConsumptionModule`, register `CONSUMPTION_SOURCE_POOL` as `Pool | null`: return `null` when synchronization is disabled, otherwise create a small pool (`connectionLimit: 2`, `acquireTimeout: 10_000`) from the parsed source URL. The source client must return a stable “disabled” error if called with a null pool. Register the source client and sync service so the module can always boot.

Add:

```ts
@Get('sync/status')
syncStatus() {
  return this.sync.getStatus();
}

@Post('sync/run')
@HttpCode(HttpStatus.ACCEPTED)
runSync(@CurrentUser() user: SessionUser) {
  if (!['ADMIN', 'MANAGER'].includes(user.role)) {
    throw new ForbiddenException('Only administrators and managers can sync');
  }
  if (this.sync.isRunning) {
    throw new ConflictException('A consumption synchronization is already running');
  }
  void this.sync.run(user.sub).catch(() => undefined);
  return { accepted: true };
}
```

- [ ] **Step 7: Verify and commit the synchronization slice**

Run:

```bash
npm run test -w apps/api -- --runInBand consumption-sync.service.spec.ts consumption.controller.spec.ts consumption.module.spec.ts
npm run lint -w apps/api
npm run build -w apps/api
```

Expected: focused tests, lint, and build pass.

```bash
git add -- apps/api/src/consumption
git commit -m "feat: synchronize consumption snapshots"
```

### Task 4: Fixed 14-day local analysis API

**Files:**
- Modify: `apps/api/src/consumption/dto/consumption-query.dto.ts`
- Modify: `apps/api/src/consumption/consumption-analysis.ts`
- Modify: `apps/api/src/consumption/consumption-analysis.spec.ts`
- Modify: `apps/api/src/consumption/consumption.service.ts`
- Modify: `apps/api/src/consumption/consumption.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`

- [ ] **Step 1: Replace period tests with fixed-window and source-filter tests**

Define `source?: 'ALL' | 'DOMESTIC' | 'OVERSEAS'`, `accountId?`, and `product?` in the DTO. Test valid values and reject unknown sources and the removed `days` query through `forbidNonWhitelisted` controller coverage.

Create independent rows shaped as:

```ts
const row = (date: string, amount: number, accountId = 'a1', source = 'DOMESTIC') => ({
  date: new Date(`${date}T00:00:00.000Z`),
  amount,
  product: '日志',
  unit: 'CNY',
  account: {
    id: accountId,
    source,
    externalId: accountId,
    displayName: `账户-${accountId}`,
    managerName: null,
  },
});
```

Prove the trend has exactly 14 dates ending at `dataThrough`, `availableDates` distinguishes source gaps from zero amounts, and KPI comparison uses the first and second seven-day halves.

- [ ] **Step 2: Run analysis tests and verify RED**

Run: `npm run test -w apps/api -- --runInBand consumption-analysis.spec.ts consumption.service.spec.ts`

Expected: FAIL because the old code requires `days` and `customer`.

- [ ] **Step 3: Implement the fixed analysis contract**

Return:

```ts
{
  periodDays: 14,
  range: { from, to },
  dataThrough,
  lastSyncedAt,
  coverage,
  availableDates,
  missingDates,
  unit: 'CNY',
  kpis: {
    totalAmount,
    recentSevenAmount,
    previousSevenAmount,
    changeRate,
    activeAccounts,
    anomalyAccounts,
  },
  trend,
  productDistribution,
  accountRanking,
  anomalies,
  filters: { accounts, products },
}
```

Use account IDs and names throughout. Include `source` in rankings and anomalies. Mark anomaly entries `confidence: 'LOW'` whenever either seven-day half contains a missing source date; otherwise return `confidence: 'HIGH'`.

- [ ] **Step 4: Query only local independent tables**

`ConsumptionService.analysis()` must read the latest successful sync record for `rangeEnd/finishedAt`, query `ConsumptionDaily` with `account` included, and query `ConsumptionSourceDay` for the same window. Apply source through `account.source`, account through `accountId`, and product directly. Do not query `Customer` or the RDS client. Build coverage per day and source; for `ALL`, a date is available only when both source markers exist.

- [ ] **Step 5: Keep dashboard consumption local**

Update the dashboard aggregate to use the latest 14-day `ConsumptionDaily.amount` values without joining `Customer`. Preserve `null` when no successful consumption sync exists and keep the existing dashboard response shape.

- [ ] **Step 6: Verify and commit analysis**

Run:

```bash
npm run test -w apps/api -- --runInBand consumption dashboard.service.spec.ts
npm run lint -w apps/api
npm run build -w apps/api
```

Expected: all consumption and dashboard tests pass.

```bash
git add -- apps/api/src/consumption apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.service.spec.ts
git commit -m "feat: analyze independent 14-day consumption"
```

### Task 5: 14-day consumption web workspace and working synchronization controls

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/consumption.ts`
- Modify: `apps/web/tests/data-layer.spec.ts`
- Modify: `apps/web/tests/consumption-view.spec.ts`
- Modify: `apps/web/src/views/ConsumptionView.vue`
- Modify: `apps/web/src/style.css`

- [ ] **Step 1: Write failing typed request tests**

Assert exact requests:

```ts
expect(getConsumptionAnalysis({ source: 'OVERSEAS', accountId: 'o1', product: 'APM' }))
  .resolves.toBeDefined();
expect(fetchMock).toHaveBeenCalledWith(
  '/api/consumption/analysis?source=OVERSEAS&accountId=o1&product=APM',
  expect.objectContaining({ credentials: 'include' }),
);
```

Also assert `getConsumptionSyncStatus()` calls `GET /consumption/sync/status` and `runConsumptionSync()` calls `POST /consumption/sync/run`.

- [ ] **Step 2: Write failing component behavior tests**

Mock the three consumption API methods and prove:

- the page contains no 7/30/60 controls and displays “最近 14 天”；
- switching to overseas reloads with `source: 'OVERSEAS'`；
- account options come from `analysis.filters.accounts`, not `listCustomers`；
- missing dates render `data-missing="true"` and a visible completeness warning；
- the manual sync button calls the API, polls status, then reloads analysis；
- loading, error, empty, unauthorized-sync, and retry states remain actionable.

- [ ] **Step 3: Run web tests and verify RED**

Run: `npm run test -w apps/web -- --run tests/data-layer.spec.ts tests/consumption-view.spec.ts`

Expected: FAIL because the old page still has period controls and customer API coupling.

- [ ] **Step 4: Update API types and wrappers**

Use:

```ts
export type ConsumptionSourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS';

export function getConsumptionAnalysis(params: {
  source: ConsumptionSourceFilter;
  accountId?: string;
  product?: string;
}) { /* URLSearchParams with source/accountId/product */ }

export const getConsumptionSyncStatus = () =>
  apiRequest<ConsumptionSyncStatus>('/consumption/sync/status');

export const runConsumptionSync = () =>
  apiRequest<{ accepted: true }>('/consumption/sync/run', { method: 'POST' });
```

Update `ConsumptionAnalysis` to match Task 4 exactly and use `accountRanking`/`activeAccounts` rather than customer terminology.

- [ ] **Step 5: Implement the page behavior**

Remove `listCustomers`, period state, and `setPeriod`. Add source/account/product state, a source segmented control, status loading, manual sync polling, freshness labels, and a missing-date warning. Keep the existing chart and panel layout while changing all “客户” labels inside this page to “消费账户”. Render `¥` formatting for CNY and source badges for every ranking/anomaly row.

- [ ] **Step 6: Verify accessibility and responsive behavior**

Ensure source buttons have `aria-pressed`, the sync status uses `aria-live`, missing points have descriptive labels, disabled synchronization explains the permission/integration reason, and the existing mobile breakpoint does not overflow with 14 points.

- [ ] **Step 7: Verify and commit web changes**

Run:

```bash
npm run test -w apps/web -- --run tests/data-layer.spec.ts tests/consumption-view.spec.ts
npm run lint -w apps/web
npm run build -w apps/web
```

Expected: focused tests, lint, and build pass.

```bash
git add -- apps/web/src/api/types.ts apps/web/src/api/consumption.ts apps/web/tests/data-layer.spec.ts apps/web/tests/consumption-view.spec.ts apps/web/src/views/ConsumptionView.vue apps/web/src/style.css
git commit -m "feat: show 14-day consumption workspace"
```

### Task 6: Operations guide, deployment, real synchronization, and reconciliation

**Files:**
- Create: `docs/operations/consumption-sync.md`

- [ ] **Step 1: Write the operations guide**

Document these exact server-only settings without real credentials:

```dotenv
CONSUMPTION_SOURCE_DATABASE_URL=mysql://READ_ONLY_USER:READ_ONLY_PASSWORD@RDS_HOST:3306/guance_crm_v2
CONSUMPTION_SYNC_CRON=0 13 * * *
```

Document the 14-day retention, independent account model, status/manual endpoints, expected 13:00 schedule, source query timeout behavior, and rollback procedure using the pre-migration database dump and application archive.

- [ ] **Step 2: Run the full local verification gate**

Run:

```bash
npm test
npm run lint
npm run build
npx prisma validate --config apps/api/prisma.config.ts
git diff --check
```

Expected: API, web, and end-to-end suites pass; both builds and Prisma validation exit zero; no whitespace errors.

- [ ] **Step 3: Create read-only deployment backups and preflight data**

On the server, record `SELECT COUNT(*) FROM after_sales.ConsumptionDaily`. Proceed only when the result is zero. Create a timestamped MySQL dump and application archive before applying the migration. Do not alter `guance_crm_v2`.

- [ ] **Step 4: Deploy code and configure the source URL without exposing it**

Synchronize the committed code while excluding `.env`, `node_modules`, build output, and local artifacts. Read the existing `SHIRUN_DATABASE_URL` value from `/feishu_v2/.env` into an in-memory shell variable, normalize the SQLAlchemy scheme from `mysql+pymysql://` to `mysql://`, and write it to the management service `.env` as `CONSUMPTION_SOURCE_DATABASE_URL`; never print either value. Set file mode `0600`.

- [ ] **Step 5: Apply migration, build, and restart**

Run on the server:

```bash
npm run prisma:migrate -w apps/api
npm run prisma:generate -w apps/api
npm run build
systemctl restart after-sales-api
systemctl is-active after-sales-api
```

Expected: migration and builds succeed and the service is `active`.

- [ ] **Step 6: Trigger and poll the first real synchronization**

Authenticate through the local API without printing the cookie or password, call `POST /api/consumption/sync/run`, and poll `GET /api/consumption/sync/status` until `SUCCESS`. Record only range, source row count, independent account count, local aggregate count, and error count.

- [ ] **Step 7: Reconcile local totals against read-only source aggregates**

For the synchronized range, compare these three values for `ALL`, `DOMESTIC`, and `OVERSEAS`:

```sql
SELECT ROUND(SUM(origin_amount), 4)
FROM daily_usage_details
WHERE consume_time_of_day BETWEEN ? AND ?;

SELECT ROUND(SUM(origin_amount), 4)
FROM guance_abroad_consumption_detail
WHERE consume_time_of_day BETWEEN ? AND ?;

SELECT source, ROUND(SUM(amount), 4)
FROM after_sales.ConsumptionDaily d
JOIN after_sales.ConsumptionAccount a ON a.id = d.accountId
GROUP BY source;
```

Expected: domestic and overseas local totals equal their source totals to four decimal places, and combined total equals their sum. Confirm the after-sales `Customer` row count is unchanged from the preflight value.

- [ ] **Step 8: Browser and log verification**

Verify login, source switching, account/product filtering, missing-date display, ranking, anomaly list, and manual synchronization in a real browser. Check the service journal after restart for errors and confirm the public homepage returns HTTP 200.

- [ ] **Step 9: Commit documentation and push the requested branch**

```bash
git add -- docs/operations/consumption-sync.md
git commit -m "docs: add consumption sync operations"
git status --short
git push origin main
```

Expected: worktree is clean and local `main` equals `origin/main`.
