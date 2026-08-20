<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { getCustomer } from '../api/customers'
import { listServiceRecords } from '../api/serviceRecords'
import type { CustomerDetail } from '../api/types'
import type { ServiceRecordListItem, ServiceRecordStatus } from '../types/service'

const route = useRoute()
const customer = ref<CustomerDetail | null>(null)
const records = ref<ServiceRecordListItem[]>([])
const loading = ref(true)
const error = ref('')
const maxMonth = computed(() => Math.max(...(customer.value?.service2026.monthlyTrend.map((item) => item.count) ?? [1]), 1))
const statusLabels: Record<ServiceRecordStatus, string> = { RESOLVED: '已解决', CLOSED: '已关闭', IN_PROGRESS: '跟进中', WAITING_REPLY: '待回复', ESCALATED: '飞书项目', UNKNOWN: '数据缺失', OTHER: '其他' }

function shortDate(value: string | null) { return value ? value.slice(0, 10) : '—' }
async function load() {
  loading.value = true; error.value = ''
  try {
    const id = String(route.params.id)
    const [customerResult, recordResult] = await Promise.all([getCustomer(id), listServiceRecords({ customerId: id, page: 1, pageSize: 5 })])
    customer.value = customerResult; records.value = recordResult.items
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '客户详情加载失败' }
  finally { loading.value = false }
}
onMounted(() => void load())
</script>

<template>
  <section class="page-stack customer-detail-page">
    <div v-if="loading" class="panel analysis-state"><span class="loading-orbit"></span><strong>正在整理客户服务档案</strong></div>
    <div v-else-if="error" class="panel analysis-state error-state"><strong>客户详情加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
    <template v-else-if="customer">
      <div class="customer-identity"><div><RouterLink to="/customers">← 返回客户中心</RouterLink><span>ENTERPRISE SERVICE PROFILE · 2026</span><h2>{{ customer.name }}</h2><p>{{ customer.industry || '未填写行业' }} · {{ customer.level || '未设置级别' }} · 负责人 {{ customer.owner?.name || '未分配' }}</p></div><div><RouterLink :to="`/consumption?customerId=${customer.id}`">查看消费分析</RouterLink><RouterLink class="primary" :to="`/service-records?customerId=${customer.id}`">查看全部服务记录</RouterLink></div></div>
      <div class="customer-service-kpis"><article><span>2026 服务记录</span><strong>{{ customer.service2026.total }}</strong><small>飞书只读镜像</small></article><article class="attention"><span>当前未闭环</span><strong>{{ customer.service2026.open }}</strong><small>待回复、跟进中或已升级</small></article><article><span>最近服务日期</span><strong>{{ shortDate(customer.service2026.lastServiceAt) }}</strong><small>按开始日期</small></article><article><span>负责人</span><strong>{{ customer.owner?.name || '未分配' }}</strong><small>{{ customer.owner?.email || '客户中心可继续维护' }}</small></article></div>
      <div class="customer-insight-grid"><article class="panel"><header><div><small>MONTHLY SERVICE LOAD</small><h2>月度服务趋势</h2></div><span>2026</span></header><div v-if="customer.service2026.monthlyTrend.length" class="customer-month-chart"><div v-for="item in customer.service2026.monthlyTrend" :key="item.month"><i :style="{ height: `${Math.max((item.count / maxMonth) * 150, 4)}px` }"></i><strong>{{ item.count }}</strong><span>{{ item.month.slice(5) }}月</span></div></div><div v-else class="quiet-state"><strong>暂无服务趋势</strong></div></article><article class="panel"><header><div><small>FREQUENT ISSUE TYPES</small><h2>高频问题类型</h2></div></header><div v-if="customer.service2026.topIssueTypes.length" class="customer-issues"><div v-for="item in customer.service2026.topIssueTypes" :key="item.issueType"><span>{{ item.issueType }}</span><i><b :style="{ width: `${(item.count / customer.service2026.topIssueTypes[0].count) * 100}%` }"></b></i><strong>{{ item.count }}</strong></div></div><div v-else class="quiet-state"><strong>暂无问题分类</strong></div></article></div>
      <article class="panel customer-recent-records"><header><div><small>LATEST SERVICE RECORDS</small><h2>最近服务记录</h2></div><RouterLink :to="`/service-records?customerId=${customer.id}`">查看全部 →</RouterLink></header><div v-if="records.length" class="customer-record-list"><RouterLink v-for="record in records" :key="record.id" :to="`/service-records?keyword=${encodeURIComponent(record.serviceRecordNo || record.externalRecordId)}`"><span><strong>{{ shortDate(record.startDate) }}</strong><small>#{{ record.serviceRecordNo || record.externalRecordId }}</small></span><span><strong>{{ record.summary || '未填写反馈内容' }}</strong><small>{{ record.issueTypeNormalized || '未分类' }} · {{ record.firstLineEngineer || '未填写工程师' }}</small></span><b :data-status="record.normalizedStatus">{{ statusLabels[record.normalizedStatus] }}</b></RouterLink></div><div v-else class="quiet-state"><strong>该客户暂无 2026 服务记录</strong></div></article>
    </template>
  </section>
</template>

<style scoped>
.customer-identity{display:flex;justify-content:space-between;align-items:flex-end;padding:25px 27px;border-radius:16px;background:linear-gradient(110deg,#10253b,#193e50);color:#fff}.customer-identity>div:first-child>a,.customer-identity span{display:block;color:#8fe0d3;font-size:9px}.customer-identity span{margin-top:18px;font:650 9px ui-monospace,monospace;letter-spacing:.16em}.customer-identity h2{font-size:28px;margin:8px 0 5px}.customer-identity p{margin:0;color:#adbec7;font-size:11px}.customer-identity>div:last-child{display:flex;gap:8px}.customer-identity>div:last-child a{padding:10px 12px;border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#d9e4e8;font-size:10px}.customer-identity>div:last-child a.primary{border-color:#159786;background:#159786;color:#fff}.customer-service-kpis{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #dfe7e9;border-radius:14px;background:#fff;overflow:hidden}.customer-service-kpis article{padding:18px;border-right:1px solid #dfe7e9;position:relative}.customer-service-kpis article:last-child{border:0}.customer-service-kpis article.attention:after{content:"";position:absolute;inset:auto 0 0;height:3px;background:#e59a32}.customer-service-kpis span,.customer-service-kpis small{display:block;color:#70808d;font-size:9px}.customer-service-kpis strong{display:block;margin:13px 0 8px;font:700 22px ui-monospace,monospace}.customer-insight-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.customer-month-chart{height:210px;display:flex;align-items:flex-end;gap:12px;border-bottom:1px solid #dfe7e9;padding:0 10px}.customer-month-chart>div{flex:1;display:flex;align-items:center;flex-direction:column}.customer-month-chart i{display:block;width:min(28px,70%);border-radius:5px 5px 0 0;background:linear-gradient(#159786,#83d0c5)}.customer-month-chart strong{font:650 9px ui-monospace,monospace;margin-top:5px}.customer-month-chart span{color:#70808d;font-size:8px;margin:3px 0 7px}.customer-issues{display:flex;flex-direction:column;gap:15px}.customer-issues>div{display:grid;grid-template-columns:110px 1fr 30px;gap:10px;align-items:center;font-size:10px}.customer-issues i{height:7px;border-radius:5px;background:#edf1f2;overflow:hidden}.customer-issues b{display:block;height:100%;border-radius:5px;background:#5c8fa9}.customer-issues strong{font:650 10px ui-monospace,monospace;text-align:right}.customer-record-list{display:flex;flex-direction:column}.customer-record-list>a{display:grid;grid-template-columns:110px 1fr 90px;gap:15px;align-items:center;padding:12px 8px;border-bottom:1px solid #edf1f2}.customer-record-list span strong,.customer-record-list span small{display:block}.customer-record-list span strong{font-size:10px}.customer-record-list span small{margin-top:4px;color:#70808d;font-size:9px}.customer-record-list b{width:max-content;padding:5px 8px;border-radius:12px;background:#dff4ef;color:#087c6c;font-size:9px}.customer-record-list b[data-status="WAITING_REPLY"]{background:#fde9e7;color:#d65d57}.customer-record-list b[data-status="IN_PROGRESS"]{background:#fff0d6;color:#aa6b17}.customer-record-list b[data-status="ESCALATED"]{background:#eeeaf6;color:#725f9c}@media(max-width:850px){.customer-identity{align-items:flex-start;flex-direction:column;gap:20px}.customer-service-kpis{grid-template-columns:1fr 1fr}.customer-service-kpis article:nth-child(2){border-right:0}.customer-service-kpis article:nth-child(-n+2){border-bottom:1px solid #dfe7e9}.customer-insight-grid{grid-template-columns:1fr}}@media(max-width:520px){.customer-identity>div:last-child{width:100%;flex-direction:column}.customer-identity>div:last-child a{text-align:center}.customer-record-list>a{grid-template-columns:85px 1fr}.customer-record-list b{grid-column:2}}
</style>
