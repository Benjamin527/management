# Consumption Operations V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a real, authenticated consumption-analysis page capped at the most recent 60 days and replace the current inert customer/issue actions with working API-backed flows.

**Architecture:** Add a focused NestJS consumption module that aggregates the existing `ConsumptionDaily` records and returns UI-ready KPIs, trends, rankings, product distribution, and anomaly signals. The Vue app consumes typed API modules, uses shared dialog components for customer and issue creation, and keeps unsupported actions visibly disabled instead of silently inert.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Vitest, NestJS, Prisma, MySQL, Jest

---

## File map

- `apps/api/src/consumption/`: query validation, aggregation service, controller, module, and unit tests.
- `apps/web/src/api/`: typed customer, issue, dashboard, and consumption requests.
- `apps/web/src/components/`: reusable customer/issue dialogs and feedback toast.
- `apps/web/src/views/ConsumptionView.vue`: the 7/30/60-day consumption workspace.
- `apps/web/src/views/{CustomersView,IssuesView,DashboardView}.vue`: real API-backed views and working actions.
- `apps/web/tests/`: API, CSV, and component interaction tests.
- `apps/web/src/style.css`: responsive analysis, dialog, loading, empty, and feedback states.

### Task 1: Consumption analysis API

**Files:**
- Create: `apps/api/src/consumption/dto/consumption-query.dto.ts`
- Create: `apps/api/src/consumption/consumption-analysis.ts`
- Create: `apps/api/src/consumption/consumption-analysis.spec.ts`
- Create: `apps/api/src/consumption/consumption.service.ts`
- Create: `apps/api/src/consumption/consumption.service.spec.ts`
- Create: `apps/api/src/consumption/consumption.controller.ts`
- Create: `apps/api/src/consumption/consumption.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] Write failing tests proving allowed periods are `7`, `30`, and `60`, trend gaps are filled by date, customer change rates are calculated, and drop/rise/silent anomalies are detected.
- [ ] Run `npm test -w apps/api -- consumption --runInBand`; expect missing-module failures.
- [ ] Implement the pure aggregation function and DTO validation, then rerun until green.
- [ ] Write a failing service test proving Prisma is queried only for the requested filters and the response is produced by the aggregator.
- [ ] Implement `GET /api/consumption/analysis?days=30&customerId=&product=` behind `JwtAuthGuard`, register the module, and rerun the tests.
- [ ] Run `npm run build -w apps/api` and commit the completed API slice.

### Task 2: Typed web data layer and CSV parser

**Files:**
- Create: `apps/web/src/api/types.ts`
- Create: `apps/web/src/api/customers.ts`
- Create: `apps/web/src/api/issues.ts`
- Create: `apps/web/src/api/dashboard.ts`
- Create: `apps/web/src/api/consumption.ts`
- Create: `apps/web/src/utils/customerCsv.ts`
- Create: `apps/web/tests/data-layer.spec.ts`
- Create: `apps/web/tests/customer-csv.spec.ts`

- [ ] Write failing request tests that assert the exact authenticated API paths and JSON bodies for list/create operations and consumption filters.
- [ ] Write failing CSV tests for Chinese/English headers, quoted cells, blank rows, and a missing customer name.
- [ ] Run `npm test -w apps/web -- --run`; expect missing-module failures.
- [ ] Implement typed request wrappers and a dependency-free CSV parser that returns validated customer drafts.
- [ ] Rerun the focused tests and commit the data layer.

### Task 3: Consumption workspace

**Files:**
- Create: `apps/web/src/views/ConsumptionView.vue`
- Create: `apps/web/tests/consumption-view.spec.ts`
- Modify: `apps/web/src/router/index.ts`
- Modify: `apps/web/src/layouts/AppLayout.vue`
- Modify: `apps/web/src/style.css`

- [ ] Write a failing component test proving 60 days is the maximum selectable period, loading/empty/error states are explicit, and changing period reloads the API.
- [ ] Run the focused Vitest file and verify the expected failure.
- [ ] Implement the page with a 7/30/60 selector, customer/product filters, KPI strip, 60-day pulse chart, product distribution, anomaly queue, and ranked customer table.
- [ ] Enable the navigation route and add the consumption page title; keep team effectiveness disabled with its label.
- [ ] Add responsive styles, keyboard focus, and reduced-motion support; rerun the component test and web build.
- [ ] Commit the consumption page slice.

### Task 4: Working customer actions

**Files:**
- Create: `apps/web/src/components/CustomerDialog.vue`
- Create: `apps/web/src/components/CustomerImportDialog.vue`
- Create: `apps/web/src/components/AppToast.vue`
- Create: `apps/web/tests/customer-actions.spec.ts`
- Modify: `apps/web/src/views/CustomersView.vue`
- Modify: `apps/web/src/style.css`

- [ ] Write failing component tests proving “新建客户” opens a form, saves through `POST /customers`, refreshes the list, and surfaces API errors.
- [ ] Write failing tests proving CSV import previews valid rows and creates each confirmed customer while reporting partial failures.
- [ ] Implement the dialogs and toast, then replace hard-coded customers with API results, loading state, live search, empty state, and actual totals.
- [ ] Rerun the focused tests and commit the customer flow.

### Task 5: Working issue actions and real dashboard

**Files:**
- Create: `apps/web/src/components/IssueDialog.vue`
- Create: `apps/web/tests/issue-actions.spec.ts`
- Modify: `apps/web/src/views/IssuesView.vue`
- Modify: `apps/web/src/views/DashboardView.vue`
- Modify: `apps/web/src/style.css`

- [ ] Write failing tests proving both issue entry points open the same form and submit the required customer, title, description, channel, and priority fields.
- [ ] Write a failing test proving status segments filter the actual API result, including SLA overdue rows.
- [ ] Implement the shared dialog, replace the static issue queue with API data, and derive display labels/durations from backend fields.
- [ ] Load dashboard KPIs/status/risk data from `/dashboard`; wire its new-issue button to the shared form and link its consumption panel to `/consumption`.
- [ ] Rerun focused tests and commit the issue/dashboard slice.

### Task 6: Verification and delivery

**Files:**
- Modify: `README.md` only if the new endpoint or CSV format needs operator documentation.

- [ ] Run `npm test`, `npm run lint`, and `npm run build` from the repository root.
- [ ] Start the app locally and verify login, customer creation/import, issue creation/filtering, and 7/30/60-day consumption states in a real browser.
- [ ] Inspect desktop and mobile screenshots, remove any decorative element that obscures operational data, and rerun affected checks.
- [ ] Review `git diff --check`, commit remaining documentation/verification changes, and push `main` to `origin` after all checks pass.
