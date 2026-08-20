# B2B After-Sales Core MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a working B2B after-sales platform core with authentication, customer management, service-issue workflow, and a management dashboard.

**Architecture:** Use an npm-workspaces monorepo with a Vue 3/Vite frontend and a NestJS REST API. Prisma persists business data in the existing remote MySQL instance; local Vite and production Nginx expose the API through the same `/api` path.

**Tech Stack:** Vue 3, Vite, TypeScript, Vue Router, Pinia, ECharts, NestJS, Prisma, MySQL, Vitest, Supertest, Playwright, Docker Compose, Nginx

---

## Delivery boundary

This plan delivers login, role-aware navigation, customer CRUD, the service-issue lifecycle, real dashboard KPIs, deployment, and an explicit empty state for consumption data. Consumption-source integration, imports, advanced consumption charts, team-performance reports, and Feishu synchronization will be separate follow-up plans after this core slice is accepted.

## Repository and file map

`management` becomes its own Git repository because its parent contains unrelated projects and uncommitted user work.

```text
management/
├── apps/
│   ├── api/
│   │   ├── prisma/{schema.prisma,seed.ts}
│   │   ├── src/{auth,customers,issues,dashboard,prisma}/
│   │   └── test/
│   └── web/
│       ├── src/{api,components,layouts,router,stores,views}/
│       └── tests/
├── deploy/nginx.conf
├── docs/superpowers/
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

Each API feature owns its controller, service, DTOs, and tests. Frontend views consume typed functions from `src/api` and never call `fetch` directly.

### Task 1: Initialize an isolated repository

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `README.md`
- Preserve: `docs/superpowers/specs/2026-08-20-after-sales-platform-design.md`
- Preserve: `docs/superpowers/plans/2026-08-20-after-sales-core-mvp.md`

- [ ] **Step 1: Initialize the nested repository and target remote**

```bash
git init -b main
git remote add origin https://github.com/Benjamin527/management.git
git rev-parse --show-toplevel
git remote -v
```

Expected: the repository root is `management`, and the only remote is the requested GitHub repository.

- [ ] **Step 2: Add workspace metadata**

Create root `package.json`:

```json
{
  "name": "after-sales-management",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "build": "npm run build -w apps/api && npm run build -w apps/web",
    "test": "npm run test -w apps/api && npm run test -w apps/web",
    "lint": "npm run lint -w apps/api && npm run lint -w apps/web"
  },
  "engines": { "node": ">=22" }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.*
!.env.example
playwright-report/
test-results/
*.log
.DS_Store
```

Create `.env.example`:

```dotenv
DATABASE_URL=mysql://after_sales:change-me@127.0.0.1:3306/after_sales
JWT_SECRET=replace-with-at-least-32-random-characters
COOKIE_SECURE=false
PORT=3000
API_PROXY_TARGET=http://121.196.154.93
```

- [ ] **Step 3: Add README bootstrap instructions and commit**

Document `npm install`, `.env`, migration, seed, development, testing, and Docker commands. State that secrets stay out of Git and MySQL port 3306 stays private.

```bash
git add .gitignore .env.example package.json README.md docs
git commit -m "chore: initialize after-sales workspace"
```

### Task 2: Scaffold API and web apps

**Files:**
- Create: `apps/api/**`
- Create: `apps/web/**`
- Create: `package-lock.json`
- Test: `apps/api/test/health.e2e-spec.ts`

- [ ] **Step 1: Scaffold and install dependencies**

```bash
npx @nestjs/cli new apps/api --package-manager npm --skip-git --strict
npm install -w apps/api @nestjs/config @nestjs/jwt cookie-parser class-transformer class-validator bcryptjs @prisma/client
npm install -D -w apps/api prisma tsx @types/cookie-parser supertest @types/supertest
npm create vite@latest apps/web -- --template vue-ts
npm install -w apps/web vue-router pinia echarts
npm install -D -w apps/web vitest @vue/test-utils jsdom @playwright/test
```

- [ ] **Step 2: Write the failing health test**

Create `apps/api/test/health.e2e-spec.ts`:

```ts
it('returns service status', async () => {
  await request(app.getHttpServer())
    .get('/api/health')
    .expect(200)
    .expect(({ body }) => expect(body).toEqual({ status: 'ok' }));
});
```

- [ ] **Step 3: Verify red, then implement the endpoint**

```bash
npm run test:e2e -w apps/api -- --runInBand
```

Expected: FAIL because `/api/health` is absent. Add `HealthController` returning `{ status: 'ok' }`, register it in `AppModule`, and set `app.setGlobalPrefix('api')` in production and test bootstraps.

- [ ] **Step 4: Verify green and commit**

```bash
npm run test:e2e -w apps/api -- --runInBand
npm run build
git add apps package-lock.json
git commit -m "chore: scaffold web and API applications"
```

Expected: health test and both builds pass.

### Task 3: Add MySQL schema and seed

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/seed.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/config/env.validation.ts`
- Test: `apps/api/src/config/env.validation.spec.ts`

- [ ] **Step 1: Write and run failing environment tests**

```ts
expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow();
expect(validateEnv({
  DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
  JWT_SECRET: '12345678901234567890123456789012',
  PORT: '3000',
})).toMatchObject({ PORT: 3000 });
```

```bash
npm test -w apps/api -- env.validation.spec.ts --runInBand
```

Expected: FAIL because `validateEnv` is missing.

- [ ] **Step 2: Implement environment validation**

Require a MySQL `DATABASE_URL`, minimum 32-character `JWT_SECRET`, numeric `PORT`, and boolean `COOKIE_SECURE`. Register it through `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`.

- [ ] **Step 3: Define the Prisma models**

Define `User`, `Customer`, `ServiceIssue`, `IssueActivity`, and `ConsumptionDaily`, plus enums for role, customer status, issue status, priority, and channel. Required constraints include unique customer name, unique service number, unique `[externalSource, externalId]`, indexes on owner/status and assignee/status, timestamps, and soft deletion.

The central relations are:

```prisma
model Customer {
  id           String          @id @default(cuid())
  name         String          @unique
  industry     String?
  level        String?
  status       CustomerStatus  @default(ACTIVE)
  ownerId      String?
  owner        User?           @relation("CustomerOwner", fields: [ownerId], references: [id])
  issues       ServiceIssue[]
  consumptions ConsumptionDaily[]
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  deletedAt    DateTime?
  @@index([ownerId, status])
}
```

- [ ] **Step 4: Add Prisma service, admin seed, validate, and commit**

Seed one administrator from `ADMIN_EMAIL` and `ADMIN_PASSWORD`; hash with `bcryptjs` and fail clearly when credentials are missing.

```bash
npx prisma format --schema apps/api/prisma/schema.prisma
npx prisma validate --schema apps/api/prisma/schema.prisma
npm test -w apps/api -- env.validation.spec.ts --runInBand
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
git add apps/api
git commit -m "feat: add MySQL schema and database foundation"
```

### Task 4: Implement secure authentication

**Files:**
- Create: `apps/api/src/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,jwt-auth.guard.ts,current-user.decorator.ts}`
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`

- [ ] **Step 1: Write and run failing authentication tests**

Cover valid and invalid credentials, `HttpOnly` cookie creation, `/api/auth/me`, logout cookie removal, and unauthenticated rejection.

```ts
await request(app.getHttpServer())
  .post('/api/auth/login')
  .send({ email: 'admin@example.com', password: 'correct-password' })
  .expect(200)
  .expect('set-cookie', /access_token=.*HttpOnly/);
```

```bash
npm test -w apps/api -- auth.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand auth.e2e-spec.ts
```

Expected: FAIL because the auth module is absent.

- [ ] **Step 2: Implement authentication and verify**

Verify passwords with `bcryptjs`; sign JWT claims `sub`, `email`, and `role`; store the token in an `HttpOnly`, `SameSite=Lax` cookie and derive `Secure` from configuration. Add login, logout, and protected current-user endpoints.

```bash
npm test -w apps/api -- auth.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand auth.e2e-spec.ts
git add apps/api/src/auth apps/api/test/auth.e2e-spec.ts
git commit -m "feat: add secure session authentication"
```

### Task 5: Implement customer management API

**Files:**
- Create: `apps/api/src/customers/{customers.module.ts,customers.controller.ts,customers.service.ts}`
- Create: `apps/api/src/customers/dto/{create-customer.dto.ts,update-customer.dto.ts,customer-query.dto.ts}`
- Test: `apps/api/src/customers/customers.service.spec.ts`
- Test: `apps/api/test/customers.e2e-spec.ts`

- [ ] **Step 1: Write and run failing customer tests**

Cover pagination, keyword and status filters, duplicate-name conflict, create, detail, update, and soft delete. Deleted customers must not appear in normal queries.

```bash
npm test -w apps/api -- customers.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand customers.e2e-spec.ts
```

- [ ] **Step 2: Implement the customer contract**

```text
GET    /api/customers?page=1&pageSize=20&keyword=&status=
POST   /api/customers
GET    /api/customers/:id
PATCH  /api/customers/:id
DELETE /api/customers/:id
```

Lists return `{ items, page, pageSize, total }`. Detail includes owner summary, open issue count, current-month consumption, and month-over-month change.

- [ ] **Step 3: Verify and commit**

```bash
npm test -w apps/api -- customers.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand customers.e2e-spec.ts
git add apps/api/src/customers apps/api/test/customers.e2e-spec.ts
git commit -m "feat: add customer management API"
```

### Task 6: Implement issue workflow and SLA

**Files:**
- Create: `apps/api/src/issues/{issues.module.ts,issues.controller.ts,issues.service.ts,issue-state-machine.ts,sla.service.ts}`
- Create: `apps/api/src/issues/dto/{create-issue.dto.ts,update-issue.dto.ts,change-status.dto.ts}`
- Test: `apps/api/src/issues/{issue-state-machine.spec.ts,sla.service.spec.ts}`
- Test: `apps/api/test/issues.e2e-spec.ts`

- [ ] **Step 1: Write failing state-machine and SLA tests**

Allow `PENDING → IN_PROGRESS`, `IN_PROGRESS → WAITING_CUSTOMER | WAITING_INTERNAL | RESOLVED`, waiting states back to `IN_PROGRESS`, and `RESOLVED → CLOSED | IN_PROGRESS`. Reject other transitions. Set SLA to critical 2 hours, high 8, medium 24, and low 72.

```ts
expect(canTransition(IssueStatus.PENDING, IssueStatus.IN_PROGRESS)).toBe(true);
expect(canTransition(IssueStatus.CLOSED, IssueStatus.IN_PROGRESS)).toBe(false);
```

```bash
npm test -w apps/api -- issue-state-machine.spec.ts sla.service.spec.ts --runInBand
```

Expected: FAIL because workflow helpers are absent.

- [ ] **Step 2: Implement the workflow API**

```text
GET   /api/issues
POST  /api/issues
GET   /api/issues/:id
PATCH /api/issues/:id
POST  /api/issues/:id/assign
POST  /api/issues/:id/status
GET   /api/issues/:id/activities
```

Every assignment and status change uses a transaction to update the issue and insert `IssueActivity`. Set first response, resolved, and closed timestamps on their first applicable transitions.

- [ ] **Step 3: Add the full-path integration test, verify, and commit**

Test `create → assign → start → waiting customer → resume → resolve → close`, invalid transitions, missing customers, duplicate service numbers, and activity ordering.

```bash
npm test -w apps/api -- issue-state-machine.spec.ts sla.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand issues.e2e-spec.ts
git add apps/api/src/issues apps/api/test/issues.e2e-spec.ts
git commit -m "feat: add service issue workflow and SLA"
```

### Task 7: Implement dashboard aggregation API

**Files:**
- Create: `apps/api/src/dashboard/{dashboard.module.ts,dashboard.controller.ts,dashboard.service.ts}`
- Test: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Test: `apps/api/test/dashboard.e2e-spec.ts`

- [ ] **Step 1: Write and run failing metric tests**

Assert customer count, open and overdue issues, resolution rate, average first-response minutes, current consumption, month-over-month change, status distribution, top assignees, and risk customers.

```bash
npm test -w apps/api -- dashboard.service.spec.ts --runInBand
```

- [ ] **Step 2: Implement `GET /api/dashboard`**

Return `kpis`, `issueStatusDistribution`, `topAssignees`, and `riskCustomers`. Return `null`, not fake zero, when consumption is not configured. Accept validated `from` and `to` dates.

- [ ] **Step 3: Verify and commit**

```bash
npm test -w apps/api -- dashboard.service.spec.ts --runInBand
npm run test:e2e -w apps/api -- --runInBand dashboard.e2e-spec.ts
git add apps/api/src/dashboard apps/api/test/dashboard.e2e-spec.ts
git commit -m "feat: add after-sales dashboard metrics"
```

### Task 8: Build authenticated frontend shell

**Files:**
- Create: `apps/web/src/api/{client.ts,auth.ts}`
- Create: `apps/web/src/stores/auth.ts`
- Create: `apps/web/src/router/index.ts`
- Create: `apps/web/src/layouts/AppLayout.vue`
- Create: `apps/web/src/views/LoginView.vue`
- Modify: `apps/web/src/{main.ts,App.vue}`
- Modify: `apps/web/vite.config.ts`
- Test: `apps/web/tests/auth.spec.ts`

- [ ] **Step 1: Write and run failing auth and route tests**

Mock `/api/auth/me`; assert authenticated entry, unauthenticated redirect, login, and logout.

```bash
npm test -w apps/web -- auth.spec.ts --run
```

- [ ] **Step 2: Implement API client, auth store, router, and shell**

Always send `credentials: 'include'`; normalize errors into `ApiError`; route confirmed 401 responses to login. Add navigation for 总览、客户 and 服务问题. Show 消费分析、团队效能 and 设置 as disabled follow-up modules, not fake working pages.

- [ ] **Step 3: Configure Vite `/api` proxy, verify, and commit**

Read `API_PROXY_TARGET` from the Vite environment and keep browser requests relative.

```bash
npm test -w apps/web -- auth.spec.ts --run
npm run build -w apps/web
git add apps/web
git commit -m "feat: add authenticated web application shell"
```

### Task 9: Build dashboard, customer, and issue screens

**Files:**
- Create: `apps/web/src/api/{dashboard.ts,customers.ts,issues.ts}`
- Create: `apps/web/src/views/{DashboardView.vue,CustomersView.vue,CustomerDetailView.vue,IssuesView.vue,IssueDetailView.vue}`
- Create: `apps/web/src/components/{KpiCard.vue,StatusBadge.vue,EmptyState.vue}`
- Test: `apps/web/tests/{dashboard.spec.ts,customers.spec.ts,issues.spec.ts}`

- [ ] **Step 1: Write dashboard tests, then implement dashboard states**

Cover loading, error, missing consumption source, KPI, status distribution, top assignee, and risk customer states. KPI interactions must navigate to filtered details.

- [ ] **Step 2: Write customer tests, then implement customer pages**

Cover keyword debounce, status filter, pagination, create validation, edit, empty state, and retry. Display owner, consumption change, open issues, and status.

- [ ] **Step 3: Write issue tests, then implement issue pages**

Cover filters, creation, assignment, allowed transitions, invalid-transition display, activity order, and overdue badges. Preserve filters in URL query strings and use only transitions supplied or accepted by the API.

- [ ] **Step 4: Verify all frontend behavior and commit**

```bash
npm test -w apps/web -- --run
npm run build -w apps/web
git add apps/web/src apps/web/tests
git commit -m "feat: add dashboard customer and issue experiences"
```

### Task 10: Add containers and end-to-end verification

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `docker-compose.yml`
- Create: `deploy/nginx.conf`
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/core-flow.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing Playwright core-flow test**

Test login, customer creation, issue creation, start, resolve, and changed dashboard metrics using stable accessible names.

- [ ] **Step 2: Add production containers and routing**

Use multi-stage images. API startup runs `prisma migrate deploy`; Nginx routes `/api/` to NestJS and other paths to the SPA. Put API and MySQL on an internal network, publish only 80/443, and add API/MySQL health checks.

- [ ] **Step 3: Run complete verification**

```bash
npm run lint
npm test
npm run build
docker compose config
docker compose up -d --build
npm run test:e2e -w apps/web
docker compose ps
```

Expected: all commands pass and all containers are healthy.

- [ ] **Step 4: Document operations and commit**

Document server environment creation, migration, seed, start, stop, health check, log inspection, daily MySQL backup, and rollback. State that only 80/443 are public and 3306 is private.

```bash
git add apps docker-compose.yml deploy README.md
git commit -m "chore: add production deployment and end-to-end checks"
```

### Task 11: Publish the verified repository

**Files:**
- Verify only

- [ ] **Step 1: Verify scope, remote, and secret hygiene**

```bash
git status --short
git rev-parse --show-toplevel
git remote -v
git grep -nE '(DATABASE_URL=.*@|JWT_SECRET=.{32,})' -- ':!docs/**' || true
```

Expected: clean status, `management` root, requested remote, and no real credentials.

- [ ] **Step 2: Re-run clean verification**

```bash
npm ci
npm run lint
npm test
npm run build
docker compose config
```

Expected: every command exits with code 0.

- [ ] **Step 3: Push and compare hashes**

```bash
git push -u origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

Expected: GitHub reports `main -> main`, and local and remote commit hashes match.
