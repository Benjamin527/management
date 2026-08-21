<script setup lang="ts">
import type { ConsumptionAccountResult } from '../../api/types'

defineProps<{ items: ConsumptionAccountResult[] }>()
const emit = defineEmits<{ locate: [accountId: string] }>()

const labels = {
  SILENT: '本期停用',
  DROP: '明显下降',
  RISE: '异常增长',
  NORMAL: '正常',
} as const

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

function percent(value: number | null) {
  if (value == null) return '无法比较'
  return `${value > 0 ? '+' : ''}${number(value)}%`
}
</script>

<template>
  <article class="anomaly-card panel">
    <header>
      <div><small>ATTENTION QUEUE</small><h2>异常账户</h2></div>
      <span>{{ items.length }} 个信号</span>
    </header>
    <div v-if="items.length" class="anomaly-items">
      <button
        v-for="item in items"
        :key="item.accountId"
        :data-anomaly-account="item.accountId"
        :data-type="item.anomalyStatus"
        @click="emit('locate', item.accountId)"
      >
        <i></i>
        <span>
          <strong>{{ item.accountName }} <em>{{ labels[item.anomalyStatus] }}</em></strong>
          <small>{{ item.managerName || item.externalId }} · ¥ {{ number(item.currentAmount) }}</small>
          <p>{{ item.reason }}<b v-if="item.confidence === 'LOW'">低置信度</b></p>
        </span>
        <strong :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</strong>
      </button>
    </div>
    <div v-else class="anomaly-empty"><span>✓</span><strong>当前筛选范围内没有异常账户</strong><p>本期与上一周期的消费变化均在规则范围内。</p></div>
  </article>
</template>

<style scoped>
.anomaly-items{display:flex;flex-direction:column}.anomaly-items button{display:grid;grid-template-columns:8px 1fr auto;gap:11px;align-items:center;padding:12px 3px;border:0;border-bottom:1px solid #edf1f2;background:transparent;text-align:left}.anomaly-items button:hover{background:#fafcfc}.anomaly-items>button>i{width:7px;height:7px;border-radius:50%;background:var(--report-amber);box-shadow:0 0 0 4px #fff3df}.anomaly-items button[data-type="SILENT"]>i,.anomaly-items button[data-type="DROP"]>i{background:var(--report-danger);box-shadow:0 0 0 4px #fbeceb}.anomaly-items span>strong{font-size:10px}.anomaly-items em{margin-left:5px;color:var(--report-muted);font-size:8px}.anomaly-items small{display:block;margin-top:4px;color:var(--report-muted);font-size:8px}.anomaly-items p{margin:5px 0 0;color:var(--report-muted);font-size:9px}.anomaly-items p b{margin-left:5px;padding:2px 5px;border-radius:7px;background:#fff2dc;color:#9b681c;font-size:7px}.anomaly-items>button>strong{font:650 10px ui-monospace,monospace}.anomaly-empty{display:grid;place-items:center;align-content:center;min-height:230px;text-align:center}.anomaly-empty>span{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#e9f5f2;color:var(--report-teal);margin-bottom:11px}.anomaly-empty strong{font-size:11px}.anomaly-empty p{margin:6px 0 0;color:var(--report-muted);font-size:9px}
</style>
