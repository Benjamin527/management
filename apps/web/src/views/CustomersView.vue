<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { listCustomers } from "../api/customers";
import { getHandoffSyncStatus, runHandoffSync } from "../api/handoffProfiles";
import type {
  Customer,
  CustomerStatus,
  HandoffState,
  HandoffSyncStatus,
} from "../api/types";
import AppToast from "../components/AppToast.vue";
import CustomerDialog from "../components/CustomerDialog.vue";
import CustomerImportDialog from "../components/CustomerImportDialog.vue";
import HandoffUnmatchedDialog from "../components/customer/HandoffUnmatchedDialog.vue";
import StatusBadge from "../components/StatusBadge.vue";
import { useAuthStore } from "../stores/auth";

const statusLabels: Record<CustomerStatus, string> = {
  ONBOARDING: "交接中",
  ACTIVE: "服务中",
  AT_RISK: "风险",
  PAUSED: "暂停",
  ENDED: "已结束",
};
const auth = (() => {
  try {
    return useAuthStore();
  } catch {
    return { user: null };
  }
})();
const keyword = ref("");
const handoffState = ref<HandoffState>("ALL");
const handoffStatus = ref("");
const deploymentType = ref("");
const legacyOnly = ref(false);
const customers = ref<Customer[]>([]);
const total = ref(0);
const overview = ref({
  customerTotal: 0,
  handedOver: 0,
  pending: 0,
  unmatched: 0,
  legacyIssues: 0,
});
const loading = ref(true);
const error = ref("");
const customerDialogOpen = ref(false);
const importDialogOpen = ref(false);
const unmatchedDialogOpen = ref(false);
const syncing = ref(false);
const syncStatus = ref<HandoffSyncStatus | null>(null);
const toast = ref({ message: "", tone: "success" as "success" | "error" });
let searchTimer: ReturnType<typeof setTimeout> | undefined;

const canManageHandoff = computed(() =>
  ["ADMIN", "MANAGER"].includes(auth.user?.role || ""),
);

function notify(message: string, tone: "success" | "error" = "success") {
  toast.value = { message, tone };
  window.setTimeout(() => {
    if (toast.value.message === message) toast.value.message = "";
  }, 3200);
}

function compactPeople(people: string[]) {
  if (!people.length) return "未填写";
  return people.length > 2
    ? `${people.slice(0, 2).join("、")} +${people.length - 2}`
    : people.join("、");
}

function syncTime(value: string | null | undefined) {
  if (!value) return "尚未同步";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const result = await listCustomers({
      keyword: keyword.value.trim() || undefined,
      handoffState: handoffState.value,
      handoffStatus: handoffStatus.value || undefined,
      deploymentType: deploymentType.value || undefined,
      hasLegacyIssues: legacyOnly.value || undefined,
      pageSize: 100,
    });
    customers.value = result.items;
    total.value = result.total;
    overview.value = result.handoffOverview ?? {
      customerTotal: result.total,
      handedOver: 0,
      pending: result.total,
      unmatched: 0,
      legacyIssues: 0,
    };
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "客户列表加载失败";
  } finally {
    loading.value = false;
  }
}

async function loadSyncStatus() {
  if (!canManageHandoff.value) return;
  try {
    syncStatus.value = await getHandoffSyncStatus();
  } catch {
    syncStatus.value = null;
  }
}

async function startSync() {
  syncing.value = true;
  try {
    await runHandoffSync();
    notify("飞书交接档案同步已进入后台队列");
    await loadSyncStatus();
  } catch (reason) {
    notify(reason instanceof Error ? reason.message : "同步启动失败", "error");
  } finally {
    syncing.value = false;
  }
}

function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(load, 260);
}

function useMetric(filter: HandoffState | "LEGACY") {
  if (filter === "LEGACY") {
    legacyOnly.value = true;
    handoffState.value = "ALL";
    return;
  }
  legacyOnly.value = false;
  handoffState.value = filter;
}

async function customerSaved() {
  customerDialogOpen.value = false;
  notify("客户档案已创建");
  await load();
}

async function importCompleted(result: { success: number; failed: number }) {
  importDialogOpen.value = false;
  notify(
    result.failed
      ? `已导入 ${result.success} 家，${result.failed} 家失败`
      : `已导入 ${result.success} 家客户`,
    result.failed ? "error" : "success",
  );
  await load();
}

async function handoffLinked() {
  notify("交接档案已关联到客户");
  await load();
}

watch([handoffState, handoffStatus, deploymentType, legacyOnly], load);
onMounted(() => {
  void load();
  void loadSyncStatus();
});
</script>

<template>
  <section class="page-stack customer-page">
    <div class="handoff-pulse" aria-label="客户交接概览">
      <button
        data-metric="customer-total"
        :class="{ active: handoffState === 'ALL' && !legacyOnly }"
        @click="useMetric('ALL')"
      >
        <span>客户总数</span><strong>{{ overview.customerTotal }}</strong
        ><small>ENTERPRISE</small>
      </button>
      <button
        data-metric="handed-over"
        :class="{ active: handoffState === 'HANDED_OVER' }"
        @click="useMetric('HANDED_OVER')"
      >
        <span>已完成交接</span><strong>{{ overview.handedOver }}</strong
        ><small>HANDED OVER</small>
      </button>
      <button
        data-metric="pending"
        :class="{ active: handoffState === 'PENDING' }"
        @click="useMetric('PENDING')"
      >
        <span>待补交接</span><strong>{{ overview.pending }}</strong
        ><small>PENDING</small>
      </button>
      <button
        data-metric="unmatched"
        data-action="open-unmatched"
        :disabled="!canManageHandoff"
        @click="unmatchedDialogOpen = true"
      >
        <span>待人工关联</span><strong>{{ overview.unmatched }}</strong
        ><small>MATCH QUEUE</small>
      </button>
      <button
        data-metric="legacy"
        :class="{ active: legacyOnly }"
        @click="useMetric('LEGACY')"
      >
        <span>有遗留问题</span><strong>{{ overview.legacyIssues }}</strong
        ><small>LEGACY</small>
      </button>
    </div>

    <div class="page-actions customer-actions">
      <div class="search-box">
        ⌕<input
          v-model="keyword"
          placeholder="搜索客户名称"
          @input="scheduleSearch"
          @keyup.enter="load"
        />
      </div>
      <div>
        <button
          class="ghost-button"
          data-action="import-customer"
          @click="importDialogOpen = true"
        >
          导入客户
        </button>
        <button
          class="primary-button"
          data-action="new-customer"
          @click="customerDialogOpen = true"
        >
          新建客户
        </button>
      </div>
    </div>

    <article class="panel table-panel customer-book-panel">
      <header class="customer-book-heading">
        <div>
          <small>CUSTOMER HANDOFF BOOK</small>
          <h2>企业客户档案</h2>
        </div>
        <div v-if="canManageHandoff" class="handoff-sync">
          <span
            >最近同步
            {{ syncTime(syncStatus?.lastSuccessfulRun?.finishedAt) }}</span
          >
          <a
            v-if="syncStatus?.sourceUrl"
            :href="syncStatus.sourceUrl"
            target="_blank"
            rel="noreferrer"
            >查看源表</a
          >
          <button
            class="ghost-button"
            :disabled="syncing || syncStatus?.running"
            @click="startSync"
          >
            {{ syncing || syncStatus?.running ? "同步中…" : "立即同步" }}
          </button>
        </div>
        <span v-else>{{ total }} 家客户</span>
      </header>

      <div class="handoff-filters">
        <label
          >交接状态
          <select v-model="handoffState" data-filter="handoff-state">
            <option value="ALL">全部客户</option>
            <option value="HANDED_OVER">已完成交接</option>
            <option value="PENDING">待补交接</option>
          </select>
        </label>
        <label
          >部署方式
          <select v-model="deploymentType" data-filter="deployment-type">
            <option value="">全部</option>
            <option value="SAAS">SAAS</option>
            <option value="私有部署">私有部署</option>
          </select>
        </label>
        <label
          >飞书交接状态<input
            v-model="handoffStatus"
            data-filter="handoff-status"
            placeholder="如：审核通过"
        /></label>
        <label class="legacy-filter"
          ><input v-model="legacyOnly" type="checkbox" />只看有遗留问题</label
        >
        <span>{{ total }} 家符合条件</span>
      </div>

      <div v-if="loading" class="table-state">正在读取客户档案…</div>
      <div v-else-if="error" class="table-state error-state">
        <strong>客户列表加载失败</strong>
        <p>{{ error }}</p>
        <button class="ghost-button" @click="load">重新加载</button>
      </div>
      <div v-else-if="!customers.length" class="table-state">
        <strong>{{
          keyword ? "没有匹配的客户" : "当前筛选下没有客户档案"
        }}</strong>
        <p>
          {{
            keyword
              ? "换一个客户名称再试试。"
              : "切换交接状态，或新建客户档案。"
          }}
        </p>
      </div>
      <div v-else class="customer-book-scroll">
        <div class="customer-table customer-handoff-table">
          <div class="table-head">
            <span>客户</span><span>部署方式</span><span>交接人 / 日期</span
            ><span>交接状态</span><span>遗留问题</span><span>2026 服务</span
            ><span>客户状态</span>
          </div>
          <RouterLink
            v-for="customer in customers"
            :key="customer.id"
            :to="`/customers/${customer.id}`"
            class="table-row"
          >
            <div>
              <strong>{{ customer.name }}</strong
              ><small
                >{{ customer.industry || "未填写行业" }} ·
                {{ customer.owner?.name || "未分配负责人" }}</small
              >
            </div>
            <span class="deployment-pill">{{
              customer.handoffSummary?.deploymentType || "待补充"
            }}</span>
            <span
              ><strong>{{
                compactPeople(customer.handoffSummary?.handoffPeople || [])
              }}</strong
              ><small>{{
                customer.handoffSummary?.handoffAt?.slice(0, 10) || "未填写日期"
              }}</small></span
            >
            <span
              :class="['handoff-state', { pending: !customer.handoffSummary }]"
              >{{ customer.handoffSummary?.handoffStatus || "待补交接" }}</span
            >
            <span
              v-if="customer.handoffSummary?.hasLegacyIssues"
              class="legacy-preview"
              :title="customer.handoffSummary.legacyIssuePreview || ''"
              ><i></i
              >{{
                customer.handoffSummary.legacyIssuePreview || "存在遗留问题"
              }}</span
            >
            <span v-else class="quiet-value">无</span>
            <span class="service-count"
              ><strong>{{ customer.service2026?.total ?? 0 }}</strong
              ><small
                :class="{ negative: (customer.service2026?.open ?? 0) > 0 }"
                >{{ customer.service2026?.open ?? 0 }} 未闭环</small
              ></span
            >
            <StatusBadge :status="statusLabels[customer.status]" />
          </RouterLink>
        </div>
      </div>
    </article>

    <CustomerDialog
      :open="customerDialogOpen"
      @close="customerDialogOpen = false"
      @saved="customerSaved"
    />
    <CustomerImportDialog
      :open="importDialogOpen"
      @close="importDialogOpen = false"
      @completed="importCompleted"
    />
    <HandoffUnmatchedDialog
      :open="unmatchedDialogOpen"
      :customers="customers"
      @close="unmatchedDialogOpen = false"
      @linked="handoffLinked"
    />
    <AppToast :message="toast.message" :tone="toast.tone" />
  </section>
</template>

<style scoped>
.customer-page {
  min-height: 0;
}
.handoff-pulse {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  border: 1px solid #24435a;
  border-radius: 14px;
  overflow: hidden;
  background: #10253b;
  box-shadow: 0 14px 38px rgba(16, 37, 59, 0.12);
}
.handoff-pulse button {
  position: relative;
  min-height: 105px;
  padding: 17px 19px;
  border: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: #fff;
  text-align: left;
  cursor: pointer;
}
.handoff-pulse button:last-child {
  border-right: 0;
}
.handoff-pulse button::after {
  content: "";
  position: absolute;
  right: 17px;
  bottom: 19px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #5bd0bc;
  box-shadow: 0 0 0 5px rgba(91, 208, 188, 0.1);
}
.handoff-pulse button:nth-child(3)::after,
.handoff-pulse button:nth-child(5)::after {
  background: #e59a32;
  box-shadow: 0 0 0 5px rgba(229, 154, 50, 0.1);
}
.handoff-pulse button.active {
  background: linear-gradient(
    145deg,
    rgba(91, 208, 188, 0.17),
    rgba(91, 208, 188, 0.04)
  );
}
.handoff-pulse button:disabled {
  opacity: 0.62;
  cursor: default;
}
.handoff-pulse span,
.handoff-pulse small {
  display: block;
  color: #a9bdc8;
  font-size: 10px;
}
.handoff-pulse strong {
  display: block;
  margin: 11px 0 8px;
  font:
    700 26px ui-monospace,
    monospace;
}
.handoff-pulse small {
  font:
    600 8px ui-monospace,
    monospace;
  letter-spacing: 0.14em;
}
.customer-actions > div:last-child {
  display: flex;
  gap: 8px;
}
.customer-book-panel {
  min-height: 0;
  padding-bottom: 14px;
}
.customer-book-heading {
  gap: 18px;
}
.handoff-sync {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-left: auto;
  color: var(--muted);
  font-size: 9px;
}
.handoff-sync a {
  color: var(--teal);
}
.handoff-sync .ghost-button {
  margin: 0;
  padding: 7px 10px;
}
.handoff-filters {
  display: grid;
  grid-template-columns: 145px 130px 180px auto 1fr;
  align-items: end;
  gap: 11px;
  padding: 13px 15px;
  margin-bottom: 4px;
  border: 1px solid #e1e9eb;
  border-radius: 11px;
  background: #f7faf9;
}
.handoff-filters label {
  color: var(--muted);
  font-size: 9px;
}
.handoff-filters select,
.handoff-filters input:not([type]) {
  display: block;
  width: 100%;
  height: 34px;
  margin-top: 6px;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: #fff;
  color: var(--ink);
  outline: none;
}
.handoff-filters .legacy-filter {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  color: var(--ink);
}
.legacy-filter input {
  accent-color: var(--teal);
}
.handoff-filters > span {
  justify-self: end;
  align-self: center;
  color: var(--muted);
  font:
    600 9px ui-monospace,
    monospace;
}
.customer-book-scroll {
  min-height: 0;
  overflow: auto;
}
.customer-handoff-table {
  min-width: 1110px;
}
.customer-handoff-table .table-head,
.customer-handoff-table .table-row {
  grid-template-columns: minmax(190px, 1.45fr) 0.65fr 1fr 0.8fr minmax(
      170px,
      1.2fr
    ) 0.65fr 0.7fr;
}
.customer-handoff-table .table-head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #fff;
}
.customer-handoff-table .table-row:hover {
  background: #f7faf9;
}
.customer-handoff-table .table-row > span > strong,
.service-count strong {
  display: block;
  font-size: 11px;
}
.customer-handoff-table .table-row small {
  color: var(--muted);
}
.deployment-pill {
  width: max-content;
  max-width: 100%;
  padding: 5px 8px;
  border-radius: 12px;
  background: #e8f4f2;
  color: #087c6c;
  font:
    650 9px ui-monospace,
    monospace;
}
.handoff-state {
  width: max-content;
  padding: 5px 8px;
  border-radius: 12px;
  background: #dff4ef;
  color: #087c6c;
  font-size: 9px;
  font-weight: 650;
}
.handoff-state.pending {
  background: var(--amber-soft);
  color: #aa6b17;
}
.legacy-preview {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  color: #b15a38;
  font-size: 10px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.legacy-preview i {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #d65d57;
  box-shadow: 0 0 0 4px rgba(214, 93, 87, 0.09);
}
.quiet-value {
  color: #9aa8af;
  font-size: 10px;
}
.service-count strong {
  font:
    700 12px ui-monospace,
    monospace;
}
.service-count small {
  margin-top: 3px;
}
@media (max-width: 1100px) {
  .handoff-pulse {
    grid-template-columns: repeat(3, 1fr);
  }
  .handoff-pulse button {
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .handoff-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .handoff-filters > span {
    justify-self: start;
  }
}
@media (max-width: 680px) {
  .handoff-pulse {
    grid-template-columns: 1fr 1fr;
  }
  .handoff-pulse button {
    min-height: 92px;
  }
  .customer-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .customer-actions > div:last-child > button {
    flex: 1;
  }
  .customer-book-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .handoff-sync {
    margin: 0;
    flex-wrap: wrap;
    justify-content: flex-start;
  }
  .handoff-filters {
    grid-template-columns: 1fr;
  }
}
</style>
