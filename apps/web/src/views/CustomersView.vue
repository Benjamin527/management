<script setup lang="ts">
import { computed, ref } from 'vue'
import StatusBadge from '../components/StatusBadge.vue'
const keyword = ref('')
const customers = [
  { name: '太保', industry: '保险', level: '战略客户', owner: '王雨轩', consumption: '1.28M', change: '-38%', issues: 3, status: '风险' },
  { name: '华东制造', industry: '制造业', level: '重点客户', owner: '陈嘉', consumption: '846K', change: '+12%', issues: 2, status: '服务中' },
  { name: '云桥科技', industry: '互联网', level: '成长客户', owner: '李敏', consumption: '392K', change: '-8%', issues: 0, status: '关注' },
  { name: '远洋零售', industry: '零售', level: '标准客户', owner: '王雨轩', consumption: '218K', change: '+6%', issues: 1, status: '服务中' },
]
const filtered = computed(() => customers.filter((item) => item.name.includes(keyword.value)))
</script>
<template><section class="page-stack"><div class="page-actions"><div class="search-box">⌕<input v-model="keyword" placeholder="搜索客户名称" /></div><div><button class="ghost-button">导入客户</button><button class="primary-button">新建客户</button></div></div><article class="panel table-panel"><header><div><small>CUSTOMER BOOK</small><h2>企业客户档案</h2></div><span>{{ filtered.length }} 家客户</span></header><div class="customer-table"><div class="table-head"><span>客户</span><span>负责人</span><span>本月消费</span><span>未解决问题</span><span>状态</span></div><div v-for="customer in filtered" :key="customer.name" class="table-row"><div><strong>{{ customer.name }}</strong><small>{{ customer.industry }} · {{ customer.level }}</small></div><span>{{ customer.owner }}</span><div><strong>{{ customer.consumption }}</strong><small :class="customer.change.startsWith('-') ? 'negative' : 'positive'">{{ customer.change }}</small></div><span>{{ customer.issues }}</span><StatusBadge :status="customer.status" /></div></div></article></section></template>
