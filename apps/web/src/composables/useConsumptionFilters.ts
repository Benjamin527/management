import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ConsumptionFilters } from '../api/types'

export const defaultConsumptionFilters: ConsumptionFilters = {
  period: 14,
  source: 'ALL',
  accountId: '',
  product: '',
  managerName: '',
  anomalyStatus: 'ALL',
  direction: 'ALL',
}

const periods = new Set(['7', '14'])
const sources = new Set(['ALL', 'DOMESTIC', 'OVERSEAS'])
const anomalies = new Set(['ALL', 'SILENT', 'DROP', 'RISE', 'NORMAL'])
const directions = new Set(['ALL', 'UP', 'DOWN', 'FLAT', 'UNCOMPARABLE'])

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function parse(query: Record<string, unknown>): ConsumptionFilters {
  const period = text(query.period)
  const source = text(query.source)
  const anomalyStatus = text(query.anomalyStatus)
  const direction = text(query.direction)
  return {
    period: periods.has(period) ? Number(period) as 7 | 14 : 14,
    source: sources.has(source)
      ? source as ConsumptionFilters['source']
      : 'ALL',
    accountId: text(query.accountId),
    product: text(query.product),
    managerName: text(query.managerName),
    anomalyStatus: anomalies.has(anomalyStatus)
      ? anomalyStatus as ConsumptionFilters['anomalyStatus']
      : 'ALL',
    direction: directions.has(direction)
      ? direction as ConsumptionFilters['direction']
      : 'ALL',
  }
}

function serialize(value: ConsumptionFilters) {
  const query: Record<string, string> = {}
  if (value.period !== 14) query.period = String(value.period)
  if (value.source !== 'ALL') query.source = value.source
  if (value.accountId) query.accountId = value.accountId
  if (value.product) query.product = value.product
  if (value.managerName) query.managerName = value.managerName
  if (value.anomalyStatus !== 'ALL') {
    query.anomalyStatus = value.anomalyStatus
  }
  if (value.direction !== 'ALL') query.direction = value.direction
  return query
}

export function useConsumptionFilters() {
  const route = useRoute()
  const router = useRouter()
  const filters = ref(parse(route.query))
  const activeFilters = computed(() =>
    Object.entries(filters.value).filter(
      ([key, value]) =>
        value !== defaultConsumptionFilters[key as keyof ConsumptionFilters],
    ),
  )

  watch(
    () => route.query,
    (query) => {
      filters.value = parse(query)
    },
  )

  async function setFilters(patch: Partial<ConsumptionFilters>) {
    const next = { ...filters.value, ...patch }
    filters.value = next
    await router.replace({ query: serialize(next) })
  }

  function removeFilter(key: keyof ConsumptionFilters) {
    return setFilters({
      [key]: defaultConsumptionFilters[key],
    } as Partial<ConsumptionFilters>)
  }

  async function reset() {
    filters.value = { ...defaultConsumptionFilters }
    await router.replace({ query: {} })
  }

  return { filters, activeFilters, setFilters, removeFilter, reset }
}
