# App Shell Scroll and Overlay Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the desktop application shell fixed to the viewport, scroll only the customer book inside its card, and make every dialog, drawer and toast render reliably relative to the viewport.

**Architecture:** Constrain the desktop app shell with a flex-based viewport layout and give route views explicit internal overflow boundaries. Move fixed overlays out of the animated `.page-stack` containing block with Vue Teleport, while a shared composable handles Escape, body locking and focus restoration.

**Tech Stack:** Vue 3, Vue Router, TypeScript, CSS, Vitest, Vue Test Utils, Playwright.

---

## Root cause already established

- `.app-shell` uses `min-height: 100vh`, so the 100-row customer table expands `body` and produces browser-page scrolling.
- `.app-shell > main` has no fixed height or internal overflow boundary.
- dialogs, the service-record drawer and Toast are descendants of `.page-stack`.
- `.page-stack` has a retained transform animation; transformed ancestors can become containing blocks for `position: fixed`, causing overlays to be positioned relative to the long route content.
- the customer table has horizontal overflow handling only in the small-screen media query and has no vertical scroll container or sticky header.

## File map

- Modify: `apps/web/src/layouts/AppLayout.vue` — expose a stable route-content flex region and use the real current date.
- Create: `apps/web/src/layouts/__tests__/AppLayout.spec.ts` — stable layout contract.
- Modify: `apps/web/src/style.css` — fixed desktop shell, route overflow defaults, mobile restoration and overlay behavior.
- Modify: `apps/web/src/views/CustomersView.vue` — customer-specific no-page-scroll boundary and internal table scroller.
- Create: `apps/web/src/composables/useOverlayLayer.ts` — body lock, Escape handling and focus restoration.
- Create: `apps/web/src/composables/__tests__/useOverlayLayer.spec.ts` — shared behavior tests.
- Modify: `apps/web/src/components/CustomerDialog.vue` — Teleport and shared overlay behavior.
- Modify: `apps/web/src/components/CustomerImportDialog.vue` — Teleport and shared overlay behavior.
- Modify: `apps/web/src/components/IssueDialog.vue` — Teleport and shared overlay behavior.
- Modify: `apps/web/src/components/service/ServiceRecordDrawer.vue` — Teleport and shared overlay behavior.
- Modify: `apps/web/src/components/AppToast.vue` — Teleport to body.
- Create: `apps/web/src/components/__tests__/OverlayPlacement.spec.ts` — regression tests for all overlays.
- Create: `apps/web/e2e/layout.spec.ts` — real-browser scrolling and modal-location acceptance checks.
- Create: `apps/web/playwright.config.ts` — deterministic Vite test server and browser projects.

### Task 1: Capture overlay regressions in component tests

**Files:**
- Create: `apps/web/src/components/__tests__/OverlayPlacement.spec.ts`

- [ ] **Step 1: Write failing Teleport placement tests**

Mount each open overlay with `attachTo: document.body`, then assert the overlay is a direct descendant of `body`, not the component wrapper:

```ts
const wrapper = mount(CustomerDialog, {
  attachTo: document.body,
  props: { open: true },
});
expect(document.body.querySelector(':scope > .dialog-backdrop')).not.toBeNull();
expect(wrapper.element.querySelector('.dialog-backdrop')).toBeNull();
wrapper.unmount();
```

Repeat for `CustomerImportDialog`, `IssueDialog`, `ServiceRecordDrawer` and `AppToast`. Stub API calls used by the mounted components; clear `document.body.innerHTML` after each test.

- [ ] **Step 2: Run and verify failure**

Run: `npm run test --workspace=web -- OverlayPlacement.spec.ts`

Expected: FAIL because overlays still render inside the component subtree.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/web/src/components/__tests__/OverlayPlacement.spec.ts
git commit -m "test(web): capture overlay containing-block regression"
```

### Task 2: Add a shared overlay lifecycle composable

**Files:**
- Create: `apps/web/src/composables/useOverlayLayer.ts`
- Create: `apps/web/src/composables/__tests__/useOverlayLayer.spec.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Test that opening an overlay stores the active element, adds `overlay-open` to `body`, and installs Escape handling; closing removes the class only after the final overlay closes and restores focus. Test two simultaneous overlays to ensure one closing does not unlock the body.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=web -- useOverlayLayer.spec.ts`

Expected: FAIL because the composable does not exist.

- [ ] **Step 3: Implement reference-counted overlay lifecycle**

Create a module-level counter and previous overflow state:

```ts
let openLayers = 0;
let previousOverflow = '';

export function useOverlayLayer(open: Ref<boolean>, close: () => void) {
  let restoreTarget: HTMLElement | null = null;
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open.value) close();
  };

  watch(open, (value) => {
    if (value) {
      restoreTarget = document.activeElement as HTMLElement | null;
      if (openLayers++ === 0) {
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.body.classList.add('overlay-open');
      }
      window.addEventListener('keydown', onKeydown);
    } else {
      release();
      nextTick(() => restoreTarget?.focus());
    }
  }, { immediate: true });

  onBeforeUnmount(release);
}
```

Implement `release()` idempotently per composable instance, remove the listener, decrement without going below zero, and restore the exact previous body overflow when the count reaches zero.

- [ ] **Step 4: Run composable tests**

Run: `npm run test --workspace=web -- useOverlayLayer.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/composables
git commit -m "feat(web): centralize overlay lifecycle"
```

### Task 3: Teleport dialogs, drawer and Toast to body

**Files:**
- Modify: `apps/web/src/components/CustomerDialog.vue`
- Modify: `apps/web/src/components/CustomerImportDialog.vue`
- Modify: `apps/web/src/components/IssueDialog.vue`
- Modify: `apps/web/src/components/service/ServiceRecordDrawer.vue`
- Modify: `apps/web/src/components/AppToast.vue`
- Modify: `apps/web/src/style.css`

- [ ] **Step 1: Wrap every fixed layer in Teleport**

For dialogs and drawer, keep the existing `v-if` and markup but move them under:

```vue
<Teleport to="body">
  <div v-if="open" class="dialog-backdrop" @click.self="emit('close')">
    <!-- existing dialog card -->
  </div>
</Teleport>
```

Use the same structure with `.record-drawer-backdrop`. For Toast:

```vue
<Teleport to="body">
  <Transition name="toast">
    <div v-if="message" :class="['app-toast', `tone-${tone || 'success'}`]" role="status">...</div>
  </Transition>
</Teleport>
```

- [ ] **Step 2: Connect lifecycle behavior**

In the four modal/drawer components, create `const emit = defineEmits(...)` if it is not already assigned, then call:

```ts
useOverlayLayer(toRef(props, 'open'), () => emit('close'));
```

Do not body-lock Toast because it is non-modal. Add `overscroll-behavior: contain` to `.dialog-card` and `.record-drawer`.

- [ ] **Step 3: Run overlay regression tests**

Run: `npm run test --workspace=web -- OverlayPlacement.spec.ts useOverlayLayer.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run all existing component tests**

Run: `npm run test --workspace=web`

Expected: PASS with no Teleport nodes left in `document.body` after unmount.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components apps/web/src/style.css
git commit -m "fix(web): anchor overlays to the viewport"
```

### Task 4: Constrain the desktop application shell

**Files:**
- Modify: `apps/web/src/layouts/AppLayout.vue`
- Modify: `apps/web/src/style.css`
- Create: `apps/web/src/layouts/__tests__/AppLayout.spec.ts`

- [ ] **Step 1: Add a layout contract test**

Create or extend an AppLayout test that mounts the layout and asserts the main element has the `.app-main` class and the topbar has `.app-topbar`. This provides stable selectors for the browser test and prevents accidental layout markup removal.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=web -- AppLayout.spec.ts`

Expected: FAIL because the classes do not exist.

- [ ] **Step 3: Add stable classes and a real date**

In `AppLayout.vue`, add `.app-main` and `.app-topbar`. Replace the hard-coded `2026 · 08 · 20` with a computed Asia/Shanghai display generated from `new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })`, formatted with ` · `.

- [ ] **Step 4: Implement the desktop overflow hierarchy**

Add desktop rules:

```css
html,body,#app{height:100%;overflow:hidden}
.app-shell{height:100dvh;min-height:0;overflow:hidden}
.app-main{height:100dvh;min-width:0;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.app-topbar{flex:0 0 108px}
.app-main>.page-stack{flex:1;min-height:0;overflow:auto;padding-bottom:48px}
```

Remove bottom padding from `.app-shell > main` and move it to route content so the available-height calculation remains correct. Preserve the existing horizontal padding and topbar spacing.

- [ ] **Step 5: Restore natural flow on mobile**

Inside `@media(max-width:680px)`, set:

```css
html,body,#app{height:auto;overflow:visible}
.app-shell,.app-main{height:auto;min-height:100vh;overflow:visible}
.app-main>.page-stack{overflow:visible;padding-bottom:28px}
```

This avoids nested vertical scroll areas on touch screens.

- [ ] **Step 6: Run tests and type check**

Run: `npm run test --workspace=web -- AppLayout.spec.ts && npm run lint --workspace=web`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layouts/AppLayout.vue apps/web/src/style.css apps/web/src/layouts/__tests__/AppLayout.spec.ts
git commit -m "fix(web): constrain the desktop application shell"
```

### Task 5: Make only the enterprise customer book scroll

**Files:**
- Modify: `apps/web/src/views/CustomersView.vue`
- Modify: `apps/web/src/views/__tests__/CustomersView.spec.ts`

- [ ] **Step 1: Add failing structural assertions**

Assert the page has `customer-page`, the card has `customer-book-panel`, and table rows are wrapped by `customer-book-scroll`. Assert the header is outside the scroller while `.customer-table` is inside it.

- [ ] **Step 2: Verify failure**

Run: `npm run test --workspace=web -- CustomersView.spec.ts`

Expected: FAIL because the scroll boundary does not exist.

- [ ] **Step 3: Add the internal scroller markup**

Use:

```vue
<section class="page-stack customer-page">
  <div class="page-actions customer-actions">...</div>
  <article class="panel table-panel customer-book-panel">
    <header>...</header>
    <div class="customer-book-scroll">
      <!-- loading/error/empty state or customer table -->
    </div>
  </article>
</section>
```

- [ ] **Step 4: Add scoped layout rules**

```css
.customer-page{overflow:hidden!important}
.customer-book-panel{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.customer-book-scroll{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}
.customer-service-table .table-head{position:sticky;top:0;z-index:2;background:#fff}
```

Keep `min-width` on the table itself for narrow screens so horizontal overflow stays inside `.customer-book-scroll`. In the mobile media query, set `.customer-page{overflow:visible!important}` and `.customer-book-panel{overflow:visible}` while `.customer-book-scroll{overflow-x:auto;overflow-y:visible}`.

- [ ] **Step 5: Run tests and build**

Run: `npm run test --workspace=web -- CustomersView.spec.ts && npm run build --workspace=web`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/views/CustomersView.vue apps/web/src/views/__tests__/CustomersView.spec.ts
git commit -m "fix(web): scroll only the enterprise customer book"
```

### Task 6: Verify scrolling and overlays in a real browser

**Files:**
- Create: `apps/web/e2e/layout.spec.ts`
- Create: `apps/web/playwright.config.ts`

- [ ] **Step 1: Create deterministic Playwright configuration**

Create `apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: {
    command: 'VITE_DEMO_MODE=true npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
});
```

In `layout.spec.ts`, intercept `**/api/customers*` before navigation and return 100 deterministic customer objects, including the required handoff summary and service fields. Intercept any service-record endpoints used by the drawer test. Demo mode supplies the authenticated user, so no database or production cookie is required.

- [ ] **Step 2: Write the desktop acceptance test**

At a 1440×900 viewport, assert:

```ts
await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
const scroller = page.locator('.customer-book-scroll');
await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
expect(await page.evaluate(() => window.scrollY)).toBe(0);
```

Record the topbar and action-area bounding boxes before and after scrolling and assert their `y` positions are unchanged.

- [ ] **Step 3: Write the modal and drawer acceptance test**

After scrolling the customer book to the bottom, click “新建客户”, read `.dialog-card` bounding box and assert its center is within 3 pixels of the viewport center. Repeat for “导入客户”. Navigate to service records, open a drawer after scrolling its list, and assert the drawer top is 0 and height equals the viewport.

- [ ] **Step 4: Write the mobile regression test**

At 390×844, assert the document may scroll naturally, the customer table scrolls horizontally inside its card, and no fixed-height nested vertical customer scroller traps touch navigation.

- [ ] **Step 5: Run browser tests**

Run: `npm exec --workspace=web -- playwright test e2e/layout.spec.ts`

Expected: all desktop and mobile layout tests PASS.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all commands pass and `git diff --check` is silent.

- [ ] **Step 7: Commit**

```bash
git add apps/web/e2e/layout.spec.ts apps/web/playwright.config.ts
git commit -m "test(web): verify viewport scrolling and overlays"
```

### Task 7: Production visual checkpoint

**Files:** None.

- [ ] **Step 1: Verify the customer center at the reported desktop size**

Use a viewport matching the supplied screenshot’s wide desktop proportions. Confirm the browser scrollbar is absent, the left rail and topbar remain stationary, and only the enterprise customer book shows a vertical scrollbar.

- [ ] **Step 2: Verify every fixed layer**

Open new customer, customer import, service issue, service-record drawer and a Toast after moving their underlying content to its maximum scroll position. Confirm each layer stays relative to the current viewport.

- [ ] **Step 3: Verify keyboard and focus behavior**

For each modal/drawer, open it from a button, press Escape, and confirm focus returns to that button. Confirm background scrolling is locked while modal and drawer layers are open.

- [ ] **Step 4: Capture before/after screenshots for release evidence**

Store screenshots outside Git build output and compare the customer center at top and bottom scroll positions. Do not include any revealed sensitive handoff field in screenshots.
