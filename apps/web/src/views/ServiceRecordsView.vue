<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getServiceRecord, listServiceRecords } from '../api/serviceRecords'
import ServiceRecordDrawer from '../components/service/ServiceRecordDrawer.vue'
import SyncStatusBar from '../components/service/SyncStatusBar.vue'
import type { ServiceRecordDetail, ServiceRecordListItem, ServiceRecordQuery, ServiceRecordStatus } from '../types/service'

const route = useRoute()
const router = useRouter()
const records = ref<ServiceRecordListItem[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detail = ref<ServiceRecordDetail | null>(null)
const filters = reactive({ keyword: '', customer: '', status: '' as ServiceRecordStatus | '', feedbackType: '', issueType: '', sourceType: '', deploymentType: '', engineer: '', dateFrom: '', dateTo: '', page: 1, pageSize: 20 })
const tabs: Array<{ value: ServiceRecordStatus | ''; label: string }> = [
  { value: '', label: '全部' }, { value: 'WAITING_REPLY', label: '待回复' }, { value: 'IN_PROGRESS', label: '跟进中' },
  { value: 'ESCALATED', label: '飞书项目' }, { value: 'RESOLVED', label: '已解决' }, { value: 'CLOSED', label: '已关闭' }, { value: 'UNKNOWN', label: '数据缺失' },
]
const statusLabels: Record<ServiceRecordStatus, string> = { RESOLVED: '已解决', CLOSED: '已关闭', IN_PROGRESS: '跟进中', WAITING_REPLY: '待回复', ESCALATED: '飞书项目', UNKNOWN: '数据缺失', OTHER: '其他' }

function routeValue(name: string) { const value = route.query[name]; return typeof value === 'string' ? value : '' }
function hydrateRoute() {
  filters.keyword = routeValue('keyword'); filters.customer = routeValue('customer'); filters.feedbackType = routeValue('feedbackType')
  filters.issueType = routeValue('issueType'); filters.sourceType = routeValue('sourceType'); filters.deploymentType = routeValue('deploymentType')
  filters.engineer = routeValue('engineer'); filters.dateFrom = routeValue('dateFrom'); filters.dateTo = routeValue('dateTo')
  const status = routeValue('status') as ServiceRecordStatus
  filters.status = Object.prototype.hasOwnProperty.call(statusLabels, status) ? status : ''
  filters.page = Math.max(Number(routeValue('page')) || 1, 1)
}

function queryPayload(): ServiceRecordQuery {
  return {
    page: filters.page, pageSize: filters.pageSize,
    ...(filters.keyword ? { keyword: filters.keyword } : {}), ...(filters.customer ? { customer: filters.customer } : {}),
    ...(filters.status ? { status: filters.status } : {}), ...(filters.feedbackType ? { feedbackType: filters.feedbackType } : {}),
    ...(filters.issueType ? { issueType: filters.issueType } : {}), ...(filters.sourceType ? { sourceType: filters.sourceType } : {}),
    ...(filters.deploymentType ? { deploymentType: filters.deploymentType } : {}), ...(filters.engineer ? { engineer: filters.engineer } : {}),
    ...(filters.dateFrom ? { dateFrom: filters.dateFrom } : {}), ...(filters.dateTo ? { dateTo: filters.dateTo } : {}),
  }
}

async function load() {
  loading.value = true; error.value = ''
  try { const result = await listServiceRecords(queryPayload()); records.value = result.items; total.value = result.total }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '服务记录加载失败' }
  finally { loading.value = false }
}

async function applyFilters() {
  filters.page = 1
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(queryPayload())) if (value !== undefined && value !== '' && key !== 'pageSize') query[key] = String(value)
  await router.replace({ query })
  await load()
}

async function selectTab(value: ServiceRecordStatus | '') { filters.status = value; await applyFilters() }
async function pageBy(offset: number) { filters.page += offset; await applyFilters() }
function resetFilters() { Object.assign(filters, { keyword: '', customer: '', status: '', feedbackType: '', issueType: '', sourceType: '', deploymentType: '', engineer: '', dateFrom: '', dateTo: '', page: 1 }); void applyFilters() }
function shortDate(value: string) { return value.slice(0, 10) }

async function openDetail(id: string) {
  detailOpen.value = true; detailLoading.value = true; detailError.value = ''; detail.value = null
  try { detail.value = await getServiceRecord(id) }
  catch (reason) { detailError.value = reason instanceof Error ? reason.message : '详情读取失败' }
  finally { detailLoading.value = false }
}

onMounted(() => { hydrateRoute(); void load() })
</script>

<template>
  <section class="page-stack service-records-page">
    <SyncStatusBar />
    <div class="record-command"><div><span>2026 · READ-ONLY SERVICE MIRROR</span><h2>服务记录</h2><p>飞书负责录入与修改，系统负责筛选、分析和客户下钻。</p></div><strong>{{ total.toLocaleString('zh-CN') }}<small>条匹配记录</small></strong></div>
    <div class="record-tabs" role="tablist"><button v-for="tab in tabs" :key="tab.value || 'all'" :class="{ active: filters.status === tab.value }" @click="selectTab(tab.value)">{{ tab.label }}</button></div>
    <form class="record-filters" @submit.prevent="applyFilters">
      <label class="wide"><span>搜索记录</span><input v-model="filters.keyword" placeholder="编号、客户、摘要、结论或工单 ID"></label>
      <label><span>客户</span><input v-model="filters.customer" placeholder="客户名称"></label>
      <label><span>工程师</span><input v-model="filters.engineer" placeholder="一线 / 二线 / 三线"></label>
      <label><span>反馈类型</span><input v-model="filters.feedbackType" placeholder="例如 Bug"></label>
      <label><span>问题类型</span><input v-model="filters.issueType" placeholder="例如 监控问题"></label>
      <label><span>来源</span><input v-model="filters.sourceType" placeholder="飞书、微信、钉钉"></label>
      <label><span>部署形态</span><input v-model="filters.deploymentType" placeholder="SaaS / 私有部署"></label>
      <label><span>开始日期</span><input v-model="filters.dateFrom" type="date" min="2026-01-01" max="2026-12-31"></label>
      <label><span>结束日期</span><input v-model="filters.dateTo" type="date" min="2026-01-01" max="2026-12-31"></label>
      <div class="filter-actions"><button type="button" @click="resetFilters">清空</button><button type="submit">应用筛选</button></div>
    </form>

    <article class="panel records-table-panel">
      <header><div><small>SERVICE RECORD INDEX</small><h2>飞书服务记录镜像</h2></div><span>只读 · 按开始日期倒序</span></header>
      <div v-if="loading" class="table-state">正在读取 2026 年服务记录…</div>
      <div v-else-if="error" class="table-state error-state"><strong>服务记录加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
      <div v-else-if="!records.length" class="table-state"><strong>当前条件下没有服务记录</strong><p>调整筛选条件，或检查顶部最近同步状态。</p></div>
      <div v-else class="service-record-table"><div class="record-head"><span>日期 / 编号</span><span>客户与摘要</span><span>分类</span><span>来源</span><span>状态</span><span>一线工程师</span></div><button v-for="record in records" :key="record.id" :data-testid="`record-row-${record.id}`" class="record-row" @click="openDetail(record.id)"><span><strong>{{ shortDate(record.startDate) }}</strong><small>#{{ record.serviceRecordNo || record.externalRecordId }}</small></span><span><strong>{{ record.customerName }}</strong><small>{{ record.summary || '未填写反馈内容' }}</small></span><span><strong>{{ record.feedbackTypeNormalized || '未分类' }}</strong><small>{{ record.issueTypeNormalized || '未分类' }}</small></span><span><strong>{{ record.sourceType || '未填写' }}</strong><small>{{ record.deploymentType || '未填写' }}</small></span><span><b :data-status="record.normalizedStatus">{{ statusLabels[record.normalizedStatus] }}</b></span><span><strong>{{ record.firstLineEngineer || '未填写' }}</strong><small v-if="record.thirdLineEngineer">升级 {{ record.thirdLineEngineer }}</small></span></button></div>
      <footer class="pagination"><span>第 {{ filters.page }} 页 · 共 {{ total }} 条</span><div><button :disabled="filters.page <= 1" @click="pageBy(-1)">上一页</button><button :disabled="filters.page * filters.pageSize >= total" @click="pageBy(1)">下一页</button></div></footer>
    </article>
    <ServiceRecordDrawer :open="detailOpen" :loading="detailLoading" :error="detailError" :record="detail" @close="detailOpen = false" />
  </section>
</template>

<style scoped>
.record-command{display:flex;justify-content:space-between;align-items:flex-end;padding:22px 24px;border-radius:15px;background:linear-gradient(112deg,#10253b,#17384b 70%,#35506a);color:#fff}.record-command>div>span{font:650 10px ui-monospace,monospace;letter-spacing:.17em;color:#8fe0d3}.record-command h2{font-size:23px;margin:8px 0 5px}.record-command p{margin:0;color:#afc2cb;font-size:11px}.record-command>strong{font:700 30px ui-monospace,monospace;text-align:right}.record-command>strong small{display:block;color:#9db0ba;font:500 9px ui-monospace,monospace;margin-top:5px}.record-tabs{display:flex;gap:4px;padding:4px;border-radius:10px;background:#e7edef;overflow-x:auto}.record-tabs button{flex:1;min-width:82px;padding:8px 10px;border:0;border-radius:7px;background:transparent;color:#70808d;font-size:10px;white-space:nowrap}.record-tabs button.active{background:#fff;color:#10253b;box-shadow:0 2px 8px rgba(16,37,59,.08);font-weight:650}.record-filters{display:grid;grid-template-columns:1.5fr repeat(4,1fr);gap:11px;padding:17px;border:1px solid #dfe7e9;border-radius:13px;background:#fff}.record-filters label span{display:block;margin-bottom:6px;color:#70808d;font-size:9px}.record-filters input{width:100%;height:36px;border:1px solid #dfe7e9;border-radius:7px;padding:0 9px;outline:none;color:#10253b;font-size:10px}.record-filters input:focus{border-color:#159786;box-shadow:0 0 0 3px rgba(21,151,134,.09)}.record-filters .wide{grid-column:span 2}.filter-actions{display:flex;align-items:flex-end;justify-content:flex-end;gap:7px}.filter-actions button,.pagination button{height:36px;padding:0 11px;border:0;border-radius:7px;background:#eef3f4;color:#496171;font-size:10px}.filter-actions button:last-child{background:#159786;color:#fff}.service-record-table{min-width:900px}.record-head,.record-row{display:grid;grid-template-columns:115px minmax(260px,2fr) minmax(130px,1fr) 105px 100px 120px;gap:14px;align-items:center}.record-head{padding:0 10px 9px;border-bottom:1px solid #dfe7e9;color:#8997a1;font-size:9px}.record-row{width:100%;padding:13px 10px;border:0;border-bottom:1px solid #edf1f2;background:#fff;text-align:left;color:#10253b;font-size:10px}.record-row:hover{background:#f7faf9}.record-row strong,.record-row small{display:block}.record-row strong{font-size:10px}.record-row small{margin-top:4px;color:#70808d;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.record-row b{display:inline-block;padding:5px 8px;border-radius:12px;background:#dff4ef;color:#087c6c;font-size:9px}.record-row b[data-status="WAITING_REPLY"],.record-row b[data-status="UNKNOWN"]{background:#fde9e7;color:#d65d57}.record-row b[data-status="IN_PROGRESS"]{background:#fff0d6;color:#aa6b17}.record-row b[data-status="ESCALATED"]{background:#eeeaf6;color:#725f9c}.pagination{display:flex;justify-content:space-between;align-items:center;padding-top:15px}.pagination span{color:#70808d;font-size:9px}.pagination div{display:flex;gap:7px}.pagination button{height:32px}.pagination button:disabled{opacity:.45}.records-table-panel{overflow-x:auto}@media(max-width:1100px){.record-filters{grid-template-columns:repeat(3,1fr)}.record-filters .wide{grid-column:span 2}}@media(max-width:680px){.record-command{align-items:flex-start;gap:18px}.record-command>strong{font-size:24px}.record-filters{grid-template-columns:1fr 1fr}.record-filters .wide{grid-column:1/-1}.filter-actions{grid-column:1/-1}.filter-actions button{flex:1}.record-tabs button{flex:0 0 auto}}
</style>
