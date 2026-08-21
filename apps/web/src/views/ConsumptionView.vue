<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  getConsumptionAnalysis,
  getConsumptionSyncStatus,
  runConsumptionSync,
} from '../api/consumption'
import type {
  ConsumptionAnalysis,
  ConsumptionFilters,
  ConsumptionSourceFilter,
  ConsumptionSyncStatus,
} from '../api/types'
import AccountRankingTable from '../components/consumption/AccountRankingTable.vue'
import AnalysisFilters from '../components/consumption/AnalysisFilters.vue'
import AnalysisHeader from '../components/consumption/AnalysisHeader.vue'
import AnomalyList from '../components/consumption/AnomalyList.vue'
import BusinessSummary from '../components/consumption/BusinessSummary.vue'
import KpiSummary from '../components/consumption/KpiSummary.vue'
import PeriodTrendChart from '../components/consumption/PeriodTrendChart.vue'
import ProductMixChart from '../components/consumption/ProductMixChart.vue'
import SourceMixChart from '../components/consumption/SourceMixChart.vue'
import SyncDetails from '../components/consumption/SyncDetails.vue'
import { useConsumptionFilters } from '../composables/useConsumptionFilters'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const { filters, setFilters, reset } = useConsumptionFilters()
const analysis = ref<ConsumptionAnalysis | null>(null)
const syncStatus = ref<ConsumptionSyncStatus | null>(null)
const initialLoading = ref(true)
const refreshing = ref(false)
const syncing = ref(false)
const error = ref('')
const syncError = ref('')
const highlightedAccountId = ref('')
const syncDetails = ref<{ openDetails: () => void } | null>(null)

let analysisController: AbortController | null = null
let pollTimer: number | null = null
let refreshAfterSync = false

const canManage = computed(() =>
  ['ADMIN', 'MANAGER'].includes(auth.user?.role ?? ''),
)
const hasData = computed(() =>
  Boolean(
    analysis.value &&
      (analysis.value.kpis.currentAmount !== 0 ||
        analysis.value.kpis.previousAmount !== 0 ||
        analysis.value.accountRanking.length),
  ),
)
const filterKey = computed(() => JSON.stringify(filters.value))

async function loadAnalysis() {
  analysisController?.abort()
  const controller = new AbortController()
  analysisController = controller
  initialLoading.value = !analysis.value
  refreshing.value = Boolean(analysis.value)
  error.value = ''
  try {
    const result = await getConsumptionAnalysis(filters.value, controller.signal)
    if (controller.signal.aborted) return
    analysis.value = result
  } catch (reason) {
    if (
      controller.signal.aborted ||
      (reason instanceof DOMException && reason.name === 'AbortError')
    ) {
      return
    }
    error.value = reason instanceof Error ? reason.message : '消费数据读取失败'
  } finally {
    if (analysisController === controller) {
      initialLoading.value = false
      refreshing.value = false
    }
  }
}

async function loadSyncStatus(refreshAnalysis = false) {
  try {
    const next = await getConsumptionSyncStatus()
    syncStatus.value = next
    syncError.value = ''
    if (next.running) {
      refreshAfterSync = true
      startPolling()
    } else {
      stopPolling()
      if (refreshAfterSync || refreshAnalysis) {
        refreshAfterSync = false
        await loadAnalysis()
      }
    }
  } catch (reason) {
    syncError.value = reason instanceof Error ? reason.message : '同步状态读取失败'
  }
}

async function runSync() {
  if (!canManage.value || !syncStatus.value?.enabled || syncStatus.value.running) {
    return
  }
  syncing.value = true
  syncError.value = ''
  try {
    await runConsumptionSync()
    if (syncStatus.value) syncStatus.value.running = true
    refreshAfterSync = true
    startPolling(true)
  } catch (reason) {
    syncError.value = reason instanceof Error ? reason.message : '同步任务未能启动'
  } finally {
    syncing.value = false
  }
}

function startPolling(refreshAnalysis = false) {
  if (pollTimer !== null) return
  pollTimer = window.setInterval(
    () => void loadSyncStatus(refreshAnalysis),
    3000,
  )
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

function changeFilters(patch: Partial<ConsumptionFilters>) {
  void setFilters(patch)
}

function selectSource(source: ConsumptionSourceFilter) {
  void setFilters({
    source,
    accountId: '',
    product: '',
    managerName: '',
  })
}

async function locateAccount(accountId: string) {
  highlightedAccountId.value = ''
  await nextTick()
  highlightedAccountId.value = accountId
}

function openSyncDetails() {
  syncDetails.value?.openDetails()
  void nextTick(() => {
    document
      .querySelector('[data-action="toggle-sync-details"]')
      ?.scrollIntoView({ block: 'center' })
  })
}

watch(filterKey, () => void loadAnalysis(), { immediate: true })
onMounted(() => void loadSyncStatus())
onBeforeUnmount(() => {
  analysisController?.abort()
  stopPolling()
})
</script>

<template>
  <section class="page-stack consumption-report">
    <AnalysisHeader
      :period="filters.period"
      :data-through="analysis?.dataThrough ?? ''"
      :last-synced-at="analysis?.lastSyncedAt ?? null"
      :syncing="syncing || Boolean(syncStatus?.running)"
      :refreshing="refreshing"
      @open-sync="openSyncDetails"
    />

    <AnalysisFilters
      :model-value="filters"
      :accounts="analysis?.filters.accounts ?? []"
      :products="analysis?.filters.products ?? []"
      :managers="analysis?.filters.managers ?? []"
      :result-count="analysis?.accountRanking.length ?? 0"
      @change="changeFilters"
      @reset="void reset()"
    />

    <div v-if="refreshing" class="refresh-indicator" data-refreshing aria-live="polite">
      <i></i>正在按新条件刷新，当前仍展示上一次结果
    </div>

    <div v-if="error && analysis" class="refresh-error" role="alert">
      <span><strong>最新筛选未能完成</strong>{{ error }}</span>
      <button data-action="retry-analysis" @click="loadAnalysis">重新加载</button>
    </div>

    <div v-if="initialLoading" class="report-skeleton" aria-live="polite">
      <div class="skeleton-kpis"><i v-for="index in 5" :key="index"></i></div>
      <div class="skeleton-grid"><i></i><i></i></div>
      <strong>正在整理消费经营报告</strong>
    </div>

    <div v-else-if="error && !analysis" class="panel report-error" role="alert">
      <strong>消费数据加载失败</strong>
      <p>{{ error }}</p>
      <button data-action="retry-analysis" @click="loadAnalysis">重新加载</button>
    </div>

    <template v-else-if="analysis">
      <KpiSummary
        :kpis="analysis.kpis"
        :range="analysis.range"
        :loading="refreshing"
      />

      <div v-if="!hasData" class="empty-report-note">
        <strong>当前筛选条件下没有消费记录</strong>
        <p>可以切换来源、产品、负责人或异常条件查看其他范围。</p>
      </div>

      <div class="report-grid">
        <PeriodTrendChart
          class="trend-section"
          :trend="analysis.trend"
          :period="analysis.periodDays"
        />
        <BusinessSummary
          class="summary-section"
          :summary="analysis.summary"
          :missing-dates="analysis.missingDates"
          :coverage="analysis.coverage"
        />
        <ProductMixChart
          class="product-section"
          :items="analysis.productDistribution"
          :selected-product="filters.product"
          @select="changeFilters({ product: $event })"
        />
        <SourceMixChart
          class="source-section"
          :items="analysis.sourceDistribution"
          :selected-source="filters.source"
          @select="selectSource"
        />
        <AccountRankingTable
          class="ranking-section"
          :items="analysis.accountRanking"
          :highlight-account-id="highlightedAccountId"
        />
        <AnomalyList
          class="anomaly-section"
          :items="analysis.anomalies"
          @locate="locateAccount"
        />
      </div>
    </template>

    <SyncDetails
      ref="syncDetails"
      :status="syncStatus"
      :analysis="analysis"
      :can-manage="canManage"
      :syncing="syncing"
      :error="syncError"
      @sync="runSync"
    />
  </section>
</template>

<style scoped>
.consumption-report{--report-bg:#f4f7f8;--report-surface:#fff;--report-ink:#173247;--report-muted:#6f818d;--report-teal:#168e82;--report-amber:#d3902f;--report-danger:#c95b52;--report-line:#dce5e8;color:var(--report-ink)}.report-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:18px}.trend-section{grid-column:span 8}.summary-section{grid-column:span 4}.product-section{grid-column:span 7}.source-section{grid-column:span 5}.ranking-section{grid-column:span 8}.anomaly-section{grid-column:span 4}.refresh-indicator{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 12px;border-radius:9px;background:#edf7f5;color:#176f67;font-size:10px}.refresh-indicator i{width:7px;height:7px;border-radius:50%;background:var(--report-teal);animation:report-refresh 1s ease-in-out infinite}.refresh-error{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:11px 13px;border-left:3px solid var(--report-danger);border-radius:8px;background:#fff1f0;color:#8f4540;font-size:10px}.refresh-error strong{margin-right:8px}.refresh-error button,.report-error button{min-height:32px;padding:0 11px;border:1px solid #e6c0bd;border-radius:8px;background:#fff;color:#8f4540;font-size:10px}.report-skeleton{display:grid;gap:18px;min-height:420px}.skeleton-kpis,.skeleton-grid{display:grid;gap:14px}.skeleton-kpis{grid-template-columns:repeat(5,1fr)}.skeleton-grid{grid-template-columns:2fr 1fr}.skeleton-kpis i,.skeleton-grid i{display:block;border-radius:13px;background:linear-gradient(90deg,#edf2f3,#f8fafa,#edf2f3);background-size:200% 100%;animation:skeleton-shift 1.2s linear infinite}.skeleton-kpis i{height:116px}.skeleton-grid i{height:300px}.report-skeleton>strong{text-align:center;color:var(--report-muted);font-size:10px}.report-error{display:grid;place-items:center;align-content:center;min-height:360px;text-align:center}.report-error>strong{color:var(--report-danger)}.report-error p{margin:7px 0 15px;color:var(--report-muted);font-size:10px}.empty-report-note{padding:14px 16px;border:1px dashed var(--report-line);border-radius:10px;background:#fafcfc}.empty-report-note strong{font-size:11px}.empty-report-note p{margin:5px 0 0;color:var(--report-muted);font-size:9px}@keyframes report-refresh{50%{opacity:.35;transform:scale(.8)}}@keyframes skeleton-shift{to{background-position:-200% 0}}@media(max-width:980px){.trend-section,.summary-section,.product-section,.source-section,.ranking-section,.anomaly-section{grid-column:span 12}.skeleton-grid{grid-template-columns:1fr}}@media(max-width:680px){.skeleton-kpis{display:flex;overflow:hidden}.skeleton-kpis i{flex:0 0 72%}.refresh-error{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){.consumption-report *,.consumption-report *::before,.consumption-report *::after{scroll-behavior:auto!important;transition-duration:.01ms!important;animation-duration:.01ms!important}}
</style>
