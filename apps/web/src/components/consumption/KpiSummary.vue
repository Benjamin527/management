<script setup lang="ts">
import { computed } from 'vue'
import type { ConsumptionAnalysis } from '../../api/types'

const props = defineProps<{
  kpis: ConsumptionAnalysis['kpis']
  range: ConsumptionAnalysis['range']
  loading: boolean
}>()

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  }).format(value)
}

function money(value: number) {
  return `¥ ${number(value)}`
}

function percent(value: number | null) {
  if (value == null) return '无法比较'
  return `${value > 0 ? '+' : ''}${number(value)}%`
}

const items = computed(() => [
  {
    key: 'amount',
    label: '本期消费',
    value: money(props.kpis.currentAmount),
    detail: `${props.range.current.from} — ${props.range.current.to}`,
  },
  {
    key: 'change',
    label: '周期环比',
    value: percent(props.kpis.changeRate),
    detail: `本期 ${money(props.kpis.currentAmount)} / 上期 ${money(props.kpis.previousAmount)}`,
  },
  {
    key: 'average',
    label: '日均消费',
    value: money(props.kpis.dailyAverage),
    detail: '按当前周期自然日计算',
  },
  {
    key: 'active',
    label: '活跃账户',
    value: number(props.kpis.activeAccounts),
    detail: '本期存在非零消费',
  },
  {
    key: 'anomaly',
    label: '异常账户',
    value: number(props.kpis.anomalyAccounts),
    detail: '停用、下降或异常增长',
  },
])
</script>

<template>
  <section class="kpi-summary" :class="{ loading }" aria-label="消费关键指标">
    <article
      v-for="item in items"
      :key="item.key"
      :data-kpi="item.key"
      :class="{
        negative: item.key === 'change' && kpis.changeRate != null && kpis.changeRate < 0,
        attention: item.key === 'anomaly' && kpis.anomalyAccounts > 0,
      }"
    >
      <span>{{ item.label }}</span>
      <strong>{{ item.value }}</strong>
      <small>{{ item.detail }}</small>
    </article>
  </section>
</template>

<style scoped>
.kpi-summary{display:grid;grid-template-columns:1.25fr repeat(4,1fr);border:1px solid var(--report-line);border-radius:14px;background:var(--report-surface);overflow:hidden}.kpi-summary article{min-width:0;min-height:118px;padding:18px 17px;border-right:1px solid var(--report-line);position:relative}.kpi-summary article:last-child{border:0}.kpi-summary article:after{content:"";position:absolute;inset:auto 0 0;height:3px;background:#aab7bd}.kpi-summary article:first-child:after{background:var(--report-teal)}.kpi-summary article.negative:after,.kpi-summary article.attention:after{background:var(--report-danger)}span,small{display:block;color:var(--report-muted);font-size:10px}strong{display:block;margin:16px 0 9px;font:700 25px/1 ui-monospace,monospace;letter-spacing:-.05em}.negative strong,.attention strong{color:var(--report-danger)}.loading{opacity:.66}@media(max-width:980px){.kpi-summary{grid-template-columns:repeat(3,1fr)}.kpi-summary article{border-bottom:1px solid var(--report-line)}}@media(max-width:680px){.kpi-summary{display:flex;overflow-x:auto;scroll-snap-type:x mandatory}.kpi-summary article{flex:0 0 72%;scroll-snap-align:start;border-bottom:0;min-height:108px}}
</style>
