import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PeriodTrendChart from '../PeriodTrendChart.vue'
import BusinessSummary from '../BusinessSummary.vue'
import { dashboardAnalysis } from './fixtures'

const completeTrend = dashboardAnalysis.trend

describe('PeriodTrendChart', () => {
  it('renders current and previous period paths', () => {
    const wrapper = mount(PeriodTrendChart, {
      props: { trend: completeTrend, period: 14 },
    })

    expect(wrapper.find('[data-series="current"]').exists()).toBe(true)
    expect(wrapper.find('[data-series="previous"]').exists()).toBe(true)
  })

  it('breaks the current line where source data is missing', () => {
    const wrapper = mount(PeriodTrendChart, {
      props: {
        period: 14,
        trend: completeTrend.map((item, index) =>
          index === 2 ? { ...item, currentAmount: null } : item,
        ),
      },
    })

    expect(wrapper.findAll('[data-series="current-segment"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('数据缺失')
  })

  it('shows both actual dates and amounts for a focused point', async () => {
    const wrapper = mount(PeriodTrendChart, {
      props: { trend: completeTrend, period: 14 },
    })

    await wrapper.get('[data-point="2"]').trigger('focus')

    expect(wrapper.get('[role="tooltip"]').text()).toContain(
      completeTrend[2].currentDate,
    )
    expect(wrapper.get('[role="tooltip"]').text()).toContain(
      completeTrend[2].previousDate,
    )
  })
})

describe('BusinessSummary', () => {
  it('marks findings as low confidence when coverage is incomplete', () => {
    const wrapper = mount(BusinessSummary, {
      props: {
        summary: dashboardAnalysis.summary,
        missingDates: ['2026-08-16'],
        coverage: dashboardAnalysis.coverage.map((day) =>
          day.date === '2026-08-16' ? { ...day, overseas: false } : day,
        ),
      },
    })

    expect(wrapper.attributes('data-confidence')).toBe('low')
    expect(wrapper.text()).toContain('数据完整度影响本期结论')
  })
})
