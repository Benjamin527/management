<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { listCustomers } from '../api/customers'
import type { Customer, CustomerStatus } from '../api/types'
import AppToast from '../components/AppToast.vue'
import CustomerDialog from '../components/CustomerDialog.vue'
import CustomerImportDialog from '../components/CustomerImportDialog.vue'
import StatusBadge from '../components/StatusBadge.vue'

const statusLabels: Record<CustomerStatus, string> = { ONBOARDING: '交接中', ACTIVE: '服务中', AT_RISK: '风险', PAUSED: '暂停', ENDED: '已结束' }
const keyword = ref('')
const customers = ref<Customer[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const customerDialogOpen = ref(false)
const importDialogOpen = ref(false)
const toast = ref({ message: '', tone: 'success' as 'success' | 'error' })
let searchTimer: ReturnType<typeof setTimeout> | undefined

function notify(message: string, tone: 'success' | 'error' = 'success') {
  toast.value = { message, tone }
  window.setTimeout(() => { if (toast.value.message === message) toast.value.message = '' }, 3200)
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const result = await listCustomers({ keyword: keyword.value.trim() || undefined, pageSize: 100 })
    customers.value = result.items
    total.value = result.total
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '客户列表加载失败'
  } finally {
    loading.value = false
  }
}

function scheduleSearch() {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(load, 260)
}

async function customerSaved() {
  customerDialogOpen.value = false
  notify('客户档案已创建')
  await load()
}

async function importCompleted(result: { success: number; failed: number }) {
  importDialogOpen.value = false
  notify(result.failed ? `已导入 ${result.success} 家，${result.failed} 家失败` : `已导入 ${result.success} 家客户`, result.failed ? 'error' : 'success')
  await load()
}

onMounted(load)
</script>

<template>
  <section class="page-stack">
    <div class="page-actions customer-actions">
      <div class="search-box">⌕<input v-model="keyword" placeholder="搜索客户名称" @input="scheduleSearch" @keyup.enter="load" /></div>
      <div><button class="ghost-button" data-action="import-customer" @click="importDialogOpen = true">导入客户</button><button class="primary-button" data-action="new-customer" @click="customerDialogOpen = true">新建客户</button></div>
    </div>
    <article class="panel table-panel">
      <header><div><small>CUSTOMER BOOK</small><h2>企业客户档案</h2></div><span>{{ total }} 家客户</span></header>
      <div v-if="loading" class="table-state">正在读取客户档案…</div>
      <div v-else-if="error" class="table-state error-state"><strong>客户列表加载失败</strong><p>{{ error }}</p><button class="ghost-button" @click="load">重新加载</button></div>
      <div v-else-if="!customers.length" class="table-state"><strong>{{ keyword ? '没有匹配的客户' : '还没有客户档案' }}</strong><p>{{ keyword ? '换一个客户名称再试试。' : '点击“新建客户”建立第一份售后档案。' }}</p></div>
      <div v-else class="customer-table">
        <div class="table-head"><span>客户</span><span>负责人</span><span>客户级别</span><span>未解决问题</span><span>状态</span></div>
        <div v-for="customer in customers" :key="customer.id" class="table-row"><div><strong>{{ customer.name }}</strong><small>{{ customer.industry || '未填写行业' }}</small></div><span>{{ customer.owner?.name || '未分配' }}</span><span>{{ customer.level || '未设置' }}</span><strong>{{ customer._count?.issues ?? 0 }}</strong><StatusBadge :status="statusLabels[customer.status]" /></div>
      </div>
    </article>
    <CustomerDialog :open="customerDialogOpen" @close="customerDialogOpen = false" @saved="customerSaved" />
    <CustomerImportDialog :open="importDialogOpen" @close="importDialogOpen = false" @completed="importCompleted" />
    <AppToast :message="toast.message" :tone="toast.tone" />
  </section>
</template>
