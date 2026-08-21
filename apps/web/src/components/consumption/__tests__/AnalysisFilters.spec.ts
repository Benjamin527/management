import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { ConsumptionFilters } from '../../../api/types'
import AnalysisFilters from '../AnalysisFilters.vue'
import { baseFilters, dashboardAnalysis } from './fixtures'

function mountFilters(patch: Partial<ConsumptionFilters> = {}) {
  return mount(AnalysisFilters, {
    props: {
      modelValue: { ...baseFilters, ...patch },
      accounts: dashboardAnalysis.filters.accounts,
      products: dashboardAnalysis.filters.products,
      managers: dashboardAnalysis.filters.managers,
      resultCount: dashboardAnalysis.accountRanking.length,
    },
  })
}

describe('AnalysisFilters', () => {
  it('emits a patch when period and source change', async () => {
    const wrapper = mountFilters()

    await wrapper.get('[data-period="7"]').trigger('click')
    await wrapper.get('[data-source="DOMESTIC"]').trigger('click')

    expect(wrapper.emitted('change')).toEqual([
      [{ period: 7 }],
      [
        {
          source: 'DOMESTIC',
          accountId: '',
          product: '',
          managerName: '',
        },
      ],
    ])
  })

  it('renders active condition chips and clears them', async () => {
    const wrapper = mountFilters({ product: '日志', managerName: '王雨轩' })

    expect(wrapper.text()).toContain('产品：日志')
    expect(wrapper.text()).toContain('负责人：王雨轩')
    await wrapper.get('[data-action="clear-filters"]').trigger('click')

    expect(wrapper.emitted('reset')).toHaveLength(1)
  })

  it('announces dependent filters cleared by a source change', async () => {
    const wrapper = mountFilters({ product: '日志', managerName: '王雨轩' })

    await wrapper.get('[data-source="OVERSEAS"]').trigger('click')

    expect(wrapper.get('[aria-live="polite"]').text()).toContain(
      '已清除账户、产品和负责人筛选',
    )
  })

  it('toggles the secondary mobile filter region', async () => {
    const wrapper = mountFilters()

    expect(wrapper.get('[data-mobile-filters]').attributes('data-expanded')).toBe(
      'false',
    )
    await wrapper.get('[data-action="toggle-mobile-filters"]').trigger('click')

    expect(wrapper.get('[data-mobile-filters]').attributes('data-expanded')).toBe(
      'true',
    )
  })
})
