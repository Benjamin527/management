<script setup lang="ts">
import { ref } from 'vue'
import StatusBadge from '../components/StatusBadge.vue'
const filter = ref('全部')
const issues = [
  { no: '4096', customer: '太保', title: '告警策略追加太好钉机器人', channel: '钉钉', priority: '高', status: '已解决', owner: '王雨轩', time: '28 分钟' },
  { no: '4102', customer: '华东制造', title: '日志索引查询结果不完整', channel: '飞书', priority: '中', status: '处理中', owner: '陈嘉', time: '1 小时 12 分' },
  { no: '4105', customer: '云桥科技', title: '消费数据连续两日未更新', channel: '电话', priority: '高', status: '待受理', owner: '李敏', time: '已超时 18 分' },
  { no: '4108', customer: '远洋零售', title: '新增成员无法收到通知', channel: '表单', priority: '低', status: '等待客户', owner: '王雨轩', time: '3 小时' },
]
</script>
<template><section class="page-stack"><div class="page-actions"><div class="segmented"><button v-for="item in ['全部','待受理','处理中','已超时']" :key="item" :class="{ active: filter === item }" @click="filter = item">{{ item }}</button></div><button class="primary-button">新建服务问题</button></div><article class="panel table-panel"><header><div><small>SERVICE QUEUE</small><h2>服务问题队列</h2></div><span>按更新时间排序</span></header><div class="issue-table"><div class="table-head"><span>编号 / 客户</span><span>问题</span><span>优先级</span><span>状态</span><span>负责人</span><span>处理时长</span></div><div v-for="issue in issues" :key="issue.no" class="table-row"><div><strong>#{{ issue.no }}</strong><small>{{ issue.customer }} · {{ issue.channel }}</small></div><strong>{{ issue.title }}</strong><span :class="['priority', issue.priority]">{{ issue.priority }}</span><StatusBadge :status="issue.status"/><span>{{ issue.owner }}</span><span :class="{ negative: issue.time.includes('超时') }">{{ issue.time }}</span></div></div></article></section></template>
