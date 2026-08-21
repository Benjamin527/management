# Feishu Handoff Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mirror all Feishu after-sales handoff records into MySQL, safely associate them with existing customers, and expose structured customer-list/detail experiences with protected sensitive-data access.

**Architecture:** Reuse the existing tenant-token Feishu client, but add a generic Base record reader and a separate `FeishuHandoffProfile` mirror. A daily full reconciliation maps the 20 source fields, auto-links only unique normalized customer-name matches, encrypts the deployment checklist, and exposes summary/detail/admin APIs without returning plaintext through ordinary endpoints.

**Tech Stack:** NestJS 11, Prisma 7 with MySQL, Node.js `crypto`, Jest, Vue 3, TypeScript, Vitest.

---

## File map

**Backend data and configuration**

- Modify: `apps/api/prisma/schema.prisma` — handoff profile, encrypted secret, audit and sync-run models.
- Create: `apps/api/prisma/migrations/20260821010000_feishu_handoff_profiles/migration.sql` — MySQL DDL.
- Modify: `apps/api/src/config/env.validation.ts` — handoff source and encryption configuration.
- Modify: `apps/api/src/config/env.validation.spec.ts` — validation coverage.
- Modify: `apps/api/.env.example` and `.env.example` — documented non-secret variable names.

**Feishu ingestion**

- Modify: `apps/api/src/feishu/feishu-client.service.ts` — generic paginated Base reader.
- Modify: `apps/api/src/feishu/feishu-client.service.spec.ts` — generic pagination and error tests.
- Create: `apps/api/src/handoff-sync/handoff-record.mapper.ts` — source-field normalization.
- Create: `apps/api/src/handoff-sync/handoff-record.mapper.spec.ts` — real field-shape tests.
- Create: `apps/api/src/handoff-sync/handoff-secret.service.ts` — AES-256-GCM encryption and masking.
- Create: `apps/api/src/handoff-sync/handoff-secret.service.spec.ts` — encryption and redaction tests.
- Create: `apps/api/src/handoff-sync/handoff-sync.service.ts` — full reconciliation and customer matching.
- Create: `apps/api/src/handoff-sync/handoff-sync.service.spec.ts` — idempotency, linking, deletion and failure protection.
- Create: `apps/api/src/handoff-sync/handoff-sync.controller.ts` — status/manual sync endpoints.
- Create: `apps/api/src/handoff-sync/handoff-sync.module.ts` — module wiring.
- Modify: `apps/api/src/app.module.ts` — register the module.

**Read and admin APIs**

- Create: `apps/api/src/handoff-profiles/handoff-profiles.service.ts` — unmatched, manual link and secret reveal operations.
- Create: `apps/api/src/handoff-profiles/handoff-profiles.controller.ts` — protected routes and no-cache headers.
- Create: `apps/api/src/handoff-profiles/handoff-profiles.controller.spec.ts` — role and response-header tests.
- Create: `apps/api/src/handoff-profiles/handoff-profiles.module.ts` — module wiring.
- Create: `apps/api/src/handoff-profiles/dto/link-handoff-profile.dto.ts` — validated link input.
- Create: `apps/api/src/handoff-profiles/handoff-profiles.service.spec.ts` — role-independent service behavior.
- Modify: `apps/api/src/app.module.ts` — register read/admin APIs.

**Customer API**

- Modify: `apps/api/src/customers/dto/customer-query.dto.ts` — handoff filters.
- Modify: `apps/api/src/customers/customers.service.ts` — list aggregates and detail payload.
- Modify: `apps/api/src/customers/customers.service.spec.ts` — filters, summaries and detail tests.

**Web customer experience**

- Modify: `apps/web/src/api/types.ts` — typed handoff summaries and detail.
- Modify: `apps/web/src/api/customers.ts` — handoff filters.
- Create: `apps/web/src/api/handoffProfiles.ts` — sync, unmatched, link and reveal calls.
- Modify: `apps/web/src/views/CustomersView.vue` — overview, filters, enriched rows and unmatched workflow.
- Modify: `apps/web/src/views/CustomerDetailView.vue` — grouped handoff profile.
- Create: `apps/web/src/components/customer/HandoffUnmatchedDialog.vue` — manual association.
- Create: `apps/web/src/components/customer/HandoffSecretField.vue` — administrator-only reveal UI.
- Create: `apps/web/src/views/__tests__/CustomersView.spec.ts` — list behavior.
- Modify: `apps/web/src/views/__tests__/CustomerDetailView.spec.ts` — grouped profile tests.
- Create: `apps/web/src/components/customer/__tests__/HandoffSecretField.spec.ts` — secret lifecycle test.

**Operations**

- Create: `docs/feishu-handoff-sync.md` — source, schedule, permissions, first sync and incident handling.
- Modify: `README.md` — link the runbook.

### Task 1: Add validated handoff configuration

**Files:**
- Modify: `apps/api/src/config/env.validation.ts`
- Modify: `apps/api/src/config/env.validation.spec.ts`
- Modify: `apps/api/.env.example`
- Modify: `.env.example`

- [ ] **Step 1: Write failing validation tests**

Add cases asserting that handoff sync is disabled when `FEISHU_HANDOFF_BASE_APP_TOKEN` is empty, and that enabling it requires the table ID, source URL, a five-field cron, and a 64-character hexadecimal encryption key:

```ts
it('enables handoff sync only with a complete encrypted source config', () => {
  const result = validateEnv({
    ...validEnv,
    FEISHU_APP_ID: 'cli_test',
    FEISHU_APP_SECRET: 'secret',
    FEISHU_BASE_APP_TOKEN: 'service_base',
    FEISHU_SERVICE_TABLE_ID: 'service_table',
    FEISHU_SERVICE_BASE_URL: 'https://example.feishu.cn/wiki/service',
    FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base',
    FEISHU_HANDOFF_TABLE_ID: 'handoff_table',
    FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/wiki/handoff',
    FEISHU_HANDOFF_SYNC_CRON: '30 2 * * *',
    HANDOFF_SECRET_ENCRYPTION_KEY: 'a'.repeat(64),
  });
  expect(result.FEISHU_HANDOFF_SYNC_ENABLED).toBe(true);
  expect(result.FEISHU_HANDOFF_TABLE_ID).toBe('handoff_table');
});

it('rejects a non-hex handoff encryption key', () => {
  expect(() => validateEnv({
    ...validEnv,
    FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base',
    FEISHU_HANDOFF_TABLE_ID: 'handoff_table',
    FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/wiki/handoff',
    HANDOFF_SECRET_ENCRYPTION_KEY: 'z'.repeat(64),
  })).toThrow('HANDOFF_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters');
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm run test --workspace=api -- env.validation.spec.ts`

Expected: FAIL because `FEISHU_HANDOFF_SYNC_ENABLED` and the new validation do not exist.

- [ ] **Step 3: Implement configuration validation**

Extend `AppEnvironment` with:

```ts
FEISHU_HANDOFF_SYNC_ENABLED: boolean;
FEISHU_HANDOFF_BASE_APP_TOKEN?: string;
FEISHU_HANDOFF_TABLE_ID?: string;
FEISHU_HANDOFF_BASE_URL?: string;
FEISHU_HANDOFF_SYNC_CRON?: string;
HANDOFF_SECRET_ENCRYPTION_KEY?: string;
```

Add `validateHandoffConfig()` that trims values, validates `FEISHU_HANDOFF_SYNC_CRON` with `split(/\s+/).length === 5`, and validates the key with `/^[a-f0-9]{64}$/i`. Set enabled when `FEISHU_HANDOFF_BASE_APP_TOKEN` is non-empty. Add these example values to both env examples:

```dotenv
FEISHU_HANDOFF_BASE_APP_TOKEN=
FEISHU_HANDOFF_TABLE_ID=
FEISHU_HANDOFF_BASE_URL=
FEISHU_HANDOFF_SYNC_CRON=30 2 * * *
HANDOFF_SECRET_ENCRYPTION_KEY=
```

- [ ] **Step 4: Run validation tests**

Run: `npm run test --workspace=api -- env.validation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/config apps/api/.env.example .env.example
git commit -m "feat(api): validate Feishu handoff configuration"
```

### Task 2: Add handoff persistence models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260821010000_feishu_handoff_profiles/migration.sql`

- [ ] **Step 1: Add the Prisma models before generating the migration**

Add `HandoffSyncStatus { RUNNING SUCCESS FAILED }` and the four models described below. Use `Json` for multi-value fields, `Text` for narrative fields, a unique `externalRecordId`, and indexes on customer, status, handoff time and deletion state. Add `handoffProfile FeishuHandoffProfile?` to `Customer` and audit relations to `User`.

```prisma
model FeishuHandoffProfile {
  id                       String                 @id @default(cuid())
  externalRecordId         String                 @unique
  customerId               String?                @unique
  customer                 Customer?              @relation(fields: [customerId], references: [id])
  customerName             String
  normalizedCustomerName   String
  deploymentType           String?
  deploymentChecklistMasked String?               @db.Text
  saasSites                Json?
  featureUsage             Json?
  logCollection            Json?
  logCollectionNotes       String?                @db.Text
  apmProbes                Json?
  apmNotes                 String?                @db.Text
  rumApps                  Json?
  rumNotes                 String?                @db.Text
  customFeatures           String?                @db.Text
  handoffPeople            Json?
  handoffAt                DateTime?
  handoffStatus            String?
  importantIssues          String?                @db.Text
  legacyIssues             String?                @db.Text
  communicationChannel     String?                @db.Text
  contactInfo              String?                @db.Text
  rawFieldsMasked          Json
  sourceCreatedAt          DateTime?
  sourceUpdatedAt          DateTime?
  syncedAt                 DateTime               @default(now())
  deletedAt                DateTime?
  secrets                  FeishuHandoffSecret[]
  audits                   SensitiveAccessAudit[]
  createdAt                DateTime               @default(now())
  updatedAt                DateTime               @updatedAt

  @@index([customerId, deletedAt])
  @@index([normalizedCustomerName, deletedAt])
  @@index([handoffStatus, handoffAt])
}
```

Define `FeishuHandoffSecret` with `profileId`, `fieldName`, `ciphertext`, `iv`, `authTag`, timestamps and `@@unique([profileId, fieldName])`. Define `SensitiveAccessAudit` with `profileId`, `userId`, `fieldName`, `ipAddress`, `createdAt`. Define `HandoffSyncRun` with status and read/create/update/unlinked/deleted/failed counts plus timestamps and error summary.

- [ ] **Step 2: Create and inspect the migration**

Run: `npm exec --workspace=api prisma migrate dev -- --name feishu_handoff_profiles --create-only --config prisma.config.ts`

Expected: a migration containing four `CREATE TABLE` statements, foreign keys, unique constraints and indexes; no changes to existing customer or service-record data.

- [ ] **Step 3: Generate Prisma types**

Run: `npm run prisma:generate --workspace=api`

Expected: Prisma generation completes without schema errors.

- [ ] **Step 4: Run the API build**

Run: `npm run build --workspace=api`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma apps/api/src/generated/prisma
git commit -m "feat(api): add handoff profile persistence"
```

### Task 3: Generalize the Feishu Base record reader

**Files:**
- Modify: `apps/api/src/feishu/feishu-client.service.ts`
- Modify: `apps/api/src/feishu/feishu-client.service.spec.ts`

- [ ] **Step 1: Write a failing generic-pagination test**

Add a test that calls:

```ts
await service.listAllRecords({ appToken: 'handoff-base', tableId: 'handoff-table' });
```

Mock two `records/search` responses and assert both URLs use the supplied source, the second carries `page_token=next`, and the returned array contains both records. Keep the existing `searchRecords(range)` test unchanged.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- feishu-client.service.spec.ts`

Expected: FAIL with `listAllRecords is not a function`.

- [ ] **Step 3: Add the generic method and keep the service wrapper**

Implement:

```ts
export interface FeishuBaseSource { appToken: string; tableId: string }

async listAllRecords(source: FeishuBaseSource): Promise<FeishuBaseRecord[]> {
  const records: FeishuBaseRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await this.requestRecordPage(source, pageToken);
    records.push(...(page.items ?? []));
    pageToken = page.has_more ? page.page_token : undefined;
    if (page.has_more && !pageToken) {
      throw new Error('Feishu record search returned has_more without page_token');
    }
  } while (pageToken);
  return records;
}
```

Change the private page request to receive `source`, while `searchRecords(range)` builds its source from `FEISHU_BASE_APP_TOKEN` and `FEISHU_SERVICE_TABLE_ID`, calls `listAllRecords`, then applies the existing date filter. Preserve tenant-token caching, retry and error sanitization.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=api -- feishu-client.service.spec.ts service-sync.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/feishu
git commit -m "refactor(api): support multiple Feishu Base sources"
```

### Task 4: Map all handoff fields without leaking the deployment checklist

**Files:**
- Create: `apps/api/src/handoff-sync/handoff-record.mapper.ts`
- Create: `apps/api/src/handoff-sync/handoff-record.mapper.spec.ts`

- [ ] **Step 1: Write mapper tests for real Feishu shapes**

Use a fixture containing string arrays, person arrays, rich-text object arrays, millisecond dates and links. Assert:

```ts
const mapped = mapHandoffRecord(sourceRecord);
expect(mapped.customerName).toBe('云鲸智能');
expect(mapped.normalizedCustomerName).toBe('云鲸智能');
expect(mapped.saasSites).toEqual(['杭州']);
expect(mapped.handoffPeople).toEqual(['苏桐桐']);
expect(mapped.handoffAt).toEqual(new Date(1753027200000));
expect(mapped.deploymentChecklistSecret).toContain('空间名称');
expect(mapped.profile.deploymentChecklistMasked).toBe('包含受保护的部署信息');
expect(JSON.stringify(mapped.profile.rawFieldsMasked)).not.toContain(mapped.deploymentChecklistSecret);
```

Also test empty optional fields, full-width spaces, English case folding, object links, and missing customer name throwing `客户名称 is required`.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- handoff-record.mapper.spec.ts`

Expected: FAIL because the mapper does not exist.

- [ ] **Step 3: Implement field helpers and mapper**

Export these deterministic helpers:

```ts
export function normalizeCustomerName(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join('\n');
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>;
    return valueText(item.name ?? item.text ?? item.link ?? item.url ?? '');
  }
  return '';
}
```

Return `{ profile, deploymentChecklistSecret }`. Remove `部署清单` from `rawFieldsMasked` and replace it with the same mask label. Combine the duplicate custom-feature field only when the primary field is empty. Preserve source created/updated timestamps.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=api -- handoff-record.mapper.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handoff-sync/handoff-record.mapper*
git commit -m "feat(api): normalize Feishu handoff records"
```

### Task 5: Encrypt protected handoff fields

**Files:**
- Create: `apps/api/src/handoff-sync/handoff-secret.service.ts`
- Create: `apps/api/src/handoff-sync/handoff-secret.service.spec.ts`

- [ ] **Step 1: Write failing round-trip and tamper tests**

Assert that encryption returns different ciphertext for the same plaintext, decryption restores Unicode text, ciphertext does not contain plaintext, and a changed auth tag throws. Also assert empty input returns `null` and never creates an encrypted row.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- handoff-secret.service.spec.ts`

Expected: FAIL because `HandoffSecretService` does not exist.

- [ ] **Step 3: Implement AES-256-GCM**

Use Node `crypto` only:

```ts
const algorithm = 'aes-256-gcm';

encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, this.key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}
```

Read the key with `Buffer.from(config.getOrThrow('HANDOFF_SECRET_ENCRYPTION_KEY'), 'hex')`. Decrypt with `createDecipheriv`, set the auth tag before `final()`, and never include plaintext or key material in error messages.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=api -- handoff-secret.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handoff-sync/handoff-secret.service*
git commit -m "feat(api): encrypt protected handoff fields"
```

### Task 6: Implement idempotent daily handoff reconciliation

**Files:**
- Create: `apps/api/src/handoff-sync/handoff-sync.service.ts`
- Create: `apps/api/src/handoff-sync/handoff-sync.service.spec.ts`
- Create: `apps/api/src/handoff-sync/handoff-sync.controller.ts`
- Create: `apps/api/src/handoff-sync/handoff-sync.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing service tests**

Mock Prisma, Feishu and encryption services. Cover:

1. 39 records are read and upserted by external ID.
2. A unique normalized customer name links automatically.
3. Zero or multiple matches leave `customerId` null.
4. An existing manual link is preserved.
5. A successful complete fetch soft-deletes local records absent from Feishu.
6. A failed fetch performs no soft deletion.
7. Deployment checklist plaintext is written only to `feishuHandoffSecret`, never the profile.
8. A concurrent run throws `ConflictException`.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- handoff-sync.service.spec.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the reconciliation service**

Use `listAllRecords` with the handoff source config, create a `RUNNING` row, map each source record, resolve customer candidates by normalized names, and persist profile plus encrypted secret in a Prisma transaction. Mark missing external IDs deleted only after the full fetch and loop complete. Finalize the run as `SUCCESS`; on outer failure update it to `FAILED`, set a sanitized summary, and rethrow.

Schedule:

```ts
@Cron(process.env.FEISHU_HANDOFF_SYNC_CRON || '30 2 * * *', {
  timeZone: 'Asia/Shanghai',
})
async runScheduledSync() {
  if (!this.enabled) return;
  try { await this.run(); }
  catch (error) { this.logger.error(`Scheduled handoff sync failed: ${this.errorMessage(error)}`); }
}
```

On module initialization, mark stale `RUNNING` rows failed. The controller exposes `GET /handoff-sync/status` to all authenticated users and `POST /handoff-sync/run` to `ADMIN` and `MANAGER`, returning HTTP 202 immediately.

- [ ] **Step 4: Run focused tests and build**

Run: `npm run test --workspace=api -- handoff-sync.service.spec.ts && npm run build --workspace=api`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handoff-sync apps/api/src/app.module.ts
git commit -m "feat(api): synchronize Feishu handoff profiles"
```

### Task 7: Add unmatched linking and audited secret reveal APIs

**Files:**
- Create: `apps/api/src/handoff-profiles/dto/link-handoff-profile.dto.ts`
- Create: `apps/api/src/handoff-profiles/handoff-profiles.service.ts`
- Create: `apps/api/src/handoff-profiles/handoff-profiles.controller.ts`
- Create: `apps/api/src/handoff-profiles/handoff-profiles.module.ts`
- Create: `apps/api/src/handoff-profiles/handoff-profiles.service.spec.ts`
- Create: `apps/api/src/handoff-profiles/handoff-profiles.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write failing service and controller tests**

Assert unmatched records exclude deleted and already linked profiles; manual linking rejects missing/deleted customers; reveal decrypts one named secret, creates an audit row, and never returns ciphertext. Add controller tests proving `MANAGER` may link but only `ADMIN` may reveal.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- handoff-profiles.service.spec.ts handoff-profiles.controller.spec.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement protected operations**

Validate link input with:

```ts
export class LinkHandoffProfileDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;
}
```

Implement routes:

```ts
@Get('unmatched') // ADMIN, MANAGER
@Patch(':id/link') // ADMIN, MANAGER
@Post(':id/secrets/:field/reveal') // ADMIN only
```

For reveal, accept only an allowlist containing `deploymentChecklist`, set `Cache-Control: no-store, private`, `Pragma: no-cache`, and call a service method that decrypts then writes `SensitiveAccessAudit` with user ID, profile ID, field and request IP.

- [ ] **Step 4: Run tests and build**

Run: `npm run test --workspace=api -- handoff-profiles && npm run build --workspace=api`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/handoff-profiles apps/api/src/app.module.ts
git commit -m "feat(api): manage handoff links and protected fields"
```

### Task 8: Enrich customer list and detail APIs

**Files:**
- Modify: `apps/api/src/customers/dto/customer-query.dto.ts`
- Modify: `apps/api/src/customers/customers.service.ts`
- Modify: `apps/api/src/customers/customers.service.spec.ts`

- [ ] **Step 1: Add failing customer-query tests**

Test `handoffState=HANDED_OVER`, `handoffState=PENDING`, `handoffStatus=审核通过`, `deploymentType=SAAS`, and `hasLegacyIssues=true`. Assert list rows return only `handoffSummary`, while detail returns structured non-secret profile fields and never a secret relation or ciphertext.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=api -- customers.service.spec.ts`

Expected: FAIL because handoff filters and payloads do not exist.

- [ ] **Step 3: Implement filters and aggregates**

Add a DTO enum:

```ts
export enum HandoffState { ALL = 'ALL', HANDED_OVER = 'HANDED_OVER', PENDING = 'PENDING' }
```

Build the Prisma customer `where` with `handoffProfile: { is: ... }` for linked filters. Include a handoff selection limited to deployment type, people, date, status, legacy issue presence, source update and profile ID. Add top-level counts using batched `count()` calls: total customers, linked customers, pending customers, unmatched profiles and legacy-issue customers. Extend `findOne` with all non-sensitive handoff fields; do not include `secrets`, `rawFieldsMasked`, or audit rows.

- [ ] **Step 4: Run tests**

Run: `npm run test --workspace=api -- customers.service.spec.ts service-platform.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customers
git commit -m "feat(api): expose customer handoff summaries"
```

### Task 9: Build the customer-center handoff list and unmatched workflow

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/customers.ts`
- Create: `apps/web/src/api/handoffProfiles.ts`
- Modify: `apps/web/src/views/CustomersView.vue`
- Create: `apps/web/src/components/customer/HandoffUnmatchedDialog.vue`
- Create: `apps/web/src/views/__tests__/CustomersView.spec.ts`

- [ ] **Step 1: Write the failing view test**

Mock a 96-customer response with 39 linked profiles. Assert overview counts, the “已交接” filter request, deployment/status rendering, legacy issue indicator, and that opening an unmatched record permits selecting an existing customer and calls `linkHandoffProfile(profileId, customerId)`.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=web -- CustomersView.spec.ts`

Expected: FAIL because the handoff UI and types do not exist.

- [ ] **Step 3: Add exact client types and API calls**

Define:

```ts
export interface HandoffSummary {
  profileId: string;
  deploymentType: string | null;
  handoffPeople: string[];
  handoffAt: string | null;
  handoffStatus: string | null;
  hasLegacyIssues: boolean;
  legacyIssuePreview: string | null;
  sourceUpdatedAt: string | null;
}
```

Add `listUnmatchedHandoffProfiles()`, `linkHandoffProfile(profileId, customerId)`, `getHandoffSyncStatus()` and `runHandoffSync()` to `handoffProfiles.ts` using `apiRequest`.

- [ ] **Step 4: Implement the list experience**

Add overview cards and select controls for handoff state, handoff status, deployment type and legacy issues. Pass them to `listCustomers`. Replace the old table columns with customer, deployment, handoff person/time, handoff state, legacy issue and 2026 service count. Keep “新建客户”和“导入客户” functional. Open `HandoffUnmatchedDialog` from the unmatched overview count for admin/manager roles.

- [ ] **Step 5: Run the view tests and type check**

Run: `npm run test --workspace=web -- CustomersView.spec.ts && npm run lint --workspace=web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/api apps/web/src/views/CustomersView.vue apps/web/src/views/__tests__/CustomersView.spec.ts apps/web/src/components/customer/HandoffUnmatchedDialog.vue
git commit -m "feat(web): enrich customer center with handoff profiles"
```

### Task 10: Add grouped handoff detail and transient secret reveal

**Files:**
- Modify: `apps/web/src/views/CustomerDetailView.vue`
- Modify: `apps/web/src/views/__tests__/CustomerDetailView.spec.ts`
- Create: `apps/web/src/components/customer/HandoffSecretField.vue`
- Create: `apps/web/src/components/customer/__tests__/HandoffSecretField.spec.ts`

- [ ] **Step 1: Write failing detail and secret tests**

Assert detail sections render the structured source fields, arrays become chips, empty values show `未填写`, long text preserves line breaks, and links use `target="_blank" rel="noopener noreferrer"`. For secrets, assert non-admin users see only a mask, admins may reveal, and closing/unmounting clears the plaintext ref.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=web -- CustomerDetailView.spec.ts HandoffSecretField.spec.ts`

Expected: FAIL because the grouped profile and component do not exist.

- [ ] **Step 3: Implement grouped detail rendering**

Extend `CustomerDetail` with `handoffProfile`. Render sections in this order: overview, deployment, feature usage, collection/APM/RUM, custom features, important issues, legacy issues, communication/contact, then existing service insights and recent records. Use a small `TextList`-style inline rendering helper or computed arrays; do not render raw JSON.

Implement `HandoffSecretField` with local `revealed = ref<string | null>(null)`, call the reveal endpoint only on explicit click, and set `revealed.value = null` in both close and `onBeforeUnmount`.

- [ ] **Step 4: Run tests and web build**

Run: `npm run test --workspace=web -- CustomerDetailView.spec.ts HandoffSecretField.spec.ts && npm run build --workspace=web`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/views/CustomerDetailView.vue apps/web/src/views/__tests__/CustomerDetailView.spec.ts apps/web/src/components/customer
git commit -m "feat(web): show Feishu handoff customer details"
```

### Task 11: Document and verify the complete handoff flow

**Files:**
- Create: `docs/feishu-handoff-sync.md`
- Modify: `README.md`

- [ ] **Step 1: Write the runbook**

Document the exact source identifiers, app-identity requirement, environment names, 02:30 schedule, initial full sync, 39-row reconciliation check, unmatched workflow, secret-key rotation, audit checks and rollback. State explicitly that credentials belong only in `/opt/after-sales-management/.env` and must never be committed.

- [ ] **Step 2: Run the complete local verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all test suites, type checks, linters and builds pass; `git diff --check` is silent.

- [ ] **Step 3: Perform a local API smoke test**

With a local MySQL test database and non-production handoff configuration, run migrations, start the API, authenticate, trigger `POST /api/handoff-sync/run`, and verify status reaches `SUCCESS`. Confirm the ordinary customer endpoint contains no ciphertext or plaintext deployment checklist.

- [ ] **Step 4: Commit**

```bash
git add docs/feishu-handoff-sync.md README.md
git commit -m "docs: add Feishu handoff sync operations"
```

- [ ] **Step 5: Production rollout checkpoint**

Before any deployment: back up MySQL, generate a fresh 32-byte key directly on the server without printing it, add the four handoff source variables and key to the protected `.env`, deploy the migration, restart the API, run the first sync, and compare 39 source rows against created/updated/unmatched counts. Do not push or deploy if any secret appears in API responses or logs.
