import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProductMixChart from '../ProductMixChart.vue'
import SourceMixChart from '../SourceMixChart.vue'
import AccountRankingTable from '../AccountRankingTable.vue'
import AnomalyList from '../AnomalyList.vue'
import { accountItems, dashboardAnalysis, productItems } from './fixtures'

describe('consumption insight components', () => {
  it('emits the selected product', async () => {
    const wrapper = mount(ProductMixChart, {
      props: { items: productItems, selectedProduct: '' },
    })

    await wrapper.get('[data-product="日志"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['日志']])
  })

  it('emits the selected source', async () => {
    const wrapper = mount(SourceMixChart, {
      props: {
        items: dashboardAnalysis.sourceDistribution,
        selectedSource: 'ALL',
      },
    })

    await wrapper.get('[data-source-mix="OVERSEAS"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['OVERSEAS']])
  })

  it('sorts account results locally by change rate', async () => {
    const wrapper = mount(AccountRankingTable, {
      props: { items: accountItems, highlightAccountId: '' },
    })

    await wrapper.get('[data-sort="changeRate"]').trigger('click')

    expect(
      wrapper.findAll('[data-account-row]')[0].attributes('data-account-id'),
    ).toBe('rise')
  })

  it('emits the account to locate from an anomaly', async () => {
    const wrapper = mount(AnomalyList, { props: { items: accountItems } })

    await wrapper.get('[data-anomaly-account="drop"]').trigger('click')

    expect(wrapper.emitted('locate')).toEqual([['drop']])
  })
})
