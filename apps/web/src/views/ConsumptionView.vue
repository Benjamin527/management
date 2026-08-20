<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listCustomers } from '../api/customers'
import { getConsumptionAnalysis } from '../api/consumption'
import type { ConsumptionAnalysis, Customer } from '../api/types'

const periods = [7, 30, 60] as const
const days = ref<7 | 30 | 60>(30)
const customerId = ref('')
const product = ref('')
const customers = ref<Customer[]>([])
const analysis = ref<ConsumptionAnalysis | null>(null)
const loading = ref(true)
const error = ref('')

const hasData = computed(() => (analysis.value?.kpis.totalAmount ?? 0) > 0)
const maxTrend = computed(() => Math.max(...(analysis.value?.trend.map((item) => item.amount) ?? [0]), 1))
const chartPoints = computed(() => {
  const trend = analysis.value?.trend ?? []
  if (!trend.length) return ''
  return trend.map((item, index) => {
    const x = trend.length === 1 ? 0 : (index / (trend.length - 1)) * 720
    const y = 176 - (item.amount / maxTrend.value) * 142
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
})
const areaPoints = computed(() => chartPoints.value ? `0,176 ${chartPoints.value} 720,176` : '')

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2, notation: value >= 100000 ? 'compact' : 'standard' }).format(value)
}

function percent(value: number | null) {
  if (value == null) return '暂无对比'
  return `${value > 0 ? '+' : ''}${value}%`
}

function shortDate(value: string | null) {
  if (!value) return '—'
  return value.slice(5).replace('-', '/')
}

async function loadAnalysis() {
  loading.value = true
  error.value = ''
  try {
    analysis.value = await getConsumptionAnalysis({
      days: days.value,
      ...(customerId.value ? { customerId: customerId.value } : {}),
      ...(product.value ? { product: product.value } : {}),
    })
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '请求未完成'
  } finally {
    loading.value = false
  }
}

async function setPeriod(value: 7 | 30 | 60) {
  if (days.value === value) return
  days.value = value
  await loadAnalysis()
}

onMounted(async () => {
  const customerRequest = listCustomers({ pageSize: 100 })
    .then((result) => { customers.value = result.items })
    .catch(() => { customers.value = [] })
  await Promise.all([customerRequest, loadAnalysis()])
})
</script>

<template>
  <section class="page-stack consumption-workspace">
    <div class="consumption-command">
      <div>
        <span class="command-kicker"><i></i> LIVE CONSUMPTION PULSE</span>
        <h2>把消费变化变成可处理的客户信号</h2>
        <p>范围最多最近 60 天。下降、停用与异常增长会直接进入右侧关注队列。</p>
      </div>
      <div class="consumption-filters">
        <div class="segmented period-selector" aria-label="消费时间范围">
          <button v-for="period in periods" :key="period" :data-period="period" :class="{ active: days === period }" @click="setPeriod(period)">{{ period }} 天</button>
        </div>
        <select v-model="customerId" aria-label="筛选客户" @change="loadAnalysis">
          <option value="">全部客户</option>
          <option v-for="customer in customers" :key="customer.id" :value="customer.id">{{ customer.name }}</option>
        </select>
        <select v-model="product" aria-label="筛选产品" @change="loadAnalysis">
          <option value="">全部产品</option>
          <option v-for="item in analysis?.filters.products ?? []" :key="item" :value="item">{{ item }}</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="panel analysis-state" aria-live="polite">
      <span class="loading-orbit"></span><strong>正在整理消费脉搏</strong><p>计算趋势、客户排行和异常信号…</p>
    </div>

    <div v-else-if="error" class="panel analysis-state error-state" role="alert">
      <strong>消费数据加载失败</strong><p>{{ error }}</p><button class="ghost-button" data-action="retry" @click="loadAnalysis">重新加载</button>
    </div>

    <template v-else-if="analysis">
      <div class="consumption-kpis">
        <article><span>周期消费总量</span><strong>{{ number(analysis.kpis.totalAmount) }}</strong><small>{{ analysis.unit || '未设置单位' }}</small></article>
        <article><span>较上一周期</span><strong :class="analysis.kpis.changeRate != null && analysis.kpis.changeRate < 0 ? 'negative' : 'positive'">{{ percent(analysis.kpis.changeRate) }}</strong><small>同等 {{ days }} 天范围</small></article>
        <article><span>活跃客户</span><strong>{{ analysis.kpis.activeCustomers }}</strong><small>有消费记录的客户</small></article>
        <article class="attention"><span>异常信号</span><strong>{{ analysis.kpis.anomalyCustomers }}</strong><small>需要售后跟进</small></article>
      </div>

      <div v-if="!hasData" class="panel analysis-state empty-consumption">
        <div class="empty-pulse" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <strong>最近 {{ days }} 天还没有消费数据</strong>
        <p>数据写入后会自动形成趋势和异常信号。你可以先切换客户或产品检查其他范围。</p>
      </div>

      <template v-else>
        <div class="consumption-main-grid">
          <article class="panel pulse-chart-panel">
            <header><div><small>CONSUMPTION PULSE · {{ days }}D</small><h2>消费脉搏</h2></div><span>{{ analysis.range.from }} — {{ analysis.range.to }}</span></header>
            <div class="pulse-chart">
              <span class="chart-max">{{ number(maxTrend) }}</span><span class="chart-zero">0</span>
              <svg viewBox="0 0 720 190" role="img" :aria-label="`最近 ${days} 天消费趋势`" preserveAspectRatio="none">
                <defs><linearGradient id="pulse-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#159786" stop-opacity=".28"/><stop offset="1" stop-color="#159786" stop-opacity=".02"/></linearGradient></defs>
                <line x1="0" y1="34" x2="720" y2="34"/><line x1="0" y1="105" x2="720" y2="105"/><line x1="0" y1="176" x2="720" y2="176"/>
                <polygon :points="areaPoints" fill="url(#pulse-area)"/>
                <polyline :points="chartPoints"/>
              </svg>
              <div class="chart-dates"><span>{{ shortDate(analysis.trend[0]?.date ?? null) }}</span><span>{{ shortDate(analysis.trend[Math.floor(analysis.trend.length / 2)]?.date ?? null) }}</span><span>{{ shortDate(analysis.trend.at(-1)?.date ?? null) }}</span></div>
            </div>
          </article>

          <article class="panel anomaly-panel">
            <header><div><small>ATTENTION SIGNALS</small><h2>异常客户</h2></div><span>{{ analysis.anomalies.length }} 个信号</span></header>
            <div v-if="analysis.anomalies.length" class="anomaly-list">
              <div v-for="item in analysis.anomalies.slice(0, 6)" :key="item.customerId" :data-type="item.type">
                <i></i><div><strong>{{ item.customerName }}</strong><p>{{ item.reason }}</p><small>{{ item.owner || '未分配负责人' }}</small></div><b :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</b>
              </div>
            </div>
            <div v-else class="quiet-state"><span>✓</span><strong>当前没有异常信号</strong><p>消费变化均在设定范围内。</p></div>
          </article>
        </div>

        <div class="consumption-secondary-grid">
          <article class="panel product-panel">
            <header><div><small>PRODUCT MIX</small><h2>产品消费分布</h2></div><span>按消费量</span></header>
            <div class="product-bars">
              <div v-for="item in analysis.productDistribution" :key="item.product"><label><strong>{{ item.product }}</strong><span>{{ number(item.amount) }} {{ item.unit || '' }}</span></label><div><i :style="{ width: `${item.share}%` }"></i></div><small>{{ item.share }}%</small></div>
            </div>
          </article>
          <article class="panel ranking-panel">
            <header><div><small>CUSTOMER RANKING</small><h2>客户消费排行</h2></div><span>{{ analysis.customerRanking.length }} 家活跃</span></header>
            <div class="ranking-table">
              <div class="table-head"><span># / 客户</span><span>产品</span><span>消费量</span><span>环比</span><span>最近消费</span></div>
              <div v-for="(item, index) in analysis.customerRanking" :key="item.customerId" class="table-row"><div><b>{{ String(index + 1).padStart(2, '0') }}</b><strong>{{ item.customerName }}</strong><small>{{ item.owner || '未分配' }}</small></div><span>{{ item.products.join('、') }}</span><strong>{{ number(item.amount) }}</strong><span :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</span><span>{{ shortDate(item.lastActiveDate) }}</span></div>
            </div>
          </article>
        </div>
      </template>
    </template>
  </section>
</template>
