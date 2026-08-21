import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import { useConsumptionFilters } from '../useConsumptionFilters'

async function setup(url: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/consumption', component: { template: '<div />' } }],
  })
  await router.push(url)
  let state!: ReturnType<typeof useConsumptionFilters>
  const Harness = defineComponent({
    setup() {
      state = useConsumptionFilters()
      return () => h('div')
    },
  })
  mount(Harness, { global: { plugins: [router] } })
  return { router, ...state }
}

describe('useConsumptionFilters', () => {
  it('restores valid consumption filters from the URL', async () => {
    const { router, filters } = await setup(
      '/consumption?period=7&source=DOMESTIC&product=日志&managerName=王雨轩&anomalyStatus=DROP&direction=DOWN',
    )

    expect(router.currentRoute.value.path).toBe('/consumption')
    expect(filters.value).toEqual({
      period: 7,
      source: 'DOMESTIC',
      accountId: '',
      product: '日志',
      managerName: '王雨轩',
      anomalyStatus: 'DROP',
      direction: 'DOWN',
    })
  })

  it('falls back to report defaults for invalid URL values', async () => {
    const { filters } = await setup(
      '/consumption?period=90&source=OTHER&direction=SIDEWAYS',
    )

    expect(filters.value.period).toBe(14)
    expect(filters.value.source).toBe('ALL')
    expect(filters.value.direction).toBe('ALL')
  })

  it('writes non-default filters to the URL', async () => {
    const { router, setFilters } = await setup('/consumption')

    await setFilters({ period: 7, product: '日志' })

    expect(router.currentRoute.value.query).toEqual({
      period: '7',
      product: '日志',
    })
  })

  it('resets all filters and clears the query string', async () => {
    const { router, reset } = await setup(
      '/consumption?period=7&product=日志',
    )

    await reset()

    expect(router.currentRoute.value.query).toEqual({})
  })
})
