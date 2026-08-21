<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ConsumptionAnalysis, ConsumptionPeriod } from '../../api/types'

const props = defineProps<{
  trend: ConsumptionAnalysis['trend']
  period: ConsumptionPeriod
}>()

const activeIndex = ref<number | null>(null)
const maxAmount = computed(() => {
  const amounts = props.trend
    .flatMap((item) => [item.currentAmount, item.previousAmount])
    .filter((value): value is number => value != null)
  return Math.max(...amounts, 1)
})

function point(index: number, amount: number) {
  const x = props.trend.length === 1
    ? 0
    : (index / (props.trend.length - 1)) * 720
  const y = 184 - (amount / maxAmount.value) * 148
  return { x, y }
}

function segments(key: 'currentAmount' | 'previousAmount') {
  const result: string[][] = []
  let active: string[] = []
  props.trend.forEach((item, index) => {
    const amount = item[key]
    if (amount === null) {
      if (active.length) result.push(active)
      active = []
      return
    }
    const { x, y } = point(index, amount)
    active.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  })
  if (active.length) result.push(active)
  return result
}

const currentSegments = computed(() => segments('currentAmount'))
const previousSegments = computed(() => segments('previousAmount'))
const activePoint = computed(() =>
  activeIndex.value == null ? null : props.trend[activeIndex.value],
)
const hasMissing = computed(() =>
  props.trend.some(
    (item) => item.currentAmount === null || item.previousAmount === null,
  ),
)

function number(value: number | null) {
  if (value == null) return '数据缺失'
  return `¥ ${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 2,
    notation: Math.abs(value) >= 100000 ? 'compact' : 'standard',
  }).format(value)}`
}

function shortDate(value: string) {
  return value.slice(5).replace('-', '/')
}
</script>

<template>
  <article class="trend-chart panel">
    <header>
      <div><small>PERIOD COMPARISON</small><h2>每日消费趋势</h2></div>
      <div class="trend-legend">
        <span><i class="current"></i>本期</span>
        <span><i class="previous"></i>上一周期</span>
      </div>
    </header>
    <div class="chart-stage">
      <span class="chart-max">{{ number(maxAmount) }}</span>
      <span class="chart-zero">¥ 0</span>
      <svg
        viewBox="0 0 720 206"
        role="img"
        :aria-label="`最近 ${period} 天与上一周期消费趋势`"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="36" x2="720" y2="36" />
        <line x1="0" y1="110" x2="720" y2="110" />
        <line x1="0" y1="184" x2="720" y2="184" />
        <g data-series="previous">
          <polyline
            v-for="(segment, index) in previousSegments"
            :key="`previous-${index}`"
            :points="segment.join(' ')"
            class="previous-line"
          />
        </g>
        <g data-series="current">
          <polyline
            v-for="(segment, index) in currentSegments"
            :key="`current-${index}`"
            :points="segment.join(' ')"
            data-series="current-segment"
            class="current-line"
          />
        </g>
      </svg>
      <div class="chart-points" aria-label="趋势数据点">
        <button
          v-for="(item, index) in trend"
          :key="item.currentDate"
          :data-point="index"
          :style="{ left: `${trend.length === 1 ? 0 : (index / (trend.length - 1)) * 100}%` }"
          :aria-label="`${item.currentDate} ${number(item.currentAmount)}`"
          @focus="activeIndex = index"
          @mouseenter="activeIndex = index"
          @blur="activeIndex = null"
          @mouseleave="activeIndex = null"
        ></button>
      </div>
      <div v-if="activePoint" class="trend-tooltip" role="tooltip">
        <div><span>本期 · {{ activePoint.currentDate }}</span><strong>{{ number(activePoint.currentAmount) }}</strong></div>
        <div><span>上期 · {{ activePoint.previousDate }}</span><strong>{{ number(activePoint.previousAmount) }}</strong></div>
      </div>
      <div class="chart-dates">
        <span>{{ shortDate(trend[0]?.currentDate ?? '') }}</span>
        <span>{{ shortDate(trend[Math.floor((trend.length - 1) / 2)]?.currentDate ?? '') }}</span>
        <span>{{ shortDate(trend.at(-1)?.currentDate ?? '') }}</span>
      </div>
    </div>
    <p v-if="hasMissing" class="missing-note">数据缺失会显示为断点，不计为零消费。</p>
  </article>
</template>

<style scoped>
.trend-chart{min-height:350px}.trend-chart header{align-items:center}.trend-legend{display:flex;gap:12px}.trend-legend span{display:flex;align-items:center;gap:6px;color:var(--report-muted);font-size:9px}.trend-legend i{width:18px;height:2px;background:var(--report-teal)}.trend-legend i.previous{height:0;border-top:2px dashed #9aabb3;background:transparent}.chart-stage{position:relative;padding:2px 8px 0 44px}.chart-stage svg{display:block;width:100%;height:220px;overflow:visible}.chart-stage svg line{stroke:var(--report-line);stroke-width:1;stroke-dasharray:3 6}.chart-stage polyline{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}.current-line{stroke:var(--report-teal)}.previous-line{stroke:#9aabb3;stroke-dasharray:7 7}.chart-max,.chart-zero{position:absolute;left:0;color:#91a0a8;font:600 9px ui-monospace,monospace}.chart-max{top:31px}.chart-zero{bottom:27px}.chart-points{position:absolute;left:44px;right:8px;top:2px;height:206px}.chart-points button{position:absolute;top:0;width:28px;height:100%;margin-left:-14px;border:0;background:transparent}.chart-points button:focus-visible{outline:2px solid rgba(22,142,130,.28);outline-offset:-2px}.trend-tooltip{position:absolute;right:18px;top:12px;z-index:2;min-width:180px;padding:10px 12px;border:1px solid var(--report-line);border-radius:9px;background:rgba(255,255,255,.96);box-shadow:0 10px 30px rgba(23,50,71,.12)}.trend-tooltip div{display:flex;justify-content:space-between;gap:16px;font-size:9px}.trend-tooltip div+div{margin-top:6px}.trend-tooltip span{color:var(--report-muted)}.trend-tooltip strong{font:650 9px ui-monospace,monospace}.chart-dates{display:flex;justify-content:space-between;color:#91a0a8;font:600 9px ui-monospace,monospace}.missing-note{margin:8px 0 0;color:var(--report-amber);font-size:9px}
</style>
