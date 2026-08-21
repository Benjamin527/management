<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ConsumptionFilters } from '../../api/types'

type AccountOption = {
  id: string
  source: 'DOMESTIC' | 'OVERSEAS'
  externalId: string
  displayName: string
  managerName: string | null
}

const props = defineProps<{
  modelValue: ConsumptionFilters
  accounts: AccountOption[]
  products: string[]
  managers: string[]
  resultCount: number
}>()

const emit = defineEmits<{
  change: [patch: Partial<ConsumptionFilters>]
  reset: []
}>()

const accountSearch = ref('')
const announcement = ref('')
const mobileFiltersOpen = ref(false)

const accountLabel = (account: AccountOption) =>
  `${account.displayName} · ${account.source === 'DOMESTIC' ? '国内' : '海外'}`

watch(
  () => [props.modelValue.accountId, props.accounts] as const,
  () => {
    const selected = props.accounts.find(
      (account) => account.id === props.modelValue.accountId,
    )
    accountSearch.value = selected ? accountLabel(selected) : ''
  },
  { immediate: true },
)

const anomalyLabels = {
  SILENT: '停用',
  DROP: '明显下降',
  RISE: '异常增长',
  NORMAL: '正常',
} as const

const directionLabels = {
  UP: '上升',
  DOWN: '下降',
  FLAT: '持平',
  UNCOMPARABLE: '无法比较',
} as const

const sourceLabels = {
  DOMESTIC: '国内',
  OVERSEAS: '海外',
} as const

const activeChips = computed(() => {
  const chips: Array<{ key: keyof ConsumptionFilters; label: string }> = []
  if (props.modelValue.period !== 14) {
    chips.push({ key: 'period', label: `周期：${props.modelValue.period} 天` })
  }
  if (props.modelValue.source !== 'ALL') {
    chips.push({
      key: 'source',
      label: `来源：${sourceLabels[props.modelValue.source]}`,
    })
  }
  const account = props.accounts.find(
    (item) => item.id === props.modelValue.accountId,
  )
  if (account) chips.push({ key: 'accountId', label: `账户：${account.displayName}` })
  if (props.modelValue.product) {
    chips.push({ key: 'product', label: `产品：${props.modelValue.product}` })
  }
  if (props.modelValue.managerName) {
    chips.push({
      key: 'managerName',
      label: `负责人：${props.modelValue.managerName}`,
    })
  }
  if (props.modelValue.anomalyStatus !== 'ALL') {
    chips.push({
      key: 'anomalyStatus',
      label: `状态：${anomalyLabels[props.modelValue.anomalyStatus]}`,
    })
  }
  if (props.modelValue.direction !== 'ALL') {
    chips.push({
      key: 'direction',
      label: `变化：${directionLabels[props.modelValue.direction]}`,
    })
  }
  return chips
})

function setSource(source: ConsumptionFilters['source']) {
  if (
    props.modelValue.accountId ||
    props.modelValue.product ||
    props.modelValue.managerName
  ) {
    announcement.value = '已清除账户、产品和负责人筛选'
  }
  emit('change', {
    source,
    accountId: '',
    product: '',
    managerName: '',
  })
}

function selectAccount() {
  const normalized = accountSearch.value.trim()
  const selected = props.accounts.find(
    (account) =>
      accountLabel(account) === normalized ||
      account.displayName === normalized ||
      account.externalId === normalized,
  )
  emit('change', { accountId: selected?.id ?? '' })
}

function removeChip(key: keyof ConsumptionFilters) {
  const defaults: ConsumptionFilters = {
    period: 14,
    source: 'ALL',
    accountId: '',
    product: '',
    managerName: '',
    anomalyStatus: 'ALL',
    direction: 'ALL',
  }
  emit('change', { [key]: defaults[key] } as Partial<ConsumptionFilters>)
}
</script>

<template>
  <section class="analysis-filters" aria-label="消费分析筛选">
    <div class="filter-primary-row">
      <div class="filter-group">
        <span>分析周期</span>
        <div class="filter-segmented">
          <button
            v-for="value in [7, 14] as const"
            :key="value"
            :data-period="value"
            :class="{ active: modelValue.period === value }"
            @click="emit('change', { period: value })"
          >
            {{ value }} 天
          </button>
        </div>
      </div>
      <div class="filter-group">
        <span>数据来源</span>
        <div class="filter-segmented">
          <button
            v-for="item in [
              { value: 'ALL', label: '全部' },
              { value: 'DOMESTIC', label: '国内' },
              { value: 'OVERSEAS', label: '海外' },
            ] as const"
            :key="item.value"
            :data-source="item.value"
            :class="{ active: modelValue.source === item.value }"
            @click="setSource(item.value)"
          >
            {{ item.label }}
          </button>
        </div>
      </div>
      <span class="filter-result">{{ resultCount }} 个账户</span>
      <button
        class="mobile-filter-toggle"
        data-action="toggle-mobile-filters"
        :aria-expanded="mobileFiltersOpen"
        @click="mobileFiltersOpen = !mobileFiltersOpen"
      >
        筛选 {{ mobileFiltersOpen ? '收起' : '展开' }}
      </button>
    </div>

    <div
      class="filter-secondary-row"
      data-mobile-filters
      :data-expanded="mobileFiltersOpen"
      :class="{ 'mobile-open': mobileFiltersOpen }"
    >
      <label>
        <span>消费账户</span>
        <input
          v-model="accountSearch"
          list="consumption-account-options"
          placeholder="搜索账户"
          @change="selectAccount"
        >
        <datalist id="consumption-account-options">
          <option
            v-for="account in accounts"
            :key="account.id"
            :value="accountLabel(account)"
          />
        </datalist>
      </label>
      <label>
        <span>产品</span>
        <select
          :value="modelValue.product"
          @change="emit('change', { product: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">全部产品</option>
          <option v-for="product in products" :key="product" :value="product">
            {{ product }}
          </option>
        </select>
      </label>
      <label>
        <span>负责人</span>
        <select
          :value="modelValue.managerName"
          @change="emit('change', { managerName: ($event.target as HTMLSelectElement).value })"
        >
          <option value="">全部负责人</option>
          <option v-for="manager in managers" :key="manager" :value="manager">
            {{ manager }}
          </option>
        </select>
      </label>
      <label>
        <span>异常状态</span>
        <select
          :value="modelValue.anomalyStatus"
          @change="emit('change', { anomalyStatus: ($event.target as HTMLSelectElement).value as ConsumptionFilters['anomalyStatus'] })"
        >
          <option value="ALL">全部状态</option>
          <option value="SILENT">停用</option>
          <option value="DROP">明显下降</option>
          <option value="RISE">异常增长</option>
          <option value="NORMAL">正常</option>
        </select>
      </label>
      <label>
        <span>变化方向</span>
        <select
          :value="modelValue.direction"
          @change="emit('change', { direction: ($event.target as HTMLSelectElement).value as ConsumptionFilters['direction'] })"
        >
          <option value="ALL">全部变化</option>
          <option value="UP">上升</option>
          <option value="DOWN">下降</option>
          <option value="FLAT">持平</option>
          <option value="UNCOMPARABLE">无法比较</option>
        </select>
      </label>
    </div>

    <div v-if="activeChips.length" class="active-filter-row">
      <button
        v-for="chip in activeChips"
        :key="chip.key"
        class="filter-chip"
        @click="removeChip(chip.key)"
      >
        {{ chip.label }} <span aria-hidden="true">×</span>
      </button>
      <button data-action="clear-filters" class="clear-filters" @click="emit('reset')">
        清除全部
      </button>
    </div>
    <p class="filter-announcement" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<style scoped>
.analysis-filters{padding:16px 18px;border:1px solid var(--report-line);border-radius:14px;background:var(--report-surface)}
.filter-primary-row,.filter-secondary-row,.active-filter-row{display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap}.filter-primary-row{align-items:center}.filter-group{display:flex;align-items:center;gap:9px}.filter-group>span,.filter-secondary-row label>span{display:block;color:var(--report-muted);font-size:10px;margin-bottom:6px}.filter-group>span{margin:0}.filter-segmented{display:flex;padding:3px;border-radius:9px;background:#edf2f3}.filter-segmented button{min-height:32px;padding:0 13px;border:0;border-radius:7px;background:transparent;color:var(--report-muted);font-size:11px}.filter-segmented button.active{background:#fff;color:var(--report-ink);box-shadow:0 2px 8px rgba(23,50,71,.08)}.filter-result{margin-left:auto;color:var(--report-muted);font:600 10px ui-monospace,monospace}.mobile-filter-toggle{display:none;min-height:34px;padding:0 11px;border:1px solid var(--report-line);border-radius:8px;background:#fff;color:var(--report-teal);font-size:10px}.filter-secondary-row{margin-top:14px}.filter-secondary-row label{flex:1 1 140px}.filter-secondary-row input,.filter-secondary-row select{width:100%;height:38px;border:1px solid var(--report-line);border-radius:9px;background:#fff;padding:0 11px;color:var(--report-ink);outline:none}.filter-secondary-row input:focus,.filter-secondary-row select:focus{border-color:var(--report-teal);box-shadow:0 0 0 3px rgba(22,142,130,.12)}.active-filter-row{align-items:center;margin-top:13px;padding-top:12px;border-top:1px solid #edf1f2}.filter-chip,.clear-filters{min-height:30px;border:0;border-radius:16px;padding:0 10px;font-size:10px}.filter-chip{background:#eaf4f2;color:#176f67}.filter-chip span{margin-left:4px}.clear-filters{background:transparent;color:var(--report-muted);text-decoration:underline;text-underline-offset:3px}.filter-announcement{height:0;margin:0;overflow:hidden}
@media(max-width:680px){.filter-result{margin-left:auto}.mobile-filter-toggle{display:block}.filter-secondary-row{display:none;grid-template-columns:1fr 1fr}.filter-secondary-row.mobile-open{display:grid}.filter-secondary-row label:first-child{grid-column:1/-1}}
</style>
