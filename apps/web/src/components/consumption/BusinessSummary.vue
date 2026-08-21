<script setup lang="ts">
import { computed } from 'vue'
import type { ConsumptionAnalysis } from '../../api/types'

const props = defineProps<{
  summary: string[]
  missingDates: string[]
  coverage: ConsumptionAnalysis['coverage']
}>()

const confidence = computed(() =>
  props.missingDates.length ? 'low' : 'high',
)
const visibleCoverage = computed(() => props.coverage.slice(-14))
</script>

<template>
  <article class="business-summary panel" :data-confidence="confidence">
    <header>
      <div><small>MANAGEMENT NOTES</small><h2>经营摘要</h2></div>
      <span>{{ confidence === 'low' ? '低置信度' : '数据完整' }}</span>
    </header>
    <div v-if="missingDates.length" class="confidence-note">
      <strong>数据完整度影响本期结论</strong>
      <span>{{ missingDates.length }} 个日期存在来源缺口</span>
    </div>
    <ol class="summary-list">
      <li v-for="item in summary.slice(0, 3)" :key="item">{{ item }}</li>
    </ol>
    <div class="coverage-mini" aria-label="最近日期数据完整度">
      <i
        v-for="day in visibleCoverage"
        :key="day.date"
        :class="{ missing: !day.domestic || !day.overseas }"
        :title="`${day.date} · 国内${day.domestic ? '完整' : '缺失'} · 海外${day.overseas ? '完整' : '缺失'}`"
      ></i>
    </div>
  </article>
</template>

<style scoped>
.business-summary{min-height:350px}.business-summary header>span{padding:5px 8px;border-radius:12px;background:#e9f5f2;color:var(--report-teal)}.business-summary[data-confidence="low"] header>span{background:#fff2dc;color:#9b681c}.confidence-note{padding:11px 12px;border-left:3px solid var(--report-amber);border-radius:7px;background:#fff8ec}.confidence-note strong,.confidence-note span{display:block}.confidence-note strong{font-size:11px}.confidence-note span{margin-top:4px;color:#866c43;font-size:9px}.summary-list{display:flex;flex-direction:column;gap:0;margin:13px 0 18px;padding:0;list-style:none;counter-reset:findings}.summary-list li{counter-increment:findings;padding:13px 0 13px 34px;border-bottom:1px solid #edf1f2;position:relative;font-size:11px;line-height:1.55}.summary-list li:before{content:counter(findings);position:absolute;left:0;top:11px;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:#e9f5f2;color:var(--report-teal);font:650 9px ui-monospace,monospace}.coverage-mini{display:grid;grid-template-columns:repeat(14,1fr);gap:4px;margin-top:auto}.coverage-mini i{height:5px;border-radius:3px;background:var(--report-teal)}.coverage-mini i.missing{background:var(--report-amber)}
</style>
