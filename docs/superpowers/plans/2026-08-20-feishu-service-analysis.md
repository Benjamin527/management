# Feishu Service Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将飞书多维表格中的 2026 年企业客户服务记录单向同步到 MySQL，并在现有售后 Web 系统中提供可筛选、可下钻的服务分析、服务记录和同步状态页面。

**Architecture:** 飞书仍是服务记录唯一事实源。NestJS 服务端通过飞书 OpenAPI 拉取数据、归一化后写入独立的 `FeishuServiceRecord` 镜像表；首次同步 2026 全量，之后每天按“最近 7 天 + 1 天重叠/失败补偿”增量同步。分析接口只读取 MySQL，Vue 前端不直接接触飞书凭证，也不提供本地新增或回写飞书的入口。

**Tech Stack:** NestJS 11、Prisma 6、MySQL 8、Vue 3、Pinia、Vue Router、ECharts、Vitest、Jest、Supertest、飞书 Base OpenAPI

---

## Scope and file map

Backend additions:

- `apps/api/prisma/schema.prisma` — 飞书服务记录、同步运行记录、枚举和客户关联。
- `apps/api/prisma/migrations/20260820010000_feishu_service_analysis/migration.sql` — MySQL 迁移。
- `apps/api/.env.example` — 仅列出配置名和安全示例，不写真实密钥。
- `apps/api/src/config/env.validation.ts` — 校验飞书配置、同步年份和定时表达式。
- `apps/api/src/feishu/feishu.module.ts` — 飞书 HTTP 客户端模块。
- `apps/api/src/feishu/feishu-client.service.ts` — tenant token 与 Base 分页查询。
- `apps/api/src/feishu/feishu-client.service.spec.ts` — token、分页、错误和脱敏测试。
- `apps/api/src/service-sync/service-record.mapper.ts` — 字段解析、状态和问题类型归一化。
- `apps/api/src/service-sync/service-record.mapper.spec.ts` — 真实字段形态的纯函数测试。
- `apps/api/src/service-sync/sync-window.ts` — 2026 全量、7 天滑窗和失败补偿窗口。
- `apps/api/src/service-sync/sync-window.spec.ts` — 时区和窗口边界测试。
- `apps/api/src/service-sync/service-sync.module.ts` — 同步模块及定时任务注册。
- `apps/api/src/service-sync/service-sync.service.ts` — 分页拉取、客户匹配、幂等 upsert、软删除与运行状态。
- `apps/api/src/service-sync/service-sync.service.spec.ts` — 同步编排测试。
- `apps/api/src/service-sync/service-sync.controller.ts` — 查询状态和手动触发。
- `apps/api/src/service-sync/service-sync.controller.spec.ts` — 权限、冲突和 202 响应测试。
- `apps/api/src/service-analysis/service-analysis.module.ts` — 分析模块。
- `apps/api/src/service-analysis/service-analysis.service.ts` — 2026 KPI、趋势、分布、客户和工程师聚合。
- `apps/api/src/service-analysis/service-analysis.service.spec.ts` — 聚合规则测试。
- `apps/api/src/service-analysis/service-analysis.controller.ts` — 分析 REST API。
- `apps/api/src/service-records/service-records.module.ts` — 服务记录查询模块。
- `apps/api/src/service-records/service-records.service.ts` — 过滤、分页、详情。
- `apps/api/src/service-records/service-records.controller.ts` — 明细 REST API。
- `apps/api/src/service-records/service-records.service.spec.ts` — 查询边界和过滤测试。
- `apps/api/src/app.module.ts` — 注册 Schedule、同步、分析和记录模块。
- `apps/api/src/customers/customers.service.ts` — 客户列表和详情附加 2026 服务摘要。
- `apps/api/test/service-analysis.e2e-spec.ts` — 权限、分析、明细和同步 API 端到端测试。

Frontend additions/changes:

- `apps/web/src/types/service.ts` — 分析、记录、同步状态类型。
- `apps/web/src/api/serviceAnalysis.ts` — 分析 API。
- `apps/web/src/api/serviceRecords.ts` — 明细 API。
- `apps/web/src/api/serviceSync.ts` — 状态和手动同步 API。
- `apps/web/src/views/ServiceAnalysisView.vue` — 2026 服务分析总览和图表下钻。
- `apps/web/src/views/ServiceRecordsView.vue` — 服务记录筛选、分页和详情抽屉。
- `apps/web/src/views/CustomerDetailView.vue` — 客户基本信息、消费入口和 2026 服务记录。
- `apps/web/src/components/service/SyncStatusBar.vue` — 最近同步、错误和手动同步按钮。
- `apps/web/src/components/service/ServiceRecordDrawer.vue` — 完整原始/归一化字段详情。
- `apps/web/src/router/index.ts` — 新增路由并将旧 `/issues` 重定向到 `/service-records`。
- `apps/web/src/layouts/AppLayout.vue` — 导航改为“服务分析 / 服务记录”。
- `apps/web/src/views/DashboardView.vue` — 移除本地新建问题，改用 2026 服务摘要和飞书入口。
- `apps/web/src/views/CustomersView.vue` — 展示服务次数、未闭环数和最近服务日期。
- `apps/web/src/views/__tests__/ServiceAnalysisView.spec.ts` — 分析页状态和下钻测试。
- `apps/web/src/views/__tests__/ServiceRecordsView.spec.ts` — 筛选、分页、详情和无新增按钮测试。
- `apps/web/src/components/service/__tests__/SyncStatusBar.spec.ts` — 权限和手动同步测试。

## Task 1: Add the MySQL mirror schema and configuration contract

**Files:**

- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260820010000_feishu_service_analysis/migration.sql`
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/src/config/env.validation.spec.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write failing environment validation tests**

Add cases that prove production sync configuration is explicit and secrets are never assigned defaults:

```ts
it('accepts the complete Feishu sync configuration', () => {
  const value = validateEnv({
    DATABASE_URL: 'mysql://user:pass@localhost:3306/management',
    JWT_SECRET: 'a-secret-with-at-least-32-characters',
    FEISHU_APP_ID: 'cli_example',
    FEISHU_APP_SECRET: 'server-only-secret',
    FEISHU_BASE_APP_TOKEN: 'base_token',
    FEISHU_SERVICE_TABLE_ID: 'tblczuC0hyPSnOMj',
    FEISHU_SYNC_YEAR: '2026',
    FEISHU_SYNC_CRON: '0 2 * * *',
    FEISHU_SERVICE_BASE_URL: 'https://example.feishu.cn/wiki/example',
  });

  expect(value.FEISHU_SYNC_YEAR).toBe(2026);
  expect(value.FEISHU_SYNC_CRON).toBe('0 2 * * *');
});

it('rejects a partial Feishu configuration', () => {
  expect(() => validateEnv({
    DATABASE_URL: 'mysql://user:pass@localhost:3306/management',
    JWT_SECRET: 'a-secret-with-at-least-32-characters',
    FEISHU_APP_ID: 'cli_example',
  })).toThrow(/FEISHU_APP_SECRET/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm run test --workspace=api -- env.validation.spec.ts
```

Expected: FAIL because the Feishu variables and cross-field validation do not exist.

- [ ] **Step 3: Add schema models and indexes**

Add these Prisma enums and models, plus `serviceRecords FeishuServiceRecord[]` on `Customer`:

```prisma
enum ServiceRecordStatus {
  RESOLVED
  CLOSED
  IN_PROGRESS
  WAITING_REPLY
  ESCALATED
  UNKNOWN
  OTHER
}

enum ServiceSyncMode {
  RECENT
  FULL_YEAR
}

enum ServiceSyncStatus {
  RUNNING
  SUCCESS
  FAILED
}

model FeishuServiceRecord {
  id                     String              @id @default(cuid())
  externalRecordId       String              @unique
  serviceRecordNo        String?
  startDate              DateTime
  endDate                DateTime?
  customerName           String
  customerId             String?
  customer               Customer?           @relation(fields: [customerId], references: [id])
  questionerRole         String?
  sourceType             String?
  feedbackTypeRaw        String?
  feedbackTypeNormalized String?
  issueTypeRaw           String?
  issueTypeNormalized    String?
  deploymentType         String?
  ticketId               String?
  summary                String              @db.Text
  conclusion             String?             @db.Text
  satisfaction           Int?
  sourceStatus           String?
  normalizedStatus       ServiceRecordStatus
  firstLineEngineer      String?
  secondLineEngineer     String?
  thirdLineEngineer      String?
  keyIssue               Boolean             @default(false)
  submittedByName        String?
  submittedByOpenId      String?
  submittedAt            DateTime?
  rawFields              Json
  sourceCreatedAt        DateTime?
  sourceUpdatedAt        DateTime?
  syncedAt               DateTime            @default(now())
  deletedAt              DateTime?
  createdAt              DateTime            @default(now())
  updatedAt              DateTime            @updatedAt

  @@index([startDate, deletedAt])
  @@index([normalizedStatus, startDate])
  @@index([customerId, startDate])
  @@index([customerName, startDate])
  @@index([issueTypeNormalized, startDate])
  @@index([firstLineEngineer, startDate])
}

model ServiceSyncRun {
  id             String            @id @default(cuid())
  mode           ServiceSyncMode
  status         ServiceSyncStatus
  rangeStart     DateTime
  rangeEnd       DateTime
  readCount      Int               @default(0)
  createdCount   Int               @default(0)
  updatedCount   Int               @default(0)
  deletedCount   Int               @default(0)
  failedCount    Int               @default(0)
  errorSummary   String?           @db.Text
  requestedById  String?
  startedAt      DateTime          @default(now())
  finishedAt     DateTime?
  createdAt      DateTime          @default(now())

  @@index([status, startedAt])
  @@index([mode, startedAt])
}
```

Generate the SQL with Prisma, rename the generated migration directory to the exact path listed above, and inspect it before keeping the migration:

```bash
cd apps/api
npx prisma migrate dev --name feishu_service_analysis --create-only
npx prisma migrate status
npx prisma generate
```

Expected: migration contains only additive tables, indexes, enum columns and the nullable customer foreign key; no existing table or column is dropped.

- [ ] **Step 4: Implement environment validation**

Expose typed values for the seven Feishu variables. Require all Feishu variables together when `FEISHU_APP_ID` is present; otherwise allow local unit tests to run without external integration. Apply defaults only to `FEISHU_SYNC_YEAR=2026` and `FEISHU_SYNC_CRON='0 2 * * *'` after integration has been enabled.

`.env.example` must contain safe names only:

```dotenv
FEISHU_APP_ID=cli_replace_on_server
FEISHU_APP_SECRET=replace_on_server
FEISHU_BASE_APP_TOKEN=replace_on_server
FEISHU_SERVICE_TABLE_ID=tblczuC0hyPSnOMj
FEISHU_SYNC_YEAR=2026
FEISHU_SYNC_CRON=0 2 * * *
FEISHU_SERVICE_BASE_URL=https://your-tenant.feishu.cn/wiki/replace
```

- [ ] **Step 5: Run schema and configuration checks**

Run:

```bash
npm run test --workspace=api -- env.validation.spec.ts
npm run prisma:generate --workspace=api
npx prisma validate --schema apps/api/prisma/schema.prisma
```

Expected: all focused tests PASS, Prisma client generation succeeds, schema reports valid.

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260820010000_feishu_service_analysis/migration.sql apps/api/src/config/env.validation.ts apps/api/src/config/env.validation.spec.ts apps/api/.env.example
git commit -m "feat(api): add Feishu service mirror schema"
```

## Task 2: Build a server-only Feishu Base OpenAPI client

**Files:**

- Create: `apps/api/src/feishu/feishu.module.ts`
- Create: `apps/api/src/feishu/feishu-client.service.ts`
- Create: `apps/api/src/feishu/feishu-client.service.spec.ts`

- [ ] **Step 1: Write failing token, pagination, filter and error tests**

Inject `fetch` through a `FEISHU_FETCH` provider so tests never call the network. Cover:

```ts
it('searches every page without a view_id and with a server-side date filter', async () => {
  fetchMock
    .mockResolvedValueOnce(tokenResponse('tenant-token', 7200))
    .mockResolvedValueOnce(recordsResponse(['r1'], true, 'next'))
    .mockResolvedValueOnce(recordsResponse(['r2'], false));

  const records = await service.searchRecords({
    start: new Date('2026-01-01T00:00:00+08:00'),
    end: new Date('2027-01-01T00:00:00+08:00'),
  });

  expect(records.map((item) => item.record_id)).toEqual(['r1', 'r2']);
  expect(fetchMock.mock.calls[1][0]).not.toContain('view_id');
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
    filter: {
      conjunction: 'and',
      conditions: [
        { field_name: '开始日期', operator: 'isGreaterEqual' },
        { field_name: '开始日期', operator: 'isLess' },
      ],
    },
  });
});

it('does not include app secret or tenant token in thrown errors', async () => {
  fetchMock.mockResolvedValueOnce(tokenResponse('tenant-token', 7200));
  fetchMock.mockResolvedValueOnce(apiError(1254291, 'request failed'));

  await expect(service.searchRecords(range)).rejects.not.toThrow(/tenant-token|server-only-secret/);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=api -- feishu-client.service.spec.ts
```

Expected: FAIL because the Feishu module and client do not exist.

- [ ] **Step 3: Implement token caching and date-filtered pagination**

Implement these public contracts:

```ts
export interface FeishuBaseRecord {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: number;
  last_modified_time?: number;
}

export interface RecordSearchRange {
  start: Date;
  end: Date;
}

@Injectable()
export class FeishuClientService {
  async searchRecords(range: RecordSearchRange): Promise<FeishuBaseRecord[]>;
}
```

Use:

- `POST /open-apis/auth/v3/tenant_access_token/internal`
- `POST /open-apis/bitable/v1/apps/{appToken}/tables/{tableId}/records/search?page_size=500`
- `Authorization: Bearer {tenant_access_token}`
- Base filter conjunction `and`, with `开始日期 isGreaterEqual start` and `开始日期 isLess end`, encoded as epoch-millisecond strings.
- `page_token` only for the next page; never append `view_id`.
- Cache the token until 60 seconds before expiry.
- On one authentication failure, clear the token and retry that request once.
- Retry HTTP 429/5xx, Feishu rate-limit codes and transient network failures at most three times with 250/500/1000 ms capped backoff; do not retry permanent 4xx validation or permission errors.
- Throw a sanitized domain error containing Feishu `code`, `msg` and request context, never request headers or credentials.

- [ ] **Step 4: Run client tests and API lint**

```bash
npm run test --workspace=api -- feishu-client.service.spec.ts
npm run lint --workspace=api
```

Expected: focused tests PASS and lint exits 0.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/api/src/feishu
git commit -m "feat(api): add Feishu Base OpenAPI client"
```

## Task 3: Normalize Feishu records without losing source data

**Files:**

- Create: `apps/api/src/service-sync/service-record.mapper.ts`
- Create: `apps/api/src/service-sync/service-record.mapper.spec.ts`

- [ ] **Step 1: Write failing mapper tests from observed field shapes**

Cover text values, option strings, collaborator arrays, Unix millisecond dates, blanks and alternate labels:

```ts
it.each([
  ['已解决', 'RESOLVED'],
  ['已关闭', 'CLOSED'],
  ['跟进中', 'IN_PROGRESS'],
  ['待回复', 'WAITING_REPLY'],
  ['已提交飞书项目', 'ESCALATED'],
  ['', 'UNKNOWN'],
])('maps source status %s to %s', (source, expected) => {
  expect(normalizeStatus(source)).toBe(expected);
});

it.each([
  ['Datakit问题', 'DataKit 问题'],
  ['DataKit 问题', 'DataKit 问题'],
  ['Func问题', 'Func 问题'],
  ['Func 问题', 'Func 问题'],
])('normalizes issue type %s', (source, expected) => {
  expect(normalizeIssueType(source)).toBe(expected);
});

it('keeps raw fields while extracting analysis fields', () => {
  const raw = fixtureRecord({
    客户名称: '太保',
    开始日期: 1767225600000,
    状态: '跟进中',
    问题类型: 'Datakit问题',
    一线工程师: [{ name: '王雨轩', id: 'ou_example' }],
  });

  expect(mapServiceRecord(raw)).toMatchObject({
    externalRecordId: raw.record_id,
    customerName: '太保',
    normalizedStatus: 'IN_PROGRESS',
    issueTypeNormalized: 'DataKit 问题',
    firstLineEngineer: '王雨轩',
    rawFields: raw.fields,
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=api -- service-record.mapper.spec.ts
```

Expected: FAIL because normalization functions do not exist.

- [ ] **Step 3: Implement pure extraction and normalization functions**

Export:

```ts
export function normalizeStatus(value: unknown): ServiceRecordStatus;
export function normalizeIssueType(value: unknown): string | null;
export function mapServiceRecord(record: FeishuBaseRecord): Prisma.FeishuServiceRecordUncheckedCreateInput;
```

Rules:

- Reject a record only when `record_id` or `开始日期` is unusable; return a structured mapper error with record ID and field name. Keep a missing customer unassociated with `customerName='未填写客户'`, and keep a missing summary as an empty string so incomplete source records remain countable.
- Preserve all source fields in `rawFields`.
- Store source and normalized values side by side.
- Combine multi-person values into a stable `、`-separated name list.
- Treat empty, missing and whitespace-only status as `UNKNOWN`; unrecognized non-empty status as `OTHER`.
- Parse satisfaction only when it is a finite integer.
- Store Feishu created/updated millisecond timestamps when supplied.

- [ ] **Step 4: Run mapper tests**

```bash
npm run test --workspace=api -- service-record.mapper.spec.ts
```

Expected: PASS for status mapping, duplicate issue-type mapping, raw preservation and invalid-record errors.

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/api/src/service-sync/service-record.mapper.ts apps/api/src/service-sync/service-record.mapper.spec.ts
git commit -m "feat(api): normalize Feishu service records"
```

## Task 4: Implement the 2026 full and recent-window synchronization engine

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/service-sync/sync-window.ts`
- Create: `apps/api/src/service-sync/sync-window.spec.ts`
- Create: `apps/api/src/service-sync/service-sync.module.ts`
- Create: `apps/api/src/service-sync/service-sync.service.ts`
- Create: `apps/api/src/service-sync/service-sync.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Install the Nest schedule dependency**

```bash
npm install @nestjs/schedule --workspace=api
```

Expected: `@nestjs/schedule` appears in the API workspace dependencies and the lockfile changes only for its dependency graph.

- [ ] **Step 2: Write failing window tests**

Freeze the clock in Asia/Shanghai and cover the agreed boundaries:

```ts
it('uses a one-day overlap around the seven-natural-day business window', () => {
  const range = computeSyncRange({
    mode: 'RECENT',
    now: new Date('2026-08-20T10:30:00+08:00'),
    year: 2026,
    lastSuccessfulAt: new Date('2026-08-19T02:00:00+08:00'),
  });

  expect(range.start.toISOString()).toBe('2026-08-12T16:00:00.000Z');
  expect(range.end.toISOString()).toBe('2026-08-20T16:00:00.000Z');
});

it('expands to one day before the last success after a long failure', () => {
  const range = computeSyncRange({
    mode: 'RECENT',
    now: new Date('2026-08-20T10:30:00+08:00'),
    year: 2026,
    lastSuccessfulAt: new Date('2026-08-08T02:00:00+08:00'),
  });

  expect(range.start.toISOString()).toBe('2026-08-06T16:00:00.000Z');
});

it('clamps every range to the 2026 analysis year', () => {
  expect(computeSyncRange({
    mode: 'FULL_YEAR',
    now: new Date('2026-08-20T10:30:00+08:00'),
    year: 2026,
    lastSuccessfulAt: null,
  })).toEqual({
    start: new Date('2025-12-31T16:00:00.000Z'),
    end: new Date('2026-12-31T16:00:00.000Z'),
  });
});
```

- [ ] **Step 3: Run the window test and confirm RED**

```bash
npm run test --workspace=api -- sync-window.spec.ts
```

Expected: FAIL because `computeSyncRange` does not exist.

- [ ] **Step 4: Implement Asia/Shanghai range calculation**

Use explicit UTC+8 midnight conversion rather than the server's local timezone. `RECENT` chooses the earlier of:

- today at 00:00 Asia/Shanghai minus 7 days; and
- `lastSuccessfulAt` converted to its Asia/Shanghai calendar day minus 1 day.

Clamp the start to `2026-01-01 00:00 +08:00`; end is tomorrow for recent mode and `2027-01-01 00:00 +08:00` for full-year mode.

- [ ] **Step 5: Write failing orchestration tests**

Mock Prisma, Feishu client and mapper. Prove:

```ts
it('upserts all pages and marks the run successful only after completion', async () => {
  feishu.searchRecords.mockResolvedValue([record('r1'), record('r2')]);

  await service.run('RECENT', 'admin-id');

  expect(prisma.feishuServiceRecord.upsert).toHaveBeenCalledTimes(2);
  expect(prisma.serviceSyncRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'SUCCESS', readCount: 2 }),
  }));
});

it('does not soft-delete or advance success when a page fails', async () => {
  feishu.searchRecords.mockRejectedValue(new Error('page 2 failed'));

  await expect(service.run('RECENT', 'admin-id')).rejects.toThrow('page 2 failed');

  expect(prisma.feishuServiceRecord.updateMany).not.toHaveBeenCalled();
  expect(prisma.serviceSyncRun.update).toHaveBeenLastCalledWith(expect.objectContaining({
    data: expect.objectContaining({ status: 'FAILED' }),
  }));
});

it('soft-deletes only missing IDs inside a completely fetched range', async () => {
  feishu.searchRecords.mockResolvedValue([record('r1')]);
  prisma.feishuServiceRecord.findMany.mockResolvedValue([
    { externalRecordId: 'r1' },
    { externalRecordId: 'r-old' },
  ]);

  await service.run('RECENT', 'admin-id');

  expect(prisma.feishuServiceRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ externalRecordId: { in: ['r-old'] } }),
    data: { deletedAt: expect.any(Date) },
  }));
});
```

- [ ] **Step 6: Implement synchronization as an idempotent single-flight operation**

The service must:

1. Mark a stale database `RUNNING` row as failed on startup, and reject a second run with `ConflictException` while one run is active in this single API process.
2. Create a `RUNNING` `ServiceSyncRun` before network access.
3. Fetch all records for the computed range.
4. Map each record; collect per-record mapping failures without aborting valid upserts, and include failure count/sample record IDs in the run.
5. Match `Customer` by exact trimmed company name; create the customer only when absent, without overwriting existing industry, level or owner. Do not create a placeholder customer for `未填写客户`.
6. Upsert by `externalRecordId`; set `deletedAt=null` when a record reappears.
7. Revalidate the mapped `startDate` against the computed range before writing. Only after full Feishu pagination succeeds, compare every fetched `record_id` (including records with mapping failures) to active mirrored IDs in the same date range and soft-delete missing records.
8. Mark `SUCCESS`, counts and `finishedAt` only after all DB work succeeds. The latest successful run is the source of `lastSuccessfulAt`.
9. On any fatal error, mark `FAILED` with a sanitized `errorSummary`, keep already persisted records safe, do not perform missing-record deletion, then rethrow.
10. Register the cron with Asia/Shanghai time-zone semantics. When Feishu integration is not configured, log one disabled message at startup and make the scheduled handler a no-op without any network request.

For the few thousand 2026 records, transaction each individual record/customer upsert to avoid a year-long transaction and keep the operation resumable.

- [ ] **Step 7: Run synchronization tests**

```bash
npm run test --workspace=api -- sync-window.spec.ts service-sync.service.spec.ts
npm run lint --workspace=api
```

Expected: focused tests PASS; lint exits 0.

- [ ] **Step 8: Commit Task 4**

```bash
git add package.json package-lock.json apps/api/src/service-sync apps/api/src/app.module.ts
git commit -m "feat(api): sync 2026 Feishu service records"
```

## Task 5: Expose sync status and protected manual runs

**Files:**

- Create: `apps/api/src/service-sync/dto/run-service-sync.dto.ts`
- Create: `apps/api/src/service-sync/service-sync.controller.ts`
- Create: `apps/api/src/service-sync/service-sync.controller.spec.ts`
- Modify: `apps/api/src/service-sync/service-sync.module.ts`

- [ ] **Step 1: Write failing controller tests**

Cover authenticated reads, role restrictions, validation and asynchronous acceptance:

```ts
it.each(['ADMIN', 'MANAGER'])('allows %s to trigger a full-year run', async (role) => {
  const response = await request(app.getHttpServer())
    .post('/api/service-sync/run')
    .set('Authorization', await tokenFor(role))
    .send({ mode: 'full-year' })
    .expect(202);

  expect(response.body).toMatchObject({ accepted: true, mode: 'full-year' });
});

it('forbids an agent from triggering a run', async () => {
  await request(app.getHttpServer())
    .post('/api/service-sync/run')
    .set('Authorization', await tokenFor('AGENT'))
    .send({ mode: 'recent' })
    .expect(403);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=api -- service-sync.controller.spec.ts
```

Expected: FAIL because endpoints do not exist.

- [ ] **Step 3: Implement endpoints and response contracts**

`GET /api/service-sync/status` returns:

```ts
{
  enabled: boolean;
  running: boolean;
  lastSuccessfulRun: ServiceSyncRunDto | null;
  lastRun: ServiceSyncRunDto | null;
  nextScheduledAt: string | null;
  sourceUrl: string;
}
```

`POST /api/service-sync/run` accepts `{ mode: 'recent' | 'full-year' }`, checks `request.user.role`, starts a safely caught background promise, and immediately returns HTTP 202. Return 409 if a run is active. Only `ADMIN` and `MANAGER` may trigger; all authenticated roles may view status.

- [ ] **Step 4: Run focused tests**

```bash
npm run test --workspace=api -- service-sync.controller.spec.ts
```

Expected: PASS for status, 202, 400, 403 and 409 cases.

- [ ] **Step 5: Commit Task 5**

```bash
git add apps/api/src/service-sync
git commit -m "feat(api): expose service sync controls"
```

## Task 6: Add service analysis and filtered record APIs

**Files:**

- Create: `apps/api/src/service-analysis/service-analysis.module.ts`
- Create: `apps/api/src/service-analysis/service-analysis.service.ts`
- Create: `apps/api/src/service-analysis/service-analysis.service.spec.ts`
- Create: `apps/api/src/service-analysis/service-analysis.controller.ts`
- Create: `apps/api/src/service-records/dto/list-service-records.dto.ts`
- Create: `apps/api/src/service-records/service-records.module.ts`
- Create: `apps/api/src/service-records/service-records.service.ts`
- Create: `apps/api/src/service-records/service-records.service.spec.ts`
- Create: `apps/api/src/service-records/service-records.controller.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing aggregation tests**

Feed a compact fixture covering every status and duplicate issue label. Verify:

```ts
expect(buildSummary(records)).toEqual({
  total: 7,
  waitingReply: 1,
  inProgress: 1,
  escalated: 1,
  bugCount: 1,
  resolvedOrClosedRate: 42.86,
  customerCount: 4,
});

expect(buildDistribution(records, 'issueType')).toContainEqual({
  key: 'DataKit 问题',
  count: 2,
});
```

Also prove soft-deleted and non-2026 records are excluded. Assert a dynamic `quality` object containing field population counts/rates for first-line engineer, satisfaction, ticket ID and key issue, plus `supportsPreciseSla=false`.

- [ ] **Step 2: Write failing record-query tests**

```ts
it('combines filters and clamps all dates to 2026', async () => {
  await service.list({
    page: 1,
    pageSize: 20,
    status: 'WAITING_REPLY',
    customer: '太保',
    dateFrom: '2025-01-01',
    dateTo: '2027-01-01',
  });

  expect(prisma.feishuServiceRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      deletedAt: null,
      normalizedStatus: 'WAITING_REPLY',
      customerName: { contains: '太保' },
      startDate: {
        gte: new Date('2025-12-31T16:00:00.000Z'),
        lt: new Date('2026-12-31T16:00:00.000Z'),
      },
    }),
  }));
});
```

- [ ] **Step 3: Run focused tests and confirm RED**

```bash
npm run test --workspace=api -- service-analysis.service.spec.ts service-records.service.spec.ts
```

Expected: FAIL because services do not exist.

- [ ] **Step 4: Implement aggregation over the bounded 2026 dataset**

Load only active 2026 projection fields, then aggregate the approximately four-thousand rows in pure functions. This keeps KPI definitions consistent across endpoints and makes them deterministic under unit tests.

Implement:

- `GET /api/service-analysis/summary?year=2026`
- `GET /api/service-analysis/trend?year=2026&dimension=status`
- `GET /api/service-analysis/distribution?year=2026&dimension=status|feedbackType|issueType|sourceType|deploymentType|engineer`
- `GET /api/service-analysis/customers?year=2026&limit=10`

Reject any `year` other than 2026 with HTTP 400. Trend returns all 12 months with zero-filled status series. Issue type returns Top 10 plus an `其他` bucket. Customer rows include total, open count, last service date and status breakdown. Engineer rows include total and `thirdLineEscalated` counts. Summary also returns data freshness and field-population counts/rates so the UI never hardcodes observed coverage numbers.

- [ ] **Step 5: Implement record list and detail**

Implement:

- `GET /api/service-records`
- `GET /api/service-records/:id`

List filters: `page`, `pageSize` (1–100), `keyword`, `customer`, `customerId`, `status`, `feedbackType`, `issueType`, `sourceType`, `deploymentType`, `engineer`, `dateFrom`, `dateTo`. All queries force `deletedAt=null` and the 2026 boundary. Keyword searches record number, customer, summary, conclusion and ticket ID. Detail returns normalized fields plus `rawFields` and `sourceUrl`.

- [ ] **Step 6: Run API unit tests**

```bash
npm run test --workspace=api -- service-analysis.service.spec.ts service-records.service.spec.ts
npm run lint --workspace=api
```

Expected: aggregation, filters, 2026 clamp and pagination tests PASS; lint exits 0.

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/api/src/service-analysis apps/api/src/service-records apps/api/src/app.module.ts
git commit -m "feat(api): add service analysis and record queries"
```

## Task 7: Add the typed frontend data layer and synchronization status bar

**Files:**

- Create: `apps/web/src/types/service.ts`
- Create: `apps/web/src/api/serviceAnalysis.ts`
- Create: `apps/web/src/api/serviceRecords.ts`
- Create: `apps/web/src/api/serviceSync.ts`
- Create: `apps/web/src/components/service/SyncStatusBar.vue`
- Create: `apps/web/src/components/service/__tests__/SyncStatusBar.spec.ts`

- [ ] **Step 1: Write failing status-bar tests**

```ts
it('shows last success and lets an admin request a recent sync', async () => {
  vi.mocked(getServiceSyncStatus).mockResolvedValue(successStatus);
  vi.mocked(runServiceSync).mockResolvedValue({ accepted: true, mode: 'recent' });
  const wrapper = mountStatusBar({ role: 'ADMIN' });

  await flushPromises();
  await wrapper.get('[data-testid="sync-recent"]').trigger('click');

  expect(runServiceSync).toHaveBeenCalledWith('recent');
});

it('hides manual sync controls from an agent', async () => {
  const wrapper = mountStatusBar({ role: 'AGENT' });
  await flushPromises();
  expect(wrapper.find('[data-testid="sync-recent"]').exists()).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=web -- SyncStatusBar.spec.ts
```

Expected: FAIL because the component and API functions do not exist.

- [ ] **Step 3: Implement types and API wrappers**

Use the existing authenticated `apiRequest` fetch wrapper. Define precise types for summary, distributions, trends, customer ranking, `ServiceRecordListItem`, `ServiceRecordDetail`, pagination and `ServiceSyncStatus`. Do not use `any` for server payloads.

- [ ] **Step 4: Implement the status bar**

Show:

- enabled/disabled/running state;
- last success time and counts;
- latest failure summary when present;
- “打开飞书服务表” in a new safe tab;
- recent/full-year sync buttons only for `ADMIN` and `MANAGER`;
- pending state after HTTP 202, then poll status every 3 seconds while running and stop polling on unmount.

- [ ] **Step 5: Run web focused tests**

```bash
npm run test --workspace=web -- SyncStatusBar.spec.ts
npm run lint --workspace=web
```

Expected: component tests PASS and lint exits 0.

- [ ] **Step 6: Commit Task 7**

```bash
git add apps/web/src/types/service.ts apps/web/src/api/serviceAnalysis.ts apps/web/src/api/serviceRecords.ts apps/web/src/api/serviceSync.ts apps/web/src/components/service
git commit -m "feat(web): add service sync status controls"
```

## Task 8: Build the 2026 service analysis dashboard with drill-down links

**Files:**

- Create: `apps/web/src/views/ServiceAnalysisView.vue`
- Create: `apps/web/src/views/__tests__/ServiceAnalysisView.spec.ts`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/layouts/AppLayout.vue`

- [ ] **Step 1: Write failing page tests**

```ts
it('renders 2026 KPIs and converts a chart click into record filters', async () => {
  vi.mocked(getServiceSummary).mockResolvedValue(summaryFixture);
  vi.mocked(getServiceTrend).mockResolvedValue(trendFixture);
  vi.mocked(getServiceDistribution).mockResolvedValue(distributionFixture);
  const wrapper = mountWithRouter(ServiceAnalysisView);

  await flushPromises();
  expect(wrapper.text()).toContain('2026 年服务分析');
  expect(wrapper.get('[data-testid="kpi-total"]').text()).toContain('4075');

  await wrapper.get('[data-testid="kpi-waiting-reply"]').trigger('click');
  expect(router.currentRoute.value).toMatchObject({
    path: '/service-records',
    query: { status: 'WAITING_REPLY' },
  });
});
```

Also test loading skeletons, partial endpoint failure, zero data and retry.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=web -- ServiceAnalysisView.spec.ts
```

Expected: FAIL because the view and route do not exist.

- [ ] **Step 3: Implement the desktop-first responsive page**

Top section:

- fixed “2026 年” context; no misleading unrestricted year picker;
- `SyncStatusBar`;
- KPI cards for total, waiting reply, following, escalated, Bug, resolved/closed rate and customers.

Charts:

- monthly stacked trend by normalized status;
- feedback type donut;
- issue type Top 10 horizontal bars;
- source and deployment distributions;
- customer Top 10 with total/open split;
- engineer workload with third-line escalation overlay.

Use ECharts with accessible text summaries under each chart, responsive resize observers, empty states and disposal on unmount. A card, legend, bar or series click routes to `/service-records` with the corresponding query filters and month boundaries. Beside workload, satisfaction, ticket and key-issue analysis, show the API-provided population count and rate; state that natural-day fields cannot support precise response-time/SLA analysis. Do not put create/edit controls anywhere on this page.

- [ ] **Step 4: Add route and navigation**

Add `/service-analysis` with label “服务分析”. Add a temporary `/service-records` route pointing to an explicit loading/coming-next component defined in the router file until Task 9 replaces it. Keep `/dashboard` as the login landing page for now. Update the sidebar ordering to Dashboard, Customers, Service Analysis, Service Records, Consumption.

- [ ] **Step 5: Run analysis page tests and build**

```bash
npm run test --workspace=web -- ServiceAnalysisView.spec.ts
npm run lint --workspace=web
npm run build --workspace=web
```

Expected: focused tests PASS; TypeScript/Vite build succeeds.

- [ ] **Step 6: Commit Task 8**

```bash
git add apps/web/src/views/ServiceAnalysisView.vue apps/web/src/views/__tests__/ServiceAnalysisView.spec.ts apps/web/src/router/index.ts apps/web/src/layouts/AppLayout.vue
git commit -m "feat(web): add 2026 service analysis dashboard"
```

## Task 9: Replace local issue creation with read-only service record exploration

**Files:**

- Create: `apps/web/src/views/ServiceRecordsView.vue`
- Create: `apps/web/src/components/service/ServiceRecordDrawer.vue`
- Create: `apps/web/src/views/__tests__/ServiceRecordsView.spec.ts`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/views/DashboardView.vue`
- Modify: `apps/web/tests/issue-actions.spec.ts`
- Delete: `apps/web/src/views/IssuesView.vue`

- [ ] **Step 1: Write failing record-page tests**

```ts
it('hydrates filters from drill-down query params and fetches records', async () => {
  router.push('/service-records?status=ESCALATED&month=2026-08');
  await router.isReady();
  mountWithRouter(ServiceRecordsView);
  await flushPromises();

  expect(listServiceRecords).toHaveBeenCalledWith(expect.objectContaining({
    status: 'ESCALATED',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  }));
});

it('has no local create action and opens a selected record drawer', async () => {
  const wrapper = mountWithRouter(ServiceRecordsView);
  await flushPromises();

  expect(wrapper.text()).not.toContain('新建服务问题');
  await wrapper.get('[data-testid="record-row-r1"]').trigger('click');
  await flushPromises();
  expect(getServiceRecord).toHaveBeenCalledWith('r1');
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npm run test --workspace=web -- ServiceRecordsView.spec.ts
```

Expected: FAIL because the read-only view does not exist.

- [ ] **Step 3: Implement filterable table and detail drawer**

Filters must match the API and synchronize with the URL so refresh/back navigation preserves state. Provide status tabs for all, waiting reply, following, Feishu project, resolved, closed and missing/other data. Use server pagination. The table shows date, customer, summary, feedback type, issue type, source, status, engineer and ticket ID. The drawer shows all normalized fields, source values, conclusion, people, timestamps and a collapsible raw-fields section. The only outbound action is “在飞书中查看服务表”; there is no local create/edit/delete action.

- [ ] **Step 4: Replace legacy routing and dashboard actions**

- Route `/service-records` to the new page.
- Redirect `/issues` to `/service-records`, preserving query parameters.
- Remove `IssuesView.vue` after no imports remain.
- Remove `IssueDialog` and “新建服务问题” from `DashboardView.vue`.
- Replace the dashboard's local issue KPIs/list with the 2026 summary and latest service records.
- Rewrite the legacy `issue-actions.spec.ts` assertions to prove the dashboard and primary navigation no longer expose local issue creation.
- Keep the existing local `ServiceIssue` API and tables untouched for backward data safety; they are no longer surfaced in the primary UI.

- [ ] **Step 5: Run web regression tests**

```bash
npm run test --workspace=web -- ServiceRecordsView.spec.ts issue-actions.spec.ts
npm run test --workspace=web
npm run lint --workspace=web
npm run build --workspace=web
```

Expected: all web tests PASS, no rendered “新建服务问题” action remains, lint/build succeed.

- [ ] **Step 6: Commit Task 9**

```bash
git add apps/web/src/views/ServiceRecordsView.vue apps/web/src/components/service/ServiceRecordDrawer.vue apps/web/src/views/__tests__/ServiceRecordsView.spec.ts apps/web/src/router/index.ts apps/web/src/views/DashboardView.vue apps/web/src/views/IssuesView.vue apps/web/tests/issue-actions.spec.ts
git commit -m "feat(web): replace local issues with service records"
```

## Task 10: Add customer service summaries and detail history

**Files:**

- Modify: `apps/api/src/customers/customers.service.ts`
- Modify: `apps/api/src/customers/customers.service.spec.ts`
- Modify: `apps/web/src/views/CustomersView.vue`
- Create: `apps/web/src/views/CustomerDetailView.vue`
- Create: `apps/web/src/views/__tests__/CustomerDetailView.spec.ts`
- Modify: `apps/web/src/router/index.ts`

- [ ] **Step 1: Write failing backend customer-summary tests**

Verify a customer list row contains:

```ts
{
  service2026: {
    total: 18,
    open: 3,
    lastServiceAt: '2026-08-19T03:20:00.000Z'
  }
}
```

Open means `IN_PROGRESS`, `WAITING_REPLY`, `ESCALATED`, `UNKNOWN` or `OTHER`; resolved and closed are not open. Soft-deleted records do not count.

- [ ] **Step 2: Run the focused backend test and confirm RED**

```bash
npm run test --workspace=api -- customers.service.spec.ts
```

Expected: FAIL because customer service summaries are absent.

- [ ] **Step 3: Implement bounded customer summaries**

Add one batched aggregate query for the current customer page rather than N+1 queries. Extend customer detail with 2026 monthly trend and high-frequency issue types. Reuse `/api/service-records?customerId=...` for paginated history; prefer `customerId` to name matching after mirror association exists.

- [ ] **Step 4: Write and implement customer UI tests**

Test that customer rows show total/open/latest and clicking a customer routes to `/customers/:id`. The detail page shows existing customer metadata, a link to consumption analysis, service KPI chips, monthly service trend, high-frequency issue types and an embedded paginated service record list using `customerId`.

- [ ] **Step 5: Run focused and full customer tests**

```bash
npm run test --workspace=api -- customers.service.spec.ts
npm run test --workspace=web -- CustomerDetailView.spec.ts
npm run test --workspace=api
npm run test --workspace=web
```

Expected: focused and full unit suites PASS.

- [ ] **Step 6: Commit Task 10**

```bash
git add apps/api/src/customers apps/web/src/views/CustomersView.vue apps/web/src/views/CustomerDetailView.vue apps/web/src/views/__tests__/CustomerDetailView.spec.ts apps/web/src/router/index.ts
git commit -m "feat: connect customers to 2026 service history"
```

## Task 11: Add end-to-end coverage for the read-only boundary

**Files:**

- Create: `apps/api/test/service-analysis.e2e-spec.ts`
- Modify: `apps/api/test/jest-e2e.json` only if existing test discovery requires it

- [ ] **Step 1: Write failing API end-to-end scenarios**

With deterministic seeded mirror data and mocked Feishu transport, cover:

1. authenticated user reads summary, trends, distributions, records and detail;
2. all analysis endpoints reject `year=2025` and `year=2027`;
3. deleted records never appear;
4. agent and sales roles receive 403 from manual sync;
5. manager receives 202 and a concurrent request receives 409;
6. no POST/PATCH/DELETE service-record endpoint exists;
7. no response contains `FEISHU_APP_SECRET` or tenant token.

- [ ] **Step 2: Run e2e and confirm RED**

```bash
npm run test:e2e --workspace=api -- service-analysis.e2e-spec.ts
```

Expected: at least one scenario fails until the application wiring and fixtures are complete.

- [ ] **Step 3: Complete application wiring without weakening assertions**

Register missing providers/imports, add deterministic database cleanup for only the test database, and make all DTO validation errors consistent. Do not add write endpoints to satisfy tests.

- [ ] **Step 4: Run all quality gates**

```bash
npm run test --workspace=api
npm run test:e2e --workspace=api
npm run lint --workspace=api
npm run build --workspace=api
npm run test --workspace=web
npm run lint --workspace=web
npm run build --workspace=web
```

Expected: API unit/e2e and web unit suites all PASS; both lint commands exit 0; production builds succeed.

- [ ] **Step 5: Commit Task 11**

```bash
git add apps/api/test/service-analysis.e2e-spec.ts apps/api/test/jest-e2e.json
git commit -m "test: cover Feishu service analysis flow"
```

## Task 12: Configure, initialize and verify production safely

**Files:**

- Modify: `README.md`
- Modify: `docs/deployment.md` if present; otherwise create it

- [ ] **Step 1: Document server-only configuration and recovery**

Document:

- every Feishu environment variable by name, never its real value;
- required Feishu app permissions for Base record read access;
- database backup and migration command;
- initial full-year sync command through the authenticated UI/API;
- normal daily schedule at 02:00 Asia/Shanghai;
- how to inspect `ServiceSyncRun`, retry recent sync, and run a full-year repair;
- why the URL `view_id` is intentionally not used;
- secret rotation procedure because credentials were previously shared in conversation.

- [ ] **Step 2: Commit documentation**

```bash
git add README.md docs/deployment.md
git commit -m "docs: add Feishu sync operations guide"
```

- [ ] **Step 3: Push only after explicit publication authorization**

```bash
git status --short
git log --oneline --decorate -12
git push origin HEAD:main
```

Expected: clean worktree and GitHub `main` contains the reviewed commits. If publication authorization is not active, stop before `git push` and report the exact pending commit range.

- [ ] **Step 4: Back up and deploy on the existing server**

Resolve and verify the explicit server path `/opt/after-sales-management`, then:

```bash
ssh -o ProxyCommand=none root@121.196.154.93 'cd /opt/after-sales-management && git status --short && mysqldump --single-transaction management > /opt/backups/management-before-feishu-service-analysis.sql'
ssh -o ProxyCommand=none root@121.196.154.93 'cd /opt/after-sales-management && git pull --ff-only origin main && npm ci && npm run prisma:migrate --workspace=api && npm run build --workspace=api && npm run build --workspace=web && systemctl restart after-sales-api'
```

Before the restart, add real Feishu values only to the server-side service environment file with restrictive permissions. Never place them in shell history, Git, browser configuration or command output. If the database name or environment-file location differs from the existing deployment, discover it from the systemd unit and `DATABASE_URL` without printing the password, then use that exact resolved name/path.

- [ ] **Step 5: Run the initial full-year synchronization**

From an authenticated ADMIN/MANAGER session, trigger `mode=full-year`. Poll `/api/service-sync/status` until `SUCCESS`. Confirm:

- fetched active 2026 count is non-zero and matches the current Feishu year filter;
- `failedCount=0`, or every mapping failure is reviewed before acceptance;
- oldest mirrored date is `>= 2026-01-01 +08:00`;
- newest mirrored date is `< 2027-01-01 +08:00`;
- older Feishu records were not imported;
- a second full-year run creates no duplicates.

- [ ] **Step 6: Verify deployed API and UI**

```bash
curl -fsS http://121.196.154.93/api/health
ssh -o ProxyCommand=none root@121.196.154.93 'systemctl is-active after-sales-api && journalctl -u after-sales-api -n 100 --no-pager'
```

Use a real browser at `http://121.196.154.93` to verify:

1. service analysis loads all KPI cards and charts;
2. KPI/chart clicks land on correctly filtered record rows;
3. record detail drawer opens and shows source/normalized values;
4. dashboard and service records have no “新建服务问题” button;
5. “打开飞书服务表” opens the configured source;
6. customer center shows 2026 total/open/latest values;
7. regular users cannot see sync buttons, managers/admins can;
8. mobile and desktop widths do not clip the navigation, filters or drawer;
9. systemd logs contain no app secret, access token or raw authorization header.

- [ ] **Step 7: Validate the next incremental run**

After one scheduled or manual recent run, confirm its range includes the agreed one-day overlap, a recently changed status is updated, records outside the range remain untouched, and a complete recent-window fetch is the only condition that can soft-delete a missing recent record.

- [ ] **Step 8: Final delivery report**

Report the Git commit range, deployed URL, migration/backup result, 2026 record count, initial and recent sync status, automated test counts, and any known data-quality warnings. Do not report credential values.
