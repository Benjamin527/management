import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ServiceRecordsView from '../ServiceRecordsView.vue'

const { listServiceRecords, getServiceRecord } = vi.hoisted(() => ({ listServiceRecords: vi.fn(), getServiceRecord: vi.fn() }))
vi.mock('../../api/serviceRecords', () => ({ listServiceRecords, getServiceRecord }))

const row = {
  id: 'r1', externalRecordId: 'rec1', serviceRecordNo: '4096', startDate: '2026-08-20T00:00:00.000Z', endDate: null,
  customerId: 'c1', customerName: '太保', summary: '告警通知对象调整', sourceType: '钉钉', feedbackTypeNormalized: '产品使用',
  issueTypeNormalized: '监控问题', deploymentType: 'SaaS', normalizedStatus: 'ESCALATED', sourceStatus: '已提交飞书项目',
  firstLineEngineer: '王雨轩', thirdLineEngineer: '研发甲', ticketId: null, keyIssue: false, syncedAt: '2026-08-20T18:00:00.000Z',
}

async function mountView(path = '/service-records') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/service-records', component: ServiceRecordsView }] })
  await router.push(path)
  const wrapper = mount(ServiceRecordsView, { global: { plugins: [router], stubs: { SyncStatusBar: true } } })
  return { wrapper, router }
}

describe('ServiceRecordsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listServiceRecords.mockResolvedValue({ items: [row], page: 1, pageSize: 20, total: 1 })
    getServiceRecord.mockResolvedValue({ ...row, conclusion: '已提供脚本', rawFields: { 状态: '已提交飞书项目' }, sourceUrl: 'https://example.feishu.cn/wiki/example?record=rec1' })
  })

  it('hydrates drill-down filters from the URL', async () => {
    await mountView('/service-records?status=ESCALATED&dateFrom=2026-08-01&dateTo=2026-08-31')
    await flushPromises()

    expect(listServiceRecords).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ESCALATED', dateFrom: '2026-08-01', dateTo: '2026-08-31', page: 1,
    }))
  })

  it('has no local create action and opens the selected record drawer', async () => {
    const { wrapper } = await mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('新建服务问题')
    await wrapper.get('[data-testid="record-row-r1"]').trigger('click')
    await flushPromises()

    expect(getServiceRecord).toHaveBeenCalledWith('r1')
    expect(wrapper.text()).toContain('已提供脚本')
  })
})
