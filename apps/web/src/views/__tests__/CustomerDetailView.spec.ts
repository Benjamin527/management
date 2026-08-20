import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomerDetailView from '../CustomerDetailView.vue'

const { getCustomer, listServiceRecords } = vi.hoisted(() => ({ getCustomer: vi.fn(), listServiceRecords: vi.fn() }))
vi.mock('../../api/customers', () => ({ getCustomer }))
vi.mock('../../api/serviceRecords', () => ({ listServiceRecords }))

describe('CustomerDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCustomer.mockResolvedValue({
      id: 'c1', name: '太保', industry: '保险', level: 'A', status: 'ACTIVE', owner: { id: 'u1', name: '王雨轩', email: 'owner@example.com' },
      service2026: { total: 18, open: 3, lastServiceAt: '2026-08-19T03:20:00.000Z', monthlyTrend: [{ month: '2026-07', count: 6 }, { month: '2026-08', count: 12 }], topIssueTypes: [{ issueType: '监控问题', count: 8 }] },
    })
    listServiceRecords.mockResolvedValue({ items: [], page: 1, pageSize: 5, total: 18 })
  })

  it('shows customer service KPIs, trend and high-frequency issues', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/customers/:id', component: CustomerDetailView }] })
    await router.push('/customers/c1')
    const wrapper = mount(CustomerDetailView, { global: { plugins: [router], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()

    expect(getCustomer).toHaveBeenCalledWith('c1')
    expect(listServiceRecords).toHaveBeenCalledWith({ customerId: 'c1', page: 1, pageSize: 5 })
    expect(wrapper.text()).toContain('2026 服务记录')
    expect(wrapper.text()).toContain('监控问题')
    expect(wrapper.text()).toContain('18')
  })
})
