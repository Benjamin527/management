<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { getServiceCustomers, getServiceDistribution, getServiceSummary, getServiceTrend } from '../api/serviceAnalysis'
import SyncStatusBar from '../components/service/SyncStatusBar.vue'
import type { ServiceAnalysisDimension, ServiceCustomerRanking, ServiceDistributionItem, ServiceRecordQuery, ServiceSummary, ServiceTrendMonth } from '../types/service'

const router = useRouter()
const loading = ref(true)
const error = ref('')
const summary = ref<ServiceSummary | null>(null)
const trend = ref<ServiceTrendMonth[]>([])
const customers = ref<ServiceCustomerRanking[]>([])
const distributions = reactive<Record<ServiceAnalysisDimension, ServiceDistributionItem[]>>({
  status: [], feedbackType: [], issueType: [], sourceType: [], deploymentType: [], engineer: [],
})

const maxMonth = computed(() => Math.max(...trend.value.map((item) => item.total), 1))
const maxIssue = computed(() => Math.max(...distributions.issueType.map((item) => item.count), 1))
const maxEngineer = computed(() => Math.max(...distributions.engineer.map((item) => item.count), 1))
const maxCustomer = computed(() => Math.max(...customers.value.map((item) => item.total), 1))
const statusSeries = [
  { key: 'RESOLVED', label: '已解决', color: '#159786' },
  { key: 'CLOSED', label: '已关闭', color: '#58758a' },
  { key: 'IN_PROGRESS', label: '跟进中', color: '#e59a32' },
  { key: 'WAITING_REPLY', label: '待回复', color: '#d65d57' },
  { key: 'ESCALATED', label: '飞书项目', color: '#725f9c' },
  { key: 'UNKNOWN', label: '数据缺失', color: '#b7c1c7' },
] as const
const palette = ['#159786', '#5c8fa9', '#e59a32', '#725f9c', '#d65d57', '#8aa99f', '#9babb4']

function number(value: number) { return new Intl.NumberFormat('zh-CN').format(value) }
function shortDate(value: string | null) { return value ? value.slice(0, 10) : '—' }
function percent(value: number) { return `${value.toFixed(2)}%` }
function barWidth(value: number, max: number) { return `${Math.max((value / max) * 100, value ? 2 : 0)}%` }
function monthHeight(value: number) { return `${Math.max((value / maxMonth.value) * 148, value ? 3 : 0)}px` }

function donutStyle(items: ServiceDistributionItem[]) {
  const total = items.reduce((sum, item) => sum + item.count, 0)
  if (!total) return { background: '#edf1f2' }
  let cursor = 0
  const stops = items.map((item, index) => {
    const start = cursor
    cursor += (item.count / total) * 100
    return `${palette[index % palette.length]} ${start}% ${cursor}%`
  })
  return { background: `conic-gradient(${stops.join(',')})` }
}

function openRecords(query: ServiceRecordQuery = {}) {
  void router.push({ path: '/service-records', query: query as Record<string, string> })
}

function openMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  openRecords({ dateFrom: `${month}-01`, dateTo: `${month}-${String(lastDay).padStart(2, '0')}` })
}

async function loadAnalysis() {
  loading.value = true
  error.value = ''
  try {
    const [summaryResult, trendResult, feedback, issue, source, deployment, engineer, customerResult] = await Promise.all([
      getServiceSummary(), getServiceTrend(), getServiceDistribution('feedbackType'), getServiceDistribution('issueType'),
      getServiceDistribution('sourceType'), getServiceDistribution('deploymentType'), getServiceDistribution('engineer'), getServiceCustomers(10),
    ])
    summary.value = summaryResult
    trend.value = trendResult
    distributions.feedbackType = feedback
    distributions.issueType = issue
    distributions.sourceType = source
    distributions.deploymentType = deployment
    distributions.engineer = engineer
    customers.value = customerResult
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '请求未完成'
  } finally {
    loading.value = false
  }
}

onMounted(() => void loadAnalysis())
</script>

<template>
  <section class="page-stack service-analysis-page">
    <SyncStatusBar />

    <div class="analysis-heading">
      <div><span class="analysis-kicker">2026 · SERVICE OPERATIONS TRACE</span><h2>2026 年服务分析</h2><p>从客户反馈进入、问题归类到产研升级，查看企业客户服务链路的真实负荷。</p></div>
      <div v-if="summary" class="freshness"><span>数据截至</span><strong>{{ shortDate(summary.freshness.dataThrough) }}</strong><small>仅包含开始日期属于 2026 年的记录</small></div>
    </div>

    <div v-if="loading" class="panel analysis-state"><span class="loading-orbit"></span><strong>正在铺开年度服务航迹</strong><p>计算 2026 年状态、客户和处理链路…</p></div>
    <div v-else-if="error" class="panel analysis-state error-state" role="alert"><strong>服务分析加载失败</strong><p>{{ error }}</p><button class="ghost-button" data-action="retry-analysis" @click="loadAnalysis">重新加载</button></div>

    <template v-else-if="summary">
      <div class="service-kpis">
        <button data-testid="kpi-total" @click="openRecords()"><span>全年服务记录</span><strong>{{ number(summary.total) }}</strong><small>{{ summary.customerCount }} 家企业客户</small></button>
        <button data-testid="kpi-waiting-reply" class="risk" @click="openRecords({ status: 'WAITING_REPLY' })"><span>当前待回复</span><strong>{{ number(summary.waitingReply) }}</strong><small>需要明确回复客户</small></button>
        <button class="attention" @click="openRecords({ status: 'IN_PROGRESS' })"><span>当前跟进中</span><strong>{{ number(summary.inProgress) }}</strong><small>仍在售后链路内</small></button>
        <button class="escalated" @click="openRecords({ status: 'ESCALATED' })"><span>飞书项目升级</span><strong>{{ number(summary.escalated) }}</strong><small>已进入产研协同</small></button>
        <button @click="openRecords({ feedbackType: 'Bug' })"><span>Bug 反馈</span><strong>{{ number(summary.bugCount) }}</strong><small>占全部 {{ percent(summary.bugRate) }}</small></button>
        <button @click="openRecords({ status: 'RESOLVED' })"><span>已解决 / 已关闭</span><strong>{{ percent(summary.resolvedOrClosedRate) }}</strong><small>闭环记录占比</small></button>
        <button @click="openRecords()"><span>已服务客户</span><strong>{{ number(summary.customerCount) }}</strong><small>按客户名称去重</small></button>
      </div>

      <div class="analysis-primary-grid">
        <article class="panel service-trend-panel">
          <header><div><small>MONTHLY SERVICE TRACE</small><h2>月度服务航迹</h2></div><span>点击月份下钻</span></header>
          <div class="status-legend"><span v-for="item in statusSeries" :key="item.key"><i :style="{ background: item.color }"></i>{{ item.label }}</span></div>
          <div class="service-months">
            <button v-for="month in trend" :key="month.month" :aria-label="`${month.month} 共 ${month.total} 条`" @click="openMonth(month.month)">
              <div class="month-stack" :style="{ height: monthHeight(month.total) }">
                <i v-for="item in statusSeries" :key="item.key" :style="{ background: item.color, flex: month.statuses[item.key] || 0 }"></i>
              </div><strong>{{ month.total }}</strong><span>{{ month.month.slice(5) }}月</span>
            </button>
          </div>
        </article>

        <article class="panel feedback-panel">
          <header><div><small>FEEDBACK MIX</small><h2>反馈类型</h2></div><span>{{ distributions.feedbackType.length }} 类</span></header>
          <div class="donut-wrap"><button class="service-donut" :style="donutStyle(distributions.feedbackType)" aria-label="反馈类型分布" @click="openRecords()"><i><strong>{{ number(summary.total) }}</strong><span>全部反馈</span></i></button>
            <div class="donut-legend"><button v-for="(item, index) in distributions.feedbackType" :key="item.key" @click="openRecords({ feedbackType: item.key })"><i :style="{ background: palette[index % palette.length] }"></i><span>{{ item.key }}</span><strong>{{ number(item.count) }}</strong></button></div>
          </div>
        </article>
      </div>

      <div class="analysis-secondary-grid">
        <article class="panel issue-type-panel"><header><div><small>ISSUE TYPE · TOP 10</small><h2>高频问题类型</h2></div><span>标准分类</span></header><div class="analysis-bars"><button v-for="item in distributions.issueType" :key="item.key" @click="openRecords({ issueType: item.key })"><label><span>{{ item.key }}</span><strong>{{ number(item.count) }}</strong></label><i><b :style="{ width: barWidth(item.count, maxIssue) }"></b></i></button></div></article>
        <article class="panel channel-panel"><header><div><small>SERVICE ENTRANCE</small><h2>来源与部署形态</h2></div></header><div class="split-distribution"><section><h3>反馈来源</h3><button v-for="item in distributions.sourceType.slice(0, 6)" :key="item.key" @click="openRecords({ sourceType: item.key })"><span>{{ item.key }}</span><strong>{{ number(item.count) }}</strong></button></section><section><h3>部署形态</h3><button v-for="item in distributions.deploymentType.slice(0, 6)" :key="item.key" @click="openRecords({ deploymentType: item.key })"><span>{{ item.key }}</span><strong>{{ number(item.count) }}</strong></button></section></div></article>
      </div>

      <div class="analysis-secondary-grid">
        <article class="panel customer-service-panel"><header><div><small>ENTERPRISE CUSTOMER LOAD</small><h2>客户服务量 Top 10</h2></div><span>总量 / 未闭环</span></header><div class="customer-service-list"><button v-for="customer in customers" :key="customer.customerName" @click="openRecords({ customer: customer.customerName })"><span>{{ customer.customerName }}<small>{{ customer.topIssueType || '暂无分类' }}</small></span><i><b :style="{ width: barWidth(customer.total, maxCustomer) }"></b><em :style="{ width: barWidth(customer.open, maxCustomer) }"></em></i><strong>{{ customer.total }}<small>{{ customer.open }} 未闭环</small></strong></button></div></article>
        <article class="panel engineer-panel"><header><div><small>ENGINEER HANDOFF</small><h2>工程师处理链路</h2></div><span>处理 / 升级三线</span></header><div class="engineer-list"><button v-for="item in distributions.engineer.slice(0, 10)" :key="item.key" @click="openRecords({ engineer: item.key })"><span>{{ item.key }}</span><i><b :style="{ width: barWidth(item.count, maxEngineer) }"></b><em :style="{ width: barWidth(item.thirdLineEscalated || 0, maxEngineer) }"></em></i><strong>{{ item.count }}<small>{{ item.thirdLineEscalated || 0 }} 升级</small></strong></button></div><p class="coverage-note">一线工程师字段覆盖 {{ summary.quality.firstLineEngineer.populated }} / {{ summary.quality.firstLineEngineer.total }}（{{ percent(summary.quality.firstLineEngineer.rate) }}），排行不能解释为完整工作量。</p></article>
      </div>

      <article class="quality-strip"><div><strong>数据解释边界</strong><span>满意度 {{ summary.quality.satisfaction.populated }} 条 · 工单 ID {{ summary.quality.ticketId.populated }} 条 · 重点问题 {{ summary.quality.keyIssue.populated }} 条</span></div><p>日期以自然日为主，当前数据不能计算精确首次响应时间或 SLA 时长。所有覆盖率均随同步结果动态更新。</p></article>
    </template>
  </section>
</template>

<style scoped>
.analysis-heading{display:flex;align-items:flex-end;justify-content:space-between;padding:8px 2px 2px}.analysis-kicker{font:650 10px ui-monospace,monospace;letter-spacing:.18em;color:#159786}.analysis-heading h2{font-size:25px;letter-spacing:-.045em;margin:8px 0 6px}.analysis-heading p{margin:0;color:#70808d;font-size:12px}.freshness{text-align:right}.freshness span,.freshness small{display:block;color:#70808d;font-size:10px}.freshness strong{display:block;margin:5px 0;font:700 20px ui-monospace,monospace}
.service-kpis{display:grid;grid-template-columns:1.2fr repeat(6,1fr);border:1px solid #dfe7e9;border-radius:14px;background:#fff;overflow:hidden}.service-kpis button{min-width:0;min-height:118px;padding:17px 15px;border:0;border-right:1px solid #dfe7e9;background:#fff;text-align:left;position:relative}.service-kpis button:last-child{border:0}.service-kpis button:after{content:"";position:absolute;inset:auto 0 0;height:3px;background:#9babb4}.service-kpis button.risk:after{background:#d65d57}.service-kpis button.attention:after{background:#e59a32}.service-kpis button.escalated:after{background:#725f9c}.service-kpis button:hover{background:#f8fbfb}.service-kpis span,.service-kpis small{display:block;color:#70808d;font-size:10px}.service-kpis strong{display:block;margin:16px 0 8px;font:700 25px/1 ui-monospace,monospace;letter-spacing:-.06em}
.analysis-primary-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(310px,.7fr);gap:18px}.status-legend{display:flex;gap:14px;flex-wrap:wrap;margin:-8px 0 14px}.status-legend span{font-size:9px;color:#70808d}.status-legend i,.donut-legend i{display:inline-block;width:7px;height:7px;border-radius:2px;margin-right:5px}.service-months{height:205px;display:grid;grid-template-columns:repeat(12,1fr);gap:9px;align-items:end;border-bottom:1px solid #dfe7e9;padding:0 4px}.service-months button{border:0;background:transparent;padding:0;display:flex;align-items:center;flex-direction:column;justify-content:flex-end;height:100%;min-width:0}.service-months button:hover .month-stack{filter:saturate(1.25);transform:translateY(-2px)}.month-stack{width:min(24px,72%);min-height:2px;display:flex;flex-direction:column-reverse;border-radius:5px 5px 2px 2px;overflow:hidden;transition:.18s ease}.month-stack i{min-height:0}.service-months strong{font:650 9px ui-monospace,monospace;margin-top:7px}.service-months span{color:#70808d;font-size:9px;margin:3px 0 8px}
.donut-wrap{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:center;min-height:210px}.service-donut{width:148px;height:148px;border:0;border-radius:50%;display:grid;place-items:center;position:relative}.service-donut:after{content:"";position:absolute;inset:24px;border-radius:50%;background:#fff}.service-donut i{position:relative;z-index:1;font-style:normal}.service-donut strong,.service-donut span{display:block}.service-donut strong{font:700 18px ui-monospace,monospace}.service-donut span{color:#70808d;font-size:9px;margin-top:4px}.donut-legend{display:flex;flex-direction:column}.donut-legend button{display:grid;grid-template-columns:12px 1fr auto;align-items:center;padding:8px 0;border:0;border-bottom:1px solid #edf1f2;background:transparent;text-align:left;font-size:10px}.donut-legend strong{font:650 10px ui-monospace,monospace}
.analysis-secondary-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.analysis-bars{display:flex;flex-direction:column;gap:10px}.analysis-bars button{border:0;background:transparent;padding:0;text-align:left}.analysis-bars label{display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px}.analysis-bars label strong{font:650 10px ui-monospace,monospace}.analysis-bars i,.customer-service-list i,.engineer-list i{display:block;height:7px;border-radius:5px;background:#edf1f2;overflow:hidden;position:relative}.analysis-bars b{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#159786,#6ac6b8)}
.split-distribution{display:grid;grid-template-columns:1fr 1fr;gap:24px}.split-distribution h3{margin:0 0 8px;color:#70808d;font-size:10px}.split-distribution button{width:100%;display:flex;justify-content:space-between;padding:9px 2px;border:0;border-bottom:1px solid #edf1f2;background:transparent;font-size:10px}.split-distribution strong{font:650 10px ui-monospace,monospace}
.customer-service-list,.engineer-list{display:flex;flex-direction:column}.customer-service-list button,.engineer-list button{display:grid;grid-template-columns:minmax(100px,1fr) minmax(100px,1.5fr) 65px;align-items:center;gap:12px;border:0;border-bottom:1px solid #edf1f2;background:transparent;padding:9px 2px;text-align:left;font-size:10px}.customer-service-list span small,.customer-service-list strong small,.engineer-list strong small{display:block;margin-top:3px;color:#70808d;font-size:8px}.customer-service-list i b,.engineer-list i b{display:block;height:100%;border-radius:5px;background:#159786}.customer-service-list i em,.engineer-list i em{position:absolute;left:0;bottom:0;height:2px;background:#d65d57}.customer-service-list>button>strong,.engineer-list>button>strong{text-align:right;font:650 10px ui-monospace,monospace}.coverage-note{margin:13px 0 0;padding:10px 11px;border-radius:8px;background:#fff5e4;color:#8f641e;font-size:9px;line-height:1.6}
.quality-strip{display:flex;justify-content:space-between;gap:30px;align-items:center;padding:16px 18px;border:1px solid #ead8bc;border-left:4px solid #e59a32;border-radius:10px;background:#fffaf1}.quality-strip strong,.quality-strip span{display:block}.quality-strip strong{font-size:12px}.quality-strip span,.quality-strip p{color:#806c4b;font-size:10px}.quality-strip span{margin-top:4px}.quality-strip p{max-width:560px;margin:0;line-height:1.6}
button:focus-visible,a:focus-visible{outline:3px solid rgba(21,151,134,.22);outline-offset:2px}
@media(max-width:1220px){.service-kpis{grid-template-columns:repeat(4,1fr)}.service-kpis button:nth-child(4){border-right:0}.service-kpis button:nth-child(-n+4){border-bottom:1px solid #dfe7e9}.analysis-primary-grid{grid-template-columns:1fr}.donut-wrap{grid-template-columns:180px 1fr}.service-months{gap:6px}}
@media(max-width:850px){.service-kpis{grid-template-columns:repeat(2,1fr)}.service-kpis button{border-bottom:1px solid #dfe7e9!important}.analysis-secondary-grid{grid-template-columns:1fr}.analysis-heading,.quality-strip{align-items:flex-start;flex-direction:column}.freshness{text-align:left}.service-trend-panel{overflow-x:auto}.service-months{min-width:680px}.donut-wrap{grid-template-columns:150px 1fr}}
@media(max-width:520px){.service-kpis{grid-template-columns:1fr 1fr}.service-kpis button{min-height:105px}.service-kpis strong{font-size:22px}.donut-wrap{grid-template-columns:1fr}.service-donut{margin:auto}.customer-service-list button,.engineer-list button{grid-template-columns:1fr 1fr 55px}}
</style>
