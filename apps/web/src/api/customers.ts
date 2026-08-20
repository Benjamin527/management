import { apiRequest } from './client'
import type { Customer, CustomerDetail, CustomerDraft, CustomerListResponse, CustomerStatus } from './types'

export function listCustomers(params: { keyword?: string; status?: CustomerStatus; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams()
  if (params.keyword) query.set('keyword', params.keyword)
  if (params.status) query.set('status', params.status)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest<CustomerListResponse>(`/customers${suffix}`)
}

export function createCustomer(input: CustomerDraft) {
  return apiRequest<Customer>('/customers', { method: 'POST', body: JSON.stringify(input) })
}

export const getCustomer = (id: string) => apiRequest<CustomerDetail>(`/customers/${encodeURIComponent(id)}`)
