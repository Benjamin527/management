import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DashboardView from '../src/views/DashboardView.vue'
import IssuesView from '../src/views/IssuesView.vue'

const { listIssues, createIssue, listCustomers, getDashboardSummary } = vi.hoisted(() => ({
  listIssues: vi.fn(), createIssue: vi.fn(), listCustomers: vi.fn(), getDashboardSummary: vi.fn(),
}))
vi.mock('../src/api/issues', () => ({ listIssues, createIssue }))
vi.mock('../src/api/customers', () => ({ listCustomers }))
vi.mock('../src/api/dashboard', () => ({ getDashboardSummary }))

const now = new Date()
const issues = [
  { id: 'i1', serviceNo: '5001', customerId: 'c1', customer: { id: 'c1', name: '太保' }, title: '待受理问题', description: '详情', channel: 'FEISHU', priority: 'HIGH', status: 'PENDING', assignee: null, slaDueAt: new Date(now.getTime() + 3600000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
  { id: 'i2', serviceNo: '5002', customerId: 'c1', customer: { id: 'c1', name: '太保' }, title: '已经超时的问题', description: '详情', channel: 'PHONE', priority: 'CRITICAL', status: 'IN_PROGRESS', assignee: { id: 'u1', name: '王雨轩' }, slaDueAt: new Date(now.getTime() - 3600000).toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
]

describe('issue actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listIssues.mockResolvedValue(issues)
    createIssue.mockResolvedValue(issues[0])
    listCustomers.mockResolvedValue({ items: [{ id: 'c1', name: '太保' }], page: 1, pageSize: 100, total: 1 })
    getDashboardSummary.mockResolvedValue({
      kpis: { customerCount: 1, openIssueCount: 2, overdueIssueCount: 1, resolutionRate: 50, averageFirstResponseMinutes: 18, currentConsumption: 100, consumptionChangeRate: null },
      issueStatusDistribution: [{ status: 'PENDING', count: 1 }], riskCustomers: [],
    })
  })

  it('creates an issue from the queue and refreshes it', async () => {
    const wrapper = mount(IssuesView)
    await flushPromises()
    await wrapper.get('[data-action="new-issue"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('登记服务问题')

    await wrapper.get('select[name="customerId"]').setValue('c1')
    await wrapper.get('input[name="serviceNo"]').setValue('5100')
    await wrapper.get('input[name="title"]').setValue('告警未送达')
    await wrapper.get('textarea[name="description"]').setValue('客户反馈没有收到告警消息')
    await wrapper.get('[data-form="issue"]').trigger('submit')
    await flushPromises()

    expect(createIssue).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'c1', serviceNo: '5100', title: '告警未送达' }))
    expect(listIssues).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('服务问题已进入队列')
  })

  it('filters actual queue data for pending and overdue issues', async () => {
    const wrapper = mount(IssuesView)
    await flushPromises()
    await wrapper.get('[data-filter="pending"]').trigger('click')
    expect(wrapper.text()).toContain('待受理问题')
    expect(wrapper.text()).not.toContain('已经超时的问题')

    await wrapper.get('[data-filter="overdue"]').trigger('click')
    expect(wrapper.text()).not.toContain('待受理问题')
    expect(wrapper.text()).toContain('已经超时的问题')
  })

  it('uses the same working issue dialog from the dashboard', async () => {
    const wrapper = mount(DashboardView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    await wrapper.get('[data-action="new-issue"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('登记服务问题')
    expect(listCustomers).toHaveBeenCalled()
  })
})
