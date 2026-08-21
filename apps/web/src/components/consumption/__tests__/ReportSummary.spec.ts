import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AnalysisHeader from '../AnalysisHeader.vue'
import KpiSummary from '../KpiSummary.vue'
import { dashboardAnalysis } from './fixtures'

describe('consumption report summary', () => {
  it('shows the report freshness and opens synchronization details', async () => {
    const wrapper = mount(AnalysisHeader, {
      props: {
        period: 14,
        dataThrough: dashboardAnalysis.dataThrough,
        lastSyncedAt: dashboardAnalysis.lastSyncedAt,
        syncing: false,
        refreshing: false,
      },
    })

    expect(wrapper.text()).toContain('消费经营分析')
    expect(wrapper.text()).toContain('2026-08-20')
    await wrapper.get('[data-action="open-sync"]').trigger('click')
    expect(wrapper.emitted('open-sync')).toHaveLength(1)
  })

  it('renders five KPIs with equal-period comparison values', () => {
    const wrapper = mount(KpiSummary, {
      props: {
        kpis: dashboardAnalysis.kpis,
        range: dashboardAnalysis.range,
        loading: false,
      },
    })

    expect(wrapper.findAll('article')).toHaveLength(5)
    expect(wrapper.text()).toContain('本期消费')
    expect(wrapper.text()).toContain('周期环比')
    expect(wrapper.text()).toContain('日均消费')
    expect(wrapper.text()).toContain('活跃账户')
    expect(wrapper.text()).toContain('异常账户')
  })
})
