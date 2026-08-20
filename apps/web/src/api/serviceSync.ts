import type { ServiceSyncRequestMode, ServiceSyncStatus } from '../types/service'
import { apiRequest } from './client'

export const getServiceSyncStatus = () => apiRequest<ServiceSyncStatus>('/service-sync/status')
export const runServiceSync = (mode: ServiceSyncRequestMode) => apiRequest<{ accepted: true; mode: ServiceSyncRequestMode }>('/service-sync/run', {
  method: 'POST',
  body: JSON.stringify({ mode }),
})
