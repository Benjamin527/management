<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getDashboardSummary } from '../api/dashboard'
import { getServiceSummary } from '../api/serviceAnalysis'
import { listServiceRecords } from '../api/serviceRecords'
import type { DashboardSummary } from '../api/types'
import SyncStatusBar from '../components/service/SyncStatusBar.vue'
import type { ServiceRecordListItem, ServiceRecordStatus, ServiceSummary } from '../types/service'

const dashboard = ref<DashboardSummary | null>(null)
const service = ref<ServiceSummary | null>(null)
const recentRecords = ref<ServiceRecordListItem[]>([])
const loading = ref(true)
const error = ref('')
const openCount = computed(() => (service.value?.waitingReply ?? 0) + (service.value?.inProgress ?? 0) + (service.value?.escalated ?? 0))
const statusLabels: Record<ServiceRecordStatus, string> = { RESOLVED: '已解决', CLOSED: '已关闭', IN_PROGRESS: '跟进中', WAITING_REPLY: '待回复', ESCALATED: '飞书项目', UNKNOWN: '数据缺失', OTHER: '其他' }

function compact(value: number | null | undefined) { return value == null ? '暂无数据' : new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value) }
function shortDate(value: string) { return value.slice(0, 10) }

async function load() {
  loading.value = true; error.value = ''
  try {
    const [dashboardResult, serviceResult, recordResult] = await Promise.all([
      getDashboardSummary(), getServiceSummary(), listServiceRecords({ page: 1, pageSize: 6 }),
    ])
    dashboard.value = dashboardResult; service.value = serviceResult; recentRecords.value = recordResult.items
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '服务总览加载失败' }
  finally { loading.value = false }
}

onMounted(() => void load())
</script>

<template>
  <section class="page-stack">
    <SyncStatusBar />
    <div class="brief-strip"><div><span class="pulse-dot"></span><strong>2026 企业客户服务脉冲</strong><p v-if="service">{{ openCount }} 条记录仍在服务链路中，其中 {{ service.waitingReply }} 条等待回复客户。</p><p v-else>正在汇总年度服务状态。</p></div><RouterLink class="primary-button" to="/service-records">查看服务记录</RouterLink></div>
    <div v-if="loading" class="panel table-state">正在汇总售后服务数据…</div>
    <div v-else-if="error" class="panel table-state error-state"><strong>服务总览加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
    <template v-else-if="dashboard && service">
      <div class="kpi-grid dashboard-service-kpis"><RouterLink to="/customers"><span>企业客户</span><strong>{{ dashboard.kpis.customerCount }}</strong><small>当前客户档案</small></RouterLink><RouterLink to="/service-records"><span>2026 服务记录</span><strong>{{ service.total.toLocaleString('zh-CN') }}</strong><small>飞书只读镜像</small></RouterLink><RouterLink to="/service-records?status=WAITING_REPLY" class="risk"><span>等待回复</span><strong>{{ service.waitingReply }}</strong><small>需要明确回复客户</small></RouterLink><RouterLink to="/service-analysis"><span>已解决 / 已关闭</span><strong>{{ service.resolvedOrClosedRate.toFixed(2) }}%</strong><small>年度闭环占比</small></RouterLink></div>
      <div class="dashboard-grid">
        <article class="panel status-panel"><header><div><small>OPEN SERVICE FLOW</small><h2>当前服务链路</h2></div><RouterLink to="/service-analysis">查看分析 →</RouterLink></header><div class="service-flow-list"><RouterLink to="/service-records?status=WAITING_REPLY"><i class="red"></i><span>待回复</span><strong>{{ service.waitingReply }}</strong></RouterLink><RouterLink to="/service-records?status=IN_PROGRESS"><i class="amber"></i><span>跟进中</span><strong>{{ service.inProgress }}</strong></RouterLink><RouterLink to="/service-records?status=ESCALATED"><i class="purple"></i><span>飞书项目</span><strong>{{ service.escalated }}</strong></RouterLink><RouterLink to="/service-records?feedbackType=Bug"><i class="teal"></i><span>Bug 反馈</span><strong>{{ service.bugCount }}</strong></RouterLink></div></article>
        <article class="panel consumption-panel"><header><div><small>CONSUMPTION</small><h2>客户消费概览</h2></div><RouterLink to="/consumption">查看分析 →</RouterLink></header><div class="dashboard-consumption"><span>本月累计</span><strong>{{ compact(dashboard.kpis.currentConsumption) }}</strong><small>{{ dashboard.kpis.currentConsumption == null ? '写入消费数据后自动展示' : '消费趋势与服务记录互不覆盖' }}</small><RouterLink class="ghost-button" to="/consumption">进入消费分析</RouterLink></div></article>
      </div>
      <article class="panel recent-service-panel"><header><div><small>LATEST FEISHU SERVICE RECORDS</small><h2>最近服务记录</h2></div><RouterLink to="/service-records">查看全部 →</RouterLink></header><div v-if="recentRecords.length" class="dashboard-records"><div class="dashboard-record-head"><span>日期 / 编号</span><span>客户与反馈</span><span>来源</span><span>状态</span><span>一线工程师</span></div><RouterLink v-for="record in recentRecords" :key="record.id" :to="`/service-records?keyword=${encodeURIComponent(record.serviceRecordNo || record.externalRecordId)}`" class="dashboard-record-row"><span><strong>{{ shortDate(record.startDate) }}</strong><small>#{{ record.serviceRecordNo || record.externalRecordId }}</small></span><span><strong>{{ record.customerName }}</strong><small>{{ record.summary || '未填写反馈内容' }}</small></span><span>{{ record.sourceType || '未填写' }}</span><span><b :data-status="record.normalizedStatus">{{ statusLabels[record.normalizedStatus] }}</b></span><span>{{ record.firstLineEngineer || '未填写' }}</span></RouterLink></div><div v-else class="quiet-state dashboard-quiet"><span>⌁</span><strong>等待首次 2026 全年同步</strong><p>同步完成后，最近服务记录会显示在这里。</p></div></article>
      <article class="panel"><header><div><small>ATTENTION QUEUE</small><h2>风险客户队列</h2></div><RouterLink to="/customers">查看全部 →</RouterLink></header><div v-if="dashboard.riskCustomers.length" class="risk-table"><div class="table-head"><span>客户</span><span>风险信号</span><span>等级</span><span>建议动作</span></div><div v-for="risk in dashboard.riskCustomers" :key="risk.id" class="table-row"><strong>{{ risk.name }}</strong><span>{{ risk.reason }}</span><span class="risk-pill">需关注</span><span>联系客户并记录进展</span></div></div><div v-else class="quiet-state dashboard-quiet"><span>✓</span><strong>当前没有人工标记的风险客户</strong><p>消费异常会在“消费分析”中单独展示。</p></div></article>
    </template>
  </section>
</template>

<style scoped>
.dashboard-service-kpis>a{background:#fff;border:1px solid #dfe7e9;border-radius:13px;padding:18px;min-height:126px;position:relative;overflow:hidden}.dashboard-service-kpis>a:after{content:"";position:absolute;inset:auto 0 0;height:3px;background:#159786}.dashboard-service-kpis>a.risk:after{background:#d65d57}.dashboard-service-kpis span,.dashboard-service-kpis small{display:block;color:#70808d;font-size:11px}.dashboard-service-kpis strong{display:block;font:700 29px ui-monospace,monospace;margin:14px 0 9px}.service-flow-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.service-flow-list a{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:9px;padding:13px;border:1px solid #e6edef;border-radius:10px}.service-flow-list i{width:8px;height:8px;border-radius:50%}.service-flow-list i.red{background:#d65d57}.service-flow-list i.amber{background:#e59a32}.service-flow-list i.purple{background:#725f9c}.service-flow-list i.teal{background:#159786}.service-flow-list span{font-size:11px}.service-flow-list strong{font:700 14px ui-monospace,monospace}.recent-service-panel{overflow-x:auto}.dashboard-records{min-width:760px}.dashboard-record-head,.dashboard-record-row{display:grid;grid-template-columns:110px minmax(280px,2fr) 90px 100px 110px;gap:14px;align-items:center}.dashboard-record-head{padding:0 9px 9px;border-bottom:1px solid #dfe7e9;color:#8997a1;font-size:9px}.dashboard-record-row{padding:12px 9px;border-bottom:1px solid #edf1f2;font-size:10px}.dashboard-record-row:hover{background:#f7faf9}.dashboard-record-row strong,.dashboard-record-row small{display:block}.dashboard-record-row small{margin-top:4px;color:#70808d;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dashboard-record-row b{padding:5px 7px;border-radius:12px;background:#dff4ef;color:#087c6c;font-size:9px}.dashboard-record-row b[data-status="WAITING_REPLY"]{background:#fde9e7;color:#d65d57}.dashboard-record-row b[data-status="IN_PROGRESS"]{background:#fff0d6;color:#aa6b17}.dashboard-record-row b[data-status="ESCALATED"]{background:#eeeaf6;color:#725f9c}@media(max-width:680px){.service-flow-list{grid-template-columns:1fr 1fr}}
</style>
