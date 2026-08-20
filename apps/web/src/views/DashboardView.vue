<script setup lang="ts">
import KpiCard from '../components/KpiCard.vue'

const statusRows = [
  { label: '待受理', count: 12, width: 46, tone: 'amber' },
  { label: '处理中', count: 9, width: 35, tone: 'teal' },
  { label: '等待客户', count: 5, width: 20, tone: 'blue' },
  { label: '已解决', count: 26, width: 100, tone: 'navy' },
]
const risks = [
  { name: '太保', reason: '近 7 日消费下降 38%', level: '高风险', owner: '王雨轩' },
  { name: '华东制造', reason: '2 个问题已超过 SLA', level: '需关注', owner: '陈嘉' },
  { name: '云桥科技', reason: '连续 14 天无活跃数据', level: '需关注', owner: '李敏' },
]
</script>
<template>
  <section class="page-stack">
    <div class="brief-strip"><div><span class="pulse-dot"></span><strong>今日服务脉冲正常</strong><p>3 个新问题已进入队列，1 个高优先级问题需要关注。</p></div><button class="primary-button">新建服务问题</button></div>
    <div class="kpi-grid"><KpiCard label="服务中客户" :value="48" note="本月新增 3 家" tone="good"/><KpiCard label="待处理问题" :value="26" note="较昨日减少 4 条"/><KpiCard label="已超时" :value="3" note="其中 1 条为高优先级" tone="risk"/><KpiCard label="平均首次响应" value="18m" note="目标值 30 分钟内" tone="good"/></div>
    <div class="dashboard-grid">
      <article class="panel status-panel"><header><div><small>ISSUE FLOW</small><h2>问题流转分布</h2></div><span>近 30 天</span></header><div class="bar-list"><div v-for="row in statusRows" :key="row.label"><label>{{ row.label }}<strong>{{ row.count }}</strong></label><div><i :class="row.tone" :style="{ width: `${row.width}%` }"></i></div></div></div></article>
      <article class="panel consumption-panel"><header><div><small>CONSUMPTION</small><h2>客户消费趋势</h2></div><span>待接入</span></header><div class="empty-chart"><div class="wave-placeholder"><i v-for="n in 12" :key="n" :style="{ height: `${18 + (n * 13) % 58}px` }"></i></div><strong>消费数据源尚未配置</strong><p>完成服务端数据源配置后，这里会展示趋势和异常客户。</p></div></article>
    </div>
    <article class="panel"><header><div><small>ATTENTION QUEUE</small><h2>风险客户队列</h2></div><RouterLink to="/customers">查看全部 →</RouterLink></header><div class="risk-table"><div class="table-head"><span>客户</span><span>风险信号</span><span>等级</span><span>负责人</span></div><div v-for="risk in risks" :key="risk.name" class="table-row"><strong>{{ risk.name }}</strong><span>{{ risk.reason }}</span><span class="risk-pill">{{ risk.level }}</span><span>{{ risk.owner }}</span></div></div></article>
  </section>
</template>
