<script setup lang="ts">
import { computed } from 'vue'
import type { ConsumptionAnalysis } from '../../api/types'

const props = defineProps<{
  items: ConsumptionAnalysis['productDistribution']
  selectedProduct: string
}>()
const emit = defineEmits<{ select: [product: string] }>()

const visibleItems = computed(() => {
  const top = props.items.slice(0, 6)
  const selected = props.items.find(
    (item) => item.product === props.selectedProduct,
  )
  return selected && !top.includes(selected) ? [...top, selected] : top
})

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
  <article class="mix-card panel">
    <header>
      <div><small>PRODUCT MIX</small><h2>产品消费结构</h2></div>
      <span>金额 / 占比 / 环比</span>
    </header>
    <div v-if="visibleItems.length" class="product-mix-list">
      <button
        v-for="item in visibleItems"
        :key="item.product"
        :data-product="item.product"
        :class="{ selected: selectedProduct === item.product }"
        @click="emit('select', selectedProduct === item.product ? '' : item.product)"
      >
        <span><strong>{{ item.product }}</strong><em>{{ percent(item.changeRate) }}</em></span>
        <i><b :style="{ width: `${Math.max(item.share, item.currentAmount ? 2 : 0)}%` }"></b></i>
        <span><small>¥ {{ number(item.currentAmount) }}</small><strong>{{ item.share }}%</strong></span>
      </button>
    </div>
    <p v-else class="mix-empty">当前条件下没有产品消费数据</p>
  </article>
</template>

<style scoped>
.product-mix-list{display:flex;flex-direction:column;gap:13px}.product-mix-list button{display:grid;grid-template-columns:1fr minmax(100px,1.3fr) 110px;align-items:center;gap:14px;padding:7px 4px;border:0;border-radius:7px;background:transparent;text-align:left}.product-mix-list button:hover,.product-mix-list button.selected{background:#f3f8f7}.product-mix-list button>span{display:flex;align-items:center;justify-content:space-between;gap:8px}.product-mix-list strong{font-size:10px}.product-mix-list em{color:var(--report-muted);font:600 9px ui-monospace,monospace}.product-mix-list i{display:block;height:7px;border-radius:4px;background:#edf2f3;overflow:hidden}.product-mix-list b{display:block;height:100%;border-radius:4px;background:var(--report-teal)}.product-mix-list small{color:var(--report-muted);font:600 9px ui-monospace,monospace}.product-mix-list button>span:last-child strong{font:650 10px ui-monospace,monospace}.mix-empty{padding:40px 0;text-align:center;color:var(--report-muted);font-size:10px}@media(max-width:680px){.product-mix-list button{grid-template-columns:1fr 80px}.product-mix-list button>span:last-child{grid-column:1/-1}}
</style>
