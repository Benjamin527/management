import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCustomer, listCustomers } from '../src/api/customers'
import { getConsumptionAnalysis } from '../src/api/consumption'
import { createIssue, listIssues } from '../src/api/issues'

describe('typed data layer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))))
  })

  it('builds customer list filters and create payloads', async () => {
    await listCustomers({ keyword: '太保', pageSize: 50 })
    expect(fetch).toHaveBeenNthCalledWith(1, '/api/customers?keyword=%E5%A4%AA%E4%BF%9D&pageSize=50', expect.any(Object))

    await createCustomer({ name: '新客户', industry: '保险', status: 'ACTIVE' })
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/customers', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ name: '新客户', industry: '保险', status: 'ACTIVE' }),
    }))
  })

  it('uses only the supported consumption filters', async () => {
    await getConsumptionAnalysis({ days: 60, customerId: 'c1', product: '日志' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/consumption/analysis?days=60&customerId=c1&product=%E6%97%A5%E5%BF%97',
      expect.any(Object),
    )
  })

  it('lists and creates service issues', async () => {
    await listIssues({ status: 'PENDING', keyword: '告警' })
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/issues?status=PENDING&keyword=%E5%91%8A%E8%AD%A6',
      expect.any(Object),
    )

    const input = {
      serviceNo: '5001', customerId: 'c1', title: '告警未送达', description: '客户反馈未收到告警',
      channel: 'FEISHU' as const, priority: 'HIGH' as const,
    }
    await createIssue(input)
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/issues', expect.objectContaining({
      method: 'POST', body: JSON.stringify(input),
    }))
  })
})
