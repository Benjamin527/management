<script setup lang="ts">
import type { ConsumptionAnalysis, ConsumptionSourceFilter } from '../../api/types'

defineProps<{
  items: ConsumptionAnalysis['sourceDistribution']
  selectedSource: ConsumptionSourceFilter
}>()
const emit = defineEmits<{ select: [source: ConsumptionSourceFilter] }>()

function sourceLabel(source: 'DOMESTIC' | 'OVERSEAS') {
  return source === 'DOMESTIC' ? '国内' : '海外'
}

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  }).format(value)
}

function percent(value: number | null) {
  if (value == null) return '无法比较'
  return `${value > 0 ? '+' : ''}${number(value)}%`
}
</script>

<template>
  <article class="source-card panel">
    <header>
      <div><small>SOURCE MIX</small><h2>国内外来源结构</h2></div>
      <span>点击筛选</span>
    </header>
    <div v-if="items.length" class="source-proportion" aria-label="来源消费占比">
      <button
        v-for="item in items"
        :key="item.source"
        :data-source-mix="item.source"
        :class="[item.source.toLowerCase(), { selected: selectedSource === item.source }]"
        :style="{ flex: Math.max(item.share, 8) }"
        @click="emit('select', selectedSource === item.source ? 'ALL' : item.source)"
      >
        <span>{{ sourceLabel(item.source) }}</span><strong>{{ item.share }}%</strong>
      </button>
    </div>
    <div v-if="items.length" class="source-details">
      <button
        v-for="item in items"
        :key="item.source"
        @click="emit('select', selectedSource === item.source ? 'ALL' : item.source)"
      >
        <i :class="item.source.toLowerCase()"></i>
        <span>{{ sourceLabel(item.source) }}<small>¥ {{ number(item.currentAmount) }}</small></span>
        <strong>{{ percent(item.changeRate) }}</strong>
      </button>
    </div>
    <p v-else class="source-empty">当前条件下没有来源消费数据</p>
  </article>
</template>

<style scoped>
.source-proportion{display:flex;height:72px;border-radius:10px;overflow:hidden;background:#edf2f3}.source-proportion button{min-width:70px;border:0;padding:0 14px;color:#fff;display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding-bottom:12px}.source-proportion button.domestic{background:var(--report-teal)}.source-proportion button.overseas{background:#587f96}.source-proportion button.selected{box-shadow:inset 0 0 0 3px rgba(255,255,255,.8)}.source-proportion span{font-size:10px}.source-proportion strong{font:700 14px ui-monospace,monospace}.source-details{margin-top:14px}.source-details button{width:100%;display:grid;grid-template-columns:8px 1fr auto;align-items:center;gap:10px;padding:11px 3px;border:0;border-bottom:1px solid #edf1f2;background:transparent;text-align:left}.source-details i{width:7px;height:7px;border-radius:2px;background:var(--report-teal)}.source-details i.overseas{background:#587f96}.source-details span{font-size:10px}.source-details small{display:block;margin-top:4px;color:var(--report-muted);font-size:9px}.source-details>button>strong{font:650 10px ui-monospace,monospace}.source-empty{padding:40px 0;text-align:center;color:var(--report-muted);font-size:10px}
</style>
