<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listIssues } from '../api/issues'
import type { IssueChannel, IssuePriority, IssueStatus, ServiceIssue } from '../api/types'
import AppToast from '../components/AppToast.vue'
import IssueDialog from '../components/IssueDialog.vue'
import StatusBadge from '../components/StatusBadge.vue'

type QueueFilter = 'all' | 'pending' | 'progress' | 'overdue'
const statusLabels: Record<IssueStatus, string> = { PENDING: '待受理', IN_PROGRESS: '处理中', WAITING_CUSTOMER: '等待客户', WAITING_INTERNAL: '等待内部', RESOLVED: '已解决', CLOSED: '已关闭' }
const channelLabels: Record<IssueChannel, string> = { FEISHU: '飞书', WECHAT: '微信', DINGTALK: '钉钉', PHONE: '电话', EMAIL: '邮件', FORM: '表单', OTHER: '其他' }
const priorityLabels: Record<IssuePriority, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '急' }
const filter = ref<QueueFilter>('all')
const issues = ref<ServiceIssue[]>([])
const loading = ref(true)
const error = ref('')
const dialogOpen = ref(false)
const toast = ref('')
const openStatuses: IssueStatus[] = ['PENDING', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL']

function isOverdue(issue: ServiceIssue) {
  return Boolean(issue.slaDueAt && openStatuses.includes(issue.status) && new Date(issue.slaDueAt).getTime() < Date.now())
}

const filtered = computed(() => issues.value.filter((issue) => {
  if (filter.value === 'pending') return issue.status === 'PENDING'
  if (filter.value === 'progress') return ['IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_INTERNAL'].includes(issue.status)
  if (filter.value === 'overdue') return isOverdue(issue)
  return true
}))

function duration(issue: ServiceIssue) {
  if (isOverdue(issue)) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(issue.slaDueAt!).getTime()) / 60000))
    return `已超时 ${minutes >= 60 ? `${Math.floor(minutes / 60)} 小时` : `${minutes} 分`}`
  }
  const minutes = Math.max(1, Math.round((Date.now() - new Date(issue.createdAt).getTime()) / 60000))
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)} 天`
  if (minutes >= 60) return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`
  return `${minutes} 分钟`
}

async function load() {
  loading.value = true
  error.value = ''
  try { issues.value = await listIssues() }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '服务队列加载失败' }
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
    <div class="page-actions issue-actions">
      <div class="segmented"><button data-filter="all" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button><button data-filter="pending" :class="{ active: filter === 'pending' }" @click="filter = 'pending'">待受理</button><button data-filter="progress" :class="{ active: filter === 'progress' }" @click="filter = 'progress'">处理中</button><button data-filter="overdue" :class="{ active: filter === 'overdue' }" @click="filter = 'overdue'">已超时</button></div>
      <button class="primary-button" data-action="new-issue" @click="dialogOpen = true">新建服务问题</button>
    </div>
    <article class="panel table-panel">
      <header><div><small>SERVICE QUEUE</small><h2>服务问题队列</h2></div><span>{{ filtered.length }} 条 · 按更新时间排序</span></header>
      <div v-if="loading" class="table-state">正在读取服务问题…</div>
      <div v-else-if="error" class="table-state error-state"><strong>服务队列加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
      <div v-else-if="!filtered.length" class="table-state"><strong>当前筛选下没有服务问题</strong><p>新问题登记后会立即进入这里。</p></div>
      <div v-else class="issue-table"><div class="table-head"><span>编号 / 客户</span><span>问题</span><span>优先级</span><span>状态</span><span>负责人</span><span>处理时长</span></div><div v-for="issue in filtered" :key="issue.id" class="table-row"><div><strong>#{{ issue.serviceNo }}</strong><small>{{ issue.customer.name }} · {{ channelLabels[issue.channel] }}</small></div><strong>{{ issue.title }}</strong><span :class="['priority', `priority-${issue.priority.toLowerCase()}`]">{{ priorityLabels[issue.priority] }}</span><StatusBadge :status="statusLabels[issue.status]"/><span>{{ issue.assignee?.name || '未分配' }}</span><span :class="{ negative: isOverdue(issue) }">{{ duration(issue) }}</span></div></div>
    </article>
    <IssueDialog :open="dialogOpen" @close="dialogOpen = false" @saved="issueSaved" />
    <AppToast :message="toast" />
  </section>
</template>
