<script setup lang="ts">
import type { ConsumptionPeriod } from '../../api/types'

defineProps<{
  period: ConsumptionPeriod
  dataThrough: string
  lastSyncedAt: string | null
  syncing: boolean
  refreshing: boolean
}>()

defineEmits<{ 'open-sync': [] }>()

function dateTime(value: string | null) {
  if (!value) return '尚未成功同步'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
</script>

<template>
  <header class="analysis-header">
    <div>
      <span class="analysis-eyebrow">CONSUMPTION BUSINESS REVIEW</span>
      <h2>消费经营分析</h2>
      <p>从趋势、结构、账户表现和异常变化，复盘最近 {{ period }} 天消费。</p>
    </div>
    <div class="analysis-freshness">
      <span>数据截至</span>
      <strong>{{ dataThrough || '等待同步' }}</strong>
      <button data-action="open-sync" @click="$emit('open-sync')">
        <i :class="{ running: syncing || refreshing }"></i>
        {{ syncing ? '正在同步' : refreshing ? '正在刷新' : `${dateTime(lastSyncedAt)} 更新` }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.analysis-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:8px 2px 2px}.analysis-eyebrow{font:650 10px ui-monospace,monospace;letter-spacing:.18em;color:var(--report-teal)}h2{margin:8px 0 6px;font-size:27px;letter-spacing:-.045em}p{margin:0;color:var(--report-muted);font-size:12px}.analysis-freshness{text-align:right}.analysis-freshness>span{display:block;color:var(--report-muted);font-size:10px}.analysis-freshness>strong{display:block;margin:4px 0 6px;font:700 18px ui-monospace,monospace}.analysis-freshness button{display:inline-flex;align-items:center;gap:7px;min-height:30px;padding:0;border:0;background:transparent;color:var(--report-muted);font-size:10px}.analysis-freshness i{width:7px;height:7px;border-radius:50%;background:var(--report-teal)}.analysis-freshness i.running{animation:report-pulse 1s ease-in-out infinite}@keyframes report-pulse{50%{opacity:.35;transform:scale(.8)}}@media(max-width:680px){.analysis-header{align-items:flex-start;flex-direction:column}.analysis-freshness{text-align:left}}
</style>
