<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getDashboardSummary } from '../api/dashboard'
import type { DashboardSummary, IssueStatus } from '../api/types'
import AppToast from '../components/AppToast.vue'
import IssueDialog from '../components/IssueDialog.vue'
import KpiCard from '../components/KpiCard.vue'

const labels: Record<IssueStatus, string> = { PENDING: '待受理', IN_PROGRESS: '处理中', WAITING_CUSTOMER: '等待客户', WAITING_INTERNAL: '等待内部', RESOLVED: '已解决', CLOSED: '已关闭' }
const tones: Record<IssueStatus, string> = { PENDING: 'amber', IN_PROGRESS: 'teal', WAITING_CUSTOMER: 'blue', WAITING_INTERNAL: 'blue', RESOLVED: 'navy', CLOSED: 'navy' }
const summary = ref<DashboardSummary | null>(null)
const loading = ref(true)
const error = ref('')
const dialogOpen = ref(false)
const toast = ref('')
const maxStatus = computed(() => Math.max(...(summary.value?.issueStatusDistribution.map((item) => item.count) ?? [1]), 1))

function responseLabel(value: number | null | undefined) { return value == null ? '—' : `${value}m` }
function consumptionLabel(value: number | null | undefined) { return value == null ? '暂无数据' : new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) }

async function load() {
  loading.value = true
  error.value = ''
  try { summary.value = await getDashboardSummary() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '服务总览加载失败' }
  finally { loading.value = false }
}

async function issueSaved() {
  dialogOpen.value = false
  toast.value = '服务问题已进入队列'
  window.setTimeout(() => { toast.value = '' }, 3200)
  await load()
}

onMounted(load)
</script>

<template>
  <section class="page-stack">
    <div class="brief-strip"><div><span class="pulse-dot"></span><strong>售后服务脉冲</strong><p v-if="summary">{{ summary.kpis.openIssueCount }} 个问题处理中，{{ summary.kpis.overdueIssueCount }} 个已经超过 SLA。</p><p v-else>正在汇总今日服务状态。</p></div><button class="primary-button" data-action="new-issue" @click="dialogOpen = true">新建服务问题</button></div>
    <div v-if="loading" class="panel table-state">正在汇总售后服务数据…</div>
    <div v-else-if="error" class="panel table-state error-state"><strong>服务总览加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
    <template v-else-if="summary">
      <div class="kpi-grid"><KpiCard label="企业客户" :value="summary.kpis.customerCount" note="当前客户档案总数" tone="good"/><KpiCard label="待处理问题" :value="summary.kpis.openIssueCount" note="所有未关闭的问题"/><KpiCard label="已超时" :value="summary.kpis.overdueIssueCount" note="需要优先处理" tone="risk"/><KpiCard label="平均首次响应" :value="responseLabel(summary.kpis.averageFirstResponseMinutes)" note="目标值 30 分钟内" tone="good"/></div>
      <div class="dashboard-grid">
        <article class="panel status-panel"><header><div><small>ISSUE FLOW</small><h2>问题流转分布</h2></div><span>实时数据</span></header><div v-if="summary.issueStatusDistribution.length" class="bar-list"><div v-for="row in summary.issueStatusDistribution" :key="row.status"><label>{{ labels[row.status] }}<strong>{{ row.count }}</strong></label><div><i :class="tones[row.status]" :style="{ width: `${(row.count / maxStatus) * 100}%` }"></i></div></div></div><div v-else class="quiet-state"><span>✓</span><strong>还没有服务问题</strong></div></article>
        <article class="panel consumption-panel"><header><div><small>CONSUMPTION</small><h2>客户消费概览</h2></div><RouterLink to="/consumption">查看分析 →</RouterLink></header><div class="dashboard-consumption"><span>本月累计</span><strong>{{ consumptionLabel(summary.kpis.currentConsumption) }}</strong><small>{{ summary.kpis.currentConsumption == null ? '写入消费数据后自动展示' : '完整趋势与客户异常已进入消费分析' }}</small><RouterLink class="ghost-button" to="/consumption">进入消费分析</RouterLink></div></article>
      </div>
      <article class="panel"><header><div><small>ATTENTION QUEUE</small><h2>风险客户队列</h2></div><RouterLink to="/customers">查看全部 →</RouterLink></header><div v-if="summary.riskCustomers.length" class="risk-table"><div class="table-head"><span>客户</span><span>风险信号</span><span>等级</span><span>建议动作</span></div><div v-for="risk in summary.riskCustomers" :key="risk.id" class="table-row"><strong>{{ risk.name }}</strong><span>{{ risk.reason }}</span><span class="risk-pill">需关注</span><span>联系客户并记录进展</span></div></div><div v-else class="quiet-state dashboard-quiet"><span>✓</span><strong>当前没有人工标记的风险客户</strong><p>消费异常会在“消费分析”中单独展示。</p></div></article>
    </template>
    <IssueDialog :open="dialogOpen" @close="dialogOpen = false" @saved="issueSaved" />
    <AppToast :message="toast" />
  </section>
</template>
