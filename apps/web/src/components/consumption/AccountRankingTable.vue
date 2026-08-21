<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ConsumptionAccountResult } from '../../api/types'

const props = defineProps<{
  items: ConsumptionAccountResult[]
  highlightAccountId: string
}>()

type SortKey = 'currentAmount' | 'changeRate' | 'lastActiveDate'
const sortKey = ref<SortKey>('currentAmount')
const sortDirection = ref<'asc' | 'desc'>('desc')

function comparable(item: ConsumptionAccountResult, key: SortKey) {
  const value = item[key]
  if (value == null) return Number.NEGATIVE_INFINITY
  if (typeof value === 'string') return new Date(`${value}T00:00:00Z`).getTime()
  return value
}

const sortedItems = computed(() =>
  [...props.items].sort((left, right) => {
    const delta = comparable(left, sortKey.value) - comparable(right, sortKey.value)
    return sortDirection.value === 'asc' ? delta : -delta
  }),
)

function sort(key: SortKey) {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === 'desc' ? 'asc' : 'desc'
  } else {
    sortKey.value = key
    sortDirection.value = 'desc'
  }
}

watch(
  () => props.highlightAccountId,
  async (accountId) => {
    if (!accountId) return
    await nextTick()
    const element = document.querySelector<HTMLElement>(
      `[data-account-id="${CSS.escape(accountId)}"]`,
    )
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    element?.scrollIntoView({
      block: 'center',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
  },
)

function number(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
}

function percent(value: number | null) {
  if (value == null) return '无法比较'
  return `${value > 0 ? '+' : ''}${number(value)}%`
}

function sourceLabel(value: 'DOMESTIC' | 'OVERSEAS') {
  return value === 'DOMESTIC' ? '国内' : '海外'
}
</script>

<template>
  <article class="ranking-card panel">
    <header>
      <div><small>ACCOUNT PERFORMANCE</small><h2>消费账户排行</h2></div>
      <span>{{ items.length }} 个账户</span>
    </header>
    <div v-if="items.length" class="ranking-table-new">
      <div class="ranking-head">
        <span>账户 / 负责人</span><span>来源 / 产品</span>
        <button data-sort="currentAmount" @click="sort('currentAmount')">本期金额</button>
        <button data-sort="changeRate" @click="sort('changeRate')">周期环比</button>
        <button data-sort="lastActiveDate" @click="sort('lastActiveDate')">最近消费</button>
      </div>
      <div
        v-for="item in sortedItems"
        :key="item.accountId"
        class="ranking-row"
        data-account-row
        :data-account-id="item.accountId"
        :class="{ highlighted: highlightAccountId === item.accountId }"
      >
        <div><strong>{{ item.accountName }}</strong><small>{{ item.managerName || item.externalId }}</small></div>
        <span><em :class="item.source.toLowerCase()">{{ sourceLabel(item.source) }}</em>{{ item.products.join('、') }}</span>
        <strong>¥ {{ number(item.currentAmount) }}</strong>
        <span :class="item.changeRate != null && item.changeRate < 0 ? 'negative' : 'positive'">{{ percent(item.changeRate) }}</span>
        <span>{{ item.lastActiveDate || '—' }}</span>
      </div>
    </div>
    <div v-if="items.length" class="ranking-mobile">
      <article v-for="item in sortedItems" :key="item.accountId" :data-account-id="item.accountId">
        <div><strong>{{ item.accountName }}</strong><em :class="item.source.toLowerCase()">{{ sourceLabel(item.source) }}</em></div>
        <span>{{ item.managerName || item.externalId }}</span>
        <dl><div><dt>本期金额</dt><dd>¥ {{ number(item.currentAmount) }}</dd></div><div><dt>周期环比</dt><dd>{{ percent(item.changeRate) }}</dd></div></dl>
      </article>
    </div>
    <p v-else class="ranking-empty">当前条件下没有消费账户</p>
  </article>
</template>

<style scoped>
.ranking-head,.ranking-row{display:grid;grid-template-columns:1.4fr 1fr .75fr .65fr .75fr;gap:12px;align-items:center}.ranking-head{padding:0 8px 9px;border-bottom:1px solid var(--report-line);color:var(--report-muted);font-size:9px}.ranking-head button{border:0;background:transparent;padding:0;text-align:left;color:inherit;font-size:9px}.ranking-row{padding:12px 8px;border-bottom:1px solid #edf1f2;font-size:10px}.ranking-row.highlighted{background:#eef8f6}.ranking-row strong{font-size:10px}.ranking-row small{display:block;margin-top:4px;color:var(--report-muted);font-size:9px}.ranking-row em,.ranking-mobile em{display:inline-block;margin-right:6px;padding:3px 5px;border-radius:9px;background:#e7f4f1;color:var(--report-teal);font-size:8px}.ranking-row em.overseas,.ranking-mobile em.overseas{background:#e9f0f4;color:#587f96}.ranking-row>strong{font:650 10px ui-monospace,monospace}.ranking-mobile{display:none}.ranking-empty{padding:40px 0;text-align:center;color:var(--report-muted);font-size:10px}@media(max-width:680px){.ranking-table-new{display:none}.ranking-mobile{display:grid;gap:10px}.ranking-mobile>article{padding:13px;border:1px solid var(--report-line);border-radius:10px}.ranking-mobile>article>div{display:flex;justify-content:space-between}.ranking-mobile>article>span{display:block;margin-top:5px;color:var(--report-muted);font-size:9px}.ranking-mobile dl{display:grid;grid-template-columns:1fr 1fr;margin:12px 0 0}.ranking-mobile dl>div{margin:0}.ranking-mobile dt{color:var(--report-muted);font-size:8px}.ranking-mobile dd{margin:4px 0 0;font:650 10px ui-monospace,monospace}}
</style>
