import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CustomersView from '../src/views/CustomersView.vue'
import CustomerImportDialog from '../src/components/CustomerImportDialog.vue'

const { listCustomers, createCustomer } = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
}))

vi.mock('../src/api/customers', () => ({ listCustomers, createCustomer }))

describe('customer actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listCustomers.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 })
    createCustomer.mockResolvedValue({ id: 'c1', name: '新客户' })
  })

  it('opens the new-customer form, saves, and refreshes the real list', async () => {
    const wrapper = mount(CustomersView)
    await flushPromises()
    await wrapper.get('[data-action="new-customer"]').trigger('click')
    expect(wrapper.text()).toContain('建立客户档案')

    await wrapper.get('input[name="name"]').setValue('新客户')
    await wrapper.get('input[name="industry"]').setValue('保险')
    await wrapper.get('[data-form="customer"]').trigger('submit')
    await flushPromises()

    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ name: '新客户', industry: '保险' }))
    expect(listCustomers).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('客户档案已创建')
  })

  it('keeps the dialog open and shows a useful API error', async () => {
    createCustomer.mockRejectedValueOnce(new Error('客户名称已经存在'))
    const wrapper = mount(CustomersView)
    await flushPromises()
    await wrapper.get('[data-action="new-customer"]').trigger('click')
    await wrapper.get('input[name="name"]').setValue('太保')
    await wrapper.get('[data-form="customer"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('客户名称已经存在')
    expect(wrapper.find('[data-form="customer"]').exists()).toBe(true)
  })

  it('previews and imports valid CSV rows with partial failure feedback', async () => {
    createCustomer
      .mockResolvedValueOnce({ id: 'c1', name: '太保' })
      .mockRejectedValueOnce(new Error('客户名称已经存在'))
    const wrapper = mount(CustomerImportDialog, { props: { open: true } })
    const file = new File(['客户名称,行业\n太保,保险\n云桥科技,互联网'], 'customers.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'text', { value: () => Promise.resolve('客户名称,行业\n太保,保险\n云桥科技,互联网') })
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')
    await flushPromises()
    expect(wrapper.text()).toContain('识别到 2 家客户')

    await wrapper.get('[data-action="confirm-import"]').trigger('click')
    await flushPromises()
    expect(createCustomer).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('completed')?.[0]).toEqual([{ success: 1, failed: 1 }])
  })
})
