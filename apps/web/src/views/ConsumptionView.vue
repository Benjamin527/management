<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  getConsumptionAnalysis,
  getConsumptionSyncStatus,
  runConsumptionSync,
} from '../api/consumption'
import type { ConsumptionAnalysis, ConsumptionSyncStatus } from '../api/types'
import { useAuthStore } from '../stores/auth'

type SourceFilter = 'ALL' | 'DOMESTIC' | 'OVERSEAS'

const auth = useAuthStore()
const sources: Array<{ value: SourceFilter; label: string }> = [
  { value: 'ALL', label: '全部' },
  { value: 'DOMESTIC', label: '国内' },
  { value: 'OVERSEAS', label: '海外' },
]
const source = ref<SourceFilter>('ALL')
const accountId = ref('')
const product = ref('')
const analysis = ref<ConsumptionAnalysis | null>(null)
const syncStatus = ref<ConsumptionSyncStatus | null>(null)
const loading = ref(true)
const syncing = ref(false)
const error = ref('')
const syncError = ref('')
let pollTimer: number | null = null
let refreshAfterSync = false

const canManage = computed(() => ['ADMIN', 'MANAGER'].includes(auth.user?.role ?? ''))
const hasData = computed(() => (analysis.value?.kpis.totalAmount ?? 0) !== 0)
const maxTrend = computed(() => Math.max(...(analysis.value?.trend.map((item) => item.amount) ?? [0]), 1))
const chartPoints = computed(() => {
  const trend = analysis.value?.trend ?? []
  if (!trend.length) return ''
  return trend
    .map((item, index) => {
      const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 720
      const y = 176 - (item.amount / maxTrend.value) * 142
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})
const areaPoints = computed(() => (chartPoints.value ? `0,176 ${chartPoints.value} 720,176` : ''))
const syncDisabledReason = computed(() => {
  if (!canManage.value) return '仅管理员和经理可手动同步'
  if (!syncStatus.value?.enabled) return '服务器尚未配置消费数据源'
  if (syncStatus.value.running || syncing.value) return '同步任务正在运行'
  return ''
})

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  }).format(value)
}

function percent(value: number | null) {
  if (value == null) return '暂无对比'
  return `${value > 0 ? '+' : ''}${value}%`
}

function shortDate(value: string | null) {
  if (!value) return '—'
  return value.slice(5).replace('-', '/')
}

function dateTime(value: string | null | undefined) {
  if (!value) return '尚未成功同步'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

function sourceLabel(value: 'DOMESTIC' | 'OVERSEAS') {
  return value === 'DOMESTIC' ? '国内' : '海外'
}

async function loadAnalysis() {
  loading.value = true
  error.value = ''
  try {
    analysis.value = await getConsumptionAnalysis({
      source: source.value,
      ...(accountId.value ? { accountId: accountId.value } : {}),
      ...(product.value ? { product: product.value } : {}),
    })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '消费数据读取失败'
  } finally {
    loading.value = false
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
    }
    else {
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

async function setSource(value: SourceFilter) {
  if (source.value === value) return
  source.value = value
  accountId.value = ''
  product.value = ''
  await loadAnalysis()
}

async function runSync() {
  if (syncDisabledReason.value) return
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
  pollTimer = window.setInterval(() => void loadSyncStatus(refreshAnalysis), 3000)
}

function stopPolling() {
  if (pollTimer === null) return
  window.clearInterval(pollTimer)
  pollTimer = null
}

onMounted(() => void Promise.all([loadAnalysis(), loadSyncStatus()]))
onBeforeUnmount(stopPolling)
</script>

<template>
  <section class="page-stack consumption-workspace">
    <div class="consumption-command">
      <div>
        <span class="command-kicker"><i></i> 14-DAY CONSUMPTION PULSE</span>
        <h2>最近 14 天消费脉搏</h2>
        <p>对比最近 7 天与此前 7 天，及时发现停用、下降和异常增长。</p>
      </div>
      <div class="consumption-filters">
        <div class="segmented source-selector" aria-label="消费来源">
          <button
            v-for="item in sources"
            :key="item.value"
            :data-source="item.value"
            :class="{ active: source === item.value }"
            @click="setSource(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
        <select v-model="accountId" aria-label="筛选消费账户" @change="loadAnalysis">
          <option value="">全部消费账户</option>
          <option v-for="account in analysis?.filters.accounts ?? []" :key="account.id" :value="account.id">
            {{ account.displayName }} · {{ sourceLabel(account.source) }}
          </option>
        </select>
        <select v-model="product" aria-label="筛选产品" @change="loadAnalysis">
          <option value="">全部产品</option>
          <option v-for="item in analysis?.filters.products ?? []" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>

    <section class="consumption-sync-track" :class="{ running: syncStatus?.running }" aria-live="polite">
      <div><span>新版消费库</span><strong>{{ syncStatus?.enabled ? '只读连接已配置' : '连接未配置' }}</strong></div>
      <i class="sync-flow"><b></b></i>
      <div><span>本地 MySQL 快照</span><strong>{{ syncStatus?.running ? '正在同步最近 14 天' : `${dateTime(syncStatus?.lastSuccessfulRun?.finishedAt)} 更新` }}</strong><small v-if="syncStatus?.lastSuccessfulRun">{{ syncStatus.lastSuccessfulRun.accountCount }} 个账户 · {{ syncStatus.lastSuccessfulRun.rowCount }} 条日汇总</small></div>
      <i class="sync-flow"><b></b></i>
      <div><span>分析数据截至</span><strong>{{ analysis?.dataThrough ?? '等待首次同步' }}</strong><small v-if="syncStatus?.nextScheduledAt">下次 {{ dateTime(syncStatus.nextScheduledAt) }}</small></div>
      <div class="sync-action">
        <button data-action="sync-consumption" :disabled="Boolean(syncDisabledReason)" :title="syncDisabledReason" @click="runSync">
          {{ syncing ? '启动中…' : syncStatus?.running ? '同步中…' : '立即同步' }}
        </button>
        <small v-if="syncDisabledReason">{{ syncDisabledReason }}</small>
      </div>
      <p v-if="syncError" class="sync-error">{{ syncError }}</p>
      <p v-else-if="syncStatus?.lastRun?.status === 'FAILED'" class="sync-error">最近同步失败：{{ syncStatus.lastRun.errorSummary }}</p>
    </section>

    <div v-if="loading" class="panel analysis-state" aria-live="polite">
      <span class="loading-orbit"></span><strong>正在整理消费脉搏</strong><p>计算趋势、账户排行和异常信号…</p>
    </div>

    <div v-else-if="error" class="panel analysis-state error-state" role="alert">
      <strong>消费数据加载失败</strong><p>{{ error }}</p><button class="ghost-button" data-action="retry" @click="loadAnalysis">重新加载</button>
    </div>

    <template v-else-if="analysis">
      <section class="coverage-panel" :class="{ incomplete: analysis.missingDates.length }">
        <div class="coverage-copy">
          <span>DATA COMPLETENESS</span>
          <strong v-if="analysis.missingDates.length">{{ analysis.missingDates.length }} 天数据未完整产出</strong>
          <strong v-else>14 天国内、海外数据均已到齐</strong>
          <small><i class="domestic-dot"></i>国内 <i class="overseas-dot"></i>海外</small>
        </div>
        <div class="coverage-days">
          <div v-for="day in analysis.coverage" :key="day.date" :data-date="day.date" :class="{ missing: !analysis.availableDates.includes(day.date) }">
            <span>{{ shortDate(day.date) }}</span>
            <b><i :class="{ off: !day.domestic }"></i><i :class="{ off: !day.overseas }"></i></b>
          </div>
        </div>
      </section>

      <div class="consumption-kpis">
        <article><span>14 天消费金额</span><strong>¥ {{ number(analysis.kpis.totalAmount) }}</strong><small>{{ analysis.range.from }} — {{ analysis.range.to }}</small></article>
        <article><span>最近 7 天环比</span><strong :class="analysis.kpis.changeRate != null && analysis.kpis.changeRate < 0 ? 'negative' : 'positive'">{{ percent(analysis.kpis.changeRate) }}</strong><small>¥ {{ number(analysis.kpis.recent7Amount) }} / 此前 ¥ {{ number(analysis.kpis.previous7Amount) }}</small></article>
        <article><span>活跃消费账户</span><strong>{{ analysis.kpis.activeAccounts }}</strong><small>独立于售后客户档案</small></article>
        <article class="attention"><span>异常账户</span><strong>{{ analysis.kpis.anomalyAccounts }}</strong><small>停用、下降或异常增长</small></article>
      </div>

      <div v-if="!hasData" class="panel analysis-state empty-consumption">
        <div class="empty-pulse" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <strong>最近 14 天还没有消费数据</strong>
        <p>可切换国内、海外或产品检查其他范围；有权限的用户也可以立即同步最新快照。</p>
      </div>

      <template v-else>
        <div class="consumption-main-grid">
          <article class="panel pulse-chart-panel">
            <header><div><small>CONSUMPTION PULSE · 14D</small><h2>每日消费金额</h2></div><span>{{ analysis.range.from }} — {{ analysis.range.to }}</span></header>
            <div class="pulse-chart">
              <span class="chart-max">¥{{ number(maxTrend) }}</span><span class="chart-zero">0</span>
              <svg viewBox="0 0 720 190" role="img" aria-label="最近 14 天消费趋势" preserveAspectRatio="none">
                <defs><linearGradient id="pulse-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#159786" stop-opacity=".28"/><stop offset="1" stop-color="#159786" stop-opacity=".02"/></linearGradient></defs>
                <line x1="0" y1="34" x2="720" y2="34"/><line x1="0" y1="105" x2="720" y2="105"/><line x1="0" y1="176" x2="720" y2="176"/>
                <polygon :points="areaPoints" fill="url(#pulse-area)"/><polyline :points="chartPoints"/>
              </svg>
              <div class="chart-dates"><span>{{ shortDate(analysis.trend[0]?.date ?? null) }}</span><span>{{ shortDate(analysis.trend[7]?.date ?? null) }}</span><span>{{ shortDate(analysis.trend.at(-1)?.date ?? null) }}</span></div>
            </div>
          </article>

          <article class="panel anomaly-panel">
            <header><div><small>ATTENTION SIGNALS</small><h2>异常账户</h2></div><span>{{ analysis.anomalies.length }} 个信号</span></header>
            <div v-if="analysis.anomalies.length" class="anomaly-list">
              <div v-for="item in analysis.anomalies.slice(0, 6)" :key="`${item.source}:${item.accountId}`" :data-type="item.type">
                <i></i><div><strong>{{ item.accountName }} <em :data-source="item.source">{{ sourceLabel(item.source) }}</em></strong><p>{{ item.reason }}<template v-if="item.confidence === 'LOW'"> · 数据不完整，低置信度</template></p><small>{{ item.managerName || item.externalId }}</small></div><b :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</b>
              </div>
            </div>
            <div v-else class="quiet-state"><span>✓</span><strong>当前没有异常信号</strong><p>最近两段 7 天消费变化均在规则范围内。</p></div>
          </article>
        </div>

        <div class="consumption-secondary-grid">
          <article class="panel product-panel">
            <header><div><small>PRODUCT MIX</small><h2>产品消费分布</h2></div><span>按人民币金额</span></header>
            <div class="product-bars">
              <div v-for="item in analysis.productDistribution" :key="item.product"><label><strong>{{ item.product }}</strong><span>¥ {{ number(item.amount) }}</span></label><div><i :style="{ width: `${item.share}%` }"></i></div><small>{{ item.share }}%</small></div>
            </div>
          </article>
          <article class="panel ranking-panel">
            <header><div><small>ACCOUNT RANKING</small><h2>消费账户排行</h2></div><span>{{ analysis.accountRanking.length }} 个活跃</span></header>
            <div class="ranking-table">
              <div class="table-head"><span># / 账户</span><span>来源 / 产品</span><span>14 天金额</span><span>近 7 天环比</span><span>最近消费</span></div>
              <div v-for="(item, index) in analysis.accountRanking" :key="`${item.source}:${item.accountId}`" class="table-row"><div><b>{{ String(index + 1).padStart(2, '0') }}</b><strong>{{ item.accountName }}</strong><small>{{ item.managerName || item.externalId }}</small></div><span><em :data-source="item.source">{{ sourceLabel(item.source) }}</em> {{ item.products.join('、') }}</span><strong>¥ {{ number(item.amount) }}</strong><span :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</span><span>{{ shortDate(item.lastActiveDate) }}</span></div>
            </div>
          </article>
        </div>
      </template>
    </template>
  </section>
</template>
