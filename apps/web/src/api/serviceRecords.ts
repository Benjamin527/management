import type { ServiceRecordDetail, ServiceRecordListResponse, ServiceRecordQuery } from '../types/service'
import { apiRequest } from './client'

export function listServiceRecords(query: ServiceRecordQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const suffix = params.size ? `?${params.toString()}` : ''
  return apiRequest<ServiceRecordListResponse>(`/service-records${suffix}`)
}

export const getServiceRecord = (id: string) => apiRequest<ServiceRecordDetail>(`/service-records/${encodeURIComponent(id)}`)
