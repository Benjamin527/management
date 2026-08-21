import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConsumptionAnalysis } from '../src/api/types'
import { dashboardAnalysis, successStatus } from '../src/components/consumption/__tests__/fixtures'
import { useAuthStore } from '../src/stores/auth'
import ConsumptionView from '../src/views/ConsumptionView.vue'

const { getConsumptionAnalysis, getConsumptionSyncStatus, runConsumptionSync } =
  vi.hoisted(() => ({
    getConsumptionAnalysis: vi.fn(),
    getConsumptionSyncStatus: vi.fn(),
    runConsumptionSync: vi.fn(),
  }))

vi.mock('../src/api/consumption', () => ({
  getConsumptionAnalysis,
  getConsumptionSyncStatus,
  runConsumptionSync,
}))

async function mountViewWithRouter(role = 'ADMIN', url = '/consumption') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = {
    id: 'user-1',
    email: 'user@example.com',
    name: '测试用户',
    role,
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/consumption', component: ConsumptionView }],
  })
  await router.push(url)
  const wrapper = mount(ConsumptionView, {
    global: { plugins: [pinia, router] },
  })
  return { wrapper, router }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

describe('ConsumptionView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConsumptionAnalysis.mockResolvedValue(dashboardAnalysis)
    getConsumptionSyncStatus.mockResolvedValue(successStatus)
    runConsumptionSync.mockResolvedValue({ accepted: true })
  })

  it('loads the comprehensive report with default filters', async () => {
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()

    expect(wrapper.text()).toContain('消费经营分析')
    expect(wrapper.text()).toContain('每日消费趋势')
    expect(wrapper.text()).toContain('产品消费结构')
    expect(wrapper.text()).toContain('国内外来源结构')
    expect(wrapper.text()).toContain('消费账户排行')
    expect(getConsumptionAnalysis).toHaveBeenCalledWith(
      {
        period: 14,
        source: 'ALL',
        accountId: '',
        product: '',
        managerName: '',
        anomalyStatus: 'ALL',
        direction: 'ALL',
      },
      expect.any(AbortSignal),
    )
  })

  it('restores URL filters and reloads when the period changes', async () => {
    const { wrapper, router } = await mountViewWithRouter(
      'ADMIN',
      '/consumption?period=7&source=DOMESTIC&managerName=王雨轩',
    )
    await flushPromises()

    expect(getConsumptionAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        period: 7,
        source: 'DOMESTIC',
        managerName: '王雨轩',
      }),
      expect.any(AbortSignal),
    )

    await wrapper.get('[data-period="14"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.period).toBeUndefined()
    expect(getConsumptionAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({ period: 14 }),
      expect.any(AbortSignal),
    )
  })

  it('writes product chart selection into the unified analysis query', async () => {
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()

    await wrapper.get('[data-product="日志"]').trigger('click')
    await flushPromises()

    expect(getConsumptionAnalysis).toHaveBeenLastCalledWith(
      expect.objectContaining({ product: '日志' }),
      expect.any(AbortSignal),
    )
  })

  it('sorts ranking locally without requesting a new scope', async () => {
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()
    const requests = getConsumptionAnalysis.mock.calls.length

    await wrapper.get('[data-sort="changeRate"]').trigger('click')

    expect(getConsumptionAnalysis).toHaveBeenCalledTimes(requests)
    expect(
      wrapper.findAll('[data-account-row]')[0].attributes('data-account-id'),
    ).toBe('rise')
  })

  it('keeps sync details collapsed and preserves role permissions', async () => {
    const { wrapper } = await mountViewWithRouter('AGENT')
    await flushPromises()

    expect(wrapper.find('[data-sync-details]').attributes('style')).toContain(
      'display: none',
    )
    await wrapper.get('[data-action="toggle-sync-details"]').trigger('click')

    expect(
      wrapper.get('[data-action="sync-consumption"]').attributes(),
    ).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('仅管理员和经理可手动同步')
  })

  it('lets an administrator start synchronization', async () => {
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()
    await wrapper.get('[data-action="toggle-sync-details"]').trigger('click')

    await wrapper.get('[data-action="sync-consumption"]').trigger('click')
    await flushPromises()

    expect(runConsumptionSync).toHaveBeenCalledTimes(1)
  })

  it('keeps old data visible while a new filter request is pending', async () => {
    const next = deferred<ConsumptionAnalysis>()
    getConsumptionAnalysis
      .mockResolvedValueOnce(dashboardAnalysis)
      .mockReturnValueOnce(next.promise)
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()

    await wrapper.get('[data-period="7"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本期消费')
    expect(wrapper.find('[data-refreshing]').exists()).toBe(true)

    next.resolve({ ...dashboardAnalysis, periodDays: 7 })
    await flushPromises()
    expect(wrapper.find('[data-refreshing]').exists()).toBe(false)
  })

  it('keeps old data and shows retry when a refresh fails', async () => {
    getConsumptionAnalysis
      .mockResolvedValueOnce(dashboardAnalysis)
      .mockRejectedValueOnce(new Error('网络异常'))
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()

    await wrapper.get('[data-period="7"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('本期消费')
    expect(wrapper.text()).toContain('网络异常')
    expect(wrapper.find('[data-action="retry-analysis"]').exists()).toBe(true)
  })

  it('renders a directed empty state without hiding the report structure', async () => {
    getConsumptionAnalysis.mockResolvedValue({
      ...dashboardAnalysis,
      kpis: {
        currentAmount: 0,
        previousAmount: 0,
        changeRate: null,
        dailyAverage: 0,
        activeAccounts: 0,
        anomalyAccounts: 0,
      },
      trend: dashboardAnalysis.trend.map((item) => ({
        ...item,
        currentAmount: 0,
        previousAmount: 0,
      })),
      productDistribution: [],
      sourceDistribution: [],
      accountRanking: [],
      anomalies: [],
      summary: ['当前筛选条件下暂无消费'],
    })
    const { wrapper } = await mountViewWithRouter()
    await flushPromises()

    expect(wrapper.text()).toContain('当前筛选条件下没有消费记录')
    expect(wrapper.text()).toContain('每日消费趋势')
  })
})
