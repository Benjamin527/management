import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardView from '../src/views/DashboardView.vue'

const { getDashboardSummary, getServiceSummary, listServiceRecords } = vi.hoisted(() => ({
  getDashboardSummary: vi.fn(), getServiceSummary: vi.fn(), listServiceRecords: vi.fn(),
}))
vi.mock('../src/api/dashboard', () => ({ getDashboardSummary }))
vi.mock('../src/api/serviceAnalysis', () => ({ getServiceSummary }))
vi.mock('../src/api/serviceRecords', () => ({ listServiceRecords }))

describe('read-only service dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDashboardSummary.mockResolvedValue({
      kpis: { customerCount: 176, openIssueCount: 0, overdueIssueCount: 0, resolutionRate: 0, averageFirstResponseMinutes: null, currentConsumption: 100, consumptionChangeRate: null },
      issueStatusDistribution: [], riskCustomers: [],
    })
    getServiceSummary.mockResolvedValue({
      total: 4075, waitingReply: 104, inProgress: 321, escalated: 588, bugCount: 410, bugRate: 10.06,
      resolvedOrClosedRate: 72.98, customerCount: 176, freshness: { lastSyncedAt: null, dataThrough: '2026-08-20T00:00:00.000Z' },
      quality: { firstLineEngineer: { populated: 1973, total: 4075, rate: 48.42 }, satisfaction: { populated: 35, total: 4075, rate: .86 }, ticketId: { populated: 449, total: 4075, rate: 11.02 }, keyIssue: { populated: 30, total: 4075, rate: .74 }, supportsPreciseSla: false },
    })
    listServiceRecords.mockResolvedValue({
      items: [{ id: 'r1', serviceRecordNo: '4096', customerName: '太保', summary: '告警通知对象调整', normalizedStatus: 'ESCALATED', sourceType: '钉钉', startDate: '2026-08-20T00:00:00.000Z', firstLineEngineer: '王雨轩' }],
      page: 1, pageSize: 6, total: 4075,
    })
  })

  it('shows the 2026 service mirror without local issue creation', async () => {
    const wrapper = mount(DashboardView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, SyncStatusBar: true } } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('新建服务问题')
    expect(wrapper.text()).toContain('查看服务记录')
    expect(wrapper.text()).toContain('告警通知对象调整')
    expect(listServiceRecords).toHaveBeenCalledWith({ page: 1, pageSize: 6 })
  })
})
