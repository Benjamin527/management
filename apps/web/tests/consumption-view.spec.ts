import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConsumptionView from '../src/views/ConsumptionView.vue'

const { getConsumptionAnalysis, listCustomers } = vi.hoisted(() => ({
  getConsumptionAnalysis: vi.fn(),
  listCustomers: vi.fn(),
}))

vi.mock('../src/api/consumption', () => ({ getConsumptionAnalysis }))
vi.mock('../src/api/customers', () => ({ listCustomers }))

const emptyAnalysis = {
  periodDays: 30 as const,
  range: { from: '2026-07-22', to: '2026-08-20' },
  unit: null,
  kpis: { totalAmount: 0, previousAmount: 0, changeRate: null, activeCustomers: 0, anomalyCustomers: 0 },
  trend: Array.from({ length: 30 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, '0')}`, amount: 0 })),
  productDistribution: [], customerRanking: [], anomalies: [], filters: { products: [] },
}

describe('ConsumptionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConsumptionAnalysis.mockResolvedValue(emptyAnalysis)
    listCustomers.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 })
  })

  it('offers 7, 30, and 60 days but never a longer period', async () => {
    const wrapper = mount(ConsumptionView)
    await flushPromises()

    expect(wrapper.text()).toContain('7 天')
    expect(wrapper.text()).toContain('30 天')
    expect(wrapper.text()).toContain('60 天')
    expect(wrapper.text()).not.toContain('90 天')
    expect(getConsumptionAnalysis).toHaveBeenCalledWith({ days: 30 })

    await wrapper.get('[data-period="60"]').trigger('click')
    await flushPromises()
    expect(getConsumptionAnalysis).toHaveBeenLastCalledWith({ days: 60 })
  })

  it('shows a directed empty state when no consumption records exist', async () => {
    const wrapper = mount(ConsumptionView)
    await flushPromises()
    expect(wrapper.text()).toContain('最近 30 天还没有消费数据')
    expect(wrapper.text()).toContain('数据写入后会自动形成趋势和异常信号')
  })

  it('shows a recoverable error state', async () => {
    getConsumptionAnalysis.mockRejectedValueOnce(new Error('网络异常'))
    const wrapper = mount(ConsumptionView)
    await flushPromises()
    expect(wrapper.text()).toContain('消费数据加载失败')
    expect(wrapper.find('[data-action="retry"]').exists()).toBe(true)
  })
})
