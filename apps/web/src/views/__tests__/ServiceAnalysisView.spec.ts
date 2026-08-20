import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ServiceAnalysisView from '../ServiceAnalysisView.vue'

const { getServiceSummary, getServiceTrend, getServiceDistribution, getServiceCustomers } = vi.hoisted(() => ({
  getServiceSummary: vi.fn(),
  getServiceTrend: vi.fn(),
  getServiceDistribution: vi.fn(),
  getServiceCustomers: vi.fn(),
}))

vi.mock('../../api/serviceAnalysis', () => ({ getServiceSummary, getServiceTrend, getServiceDistribution, getServiceCustomers }))

const summary = {
  total: 4075, waitingReply: 104, inProgress: 321, escalated: 588, bugCount: 410, bugRate: 10.06,
  resolvedOrClosedRate: 72.98, customerCount: 176,
  freshness: { lastSyncedAt: '2026-08-20T18:00:00.000Z', dataThrough: '2026-08-20T00:00:00.000Z' },
  quality: {
    firstLineEngineer: { populated: 1973, total: 4075, rate: 48.42 },
    satisfaction: { populated: 35, total: 4075, rate: 0.86 },
    ticketId: { populated: 449, total: 4075, rate: 11.02 },
    keyIssue: { populated: 30, total: 4075, rate: 0.74 },
    supportsPreciseSla: false,
  },
}

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/service-analysis', component: ServiceAnalysisView },
      { path: '/service-records', component: { template: '<div>records</div>' } },
    ],
  })
  await router.push('/service-analysis')
  const wrapper = mount(ServiceAnalysisView, {
    global: { plugins: [router], stubs: { SyncStatusBar: { template: '<div data-testid="sync-stub"></div>' } } },
  })
  return { wrapper, router }
}

describe('ServiceAnalysisView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServiceSummary.mockResolvedValue(summary)
    getServiceTrend.mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({
      month: `2026-${String(index + 1).padStart(2, '0')}`, total: 10,
      statuses: { RESOLVED: 3, CLOSED: 2, IN_PROGRESS: 1, WAITING_REPLY: 1, ESCALATED: 2, UNKNOWN: 1, OTHER: 0 },
    })))
    getServiceDistribution.mockResolvedValue([{ key: '监控问题', count: 100 }])
    getServiceCustomers.mockResolvedValue([{ customerName: '太保', total: 120, open: 8, lastServiceAt: '2026-08-20T00:00:00.000Z', topIssueType: '监控问题' }])
  })

  it('renders 2026 KPIs and drills a KPI into record filters', async () => {
    const { wrapper, router } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('2026 年服务分析')
    expect(wrapper.get('[data-testid="kpi-total"]').text()).toContain('4,075')

    await wrapper.get('[data-testid="kpi-waiting-reply"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/service-records')
    expect(router.currentRoute.value.query.status).toBe('WAITING_REPLY')
  })

  it('shows a recoverable error state', async () => {
    getServiceSummary.mockRejectedValueOnce(new Error('网络异常'))
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('服务分析加载失败')
    expect(wrapper.find('[data-action="retry-analysis"]').exists()).toBe(true)
  })
})
