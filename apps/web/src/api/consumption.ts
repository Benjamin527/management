import { apiRequest } from './client'
import type { ConsumptionAnalysis } from './types'

export function getConsumptionAnalysis(params: { days: 7 | 30 | 60; customerId?: string; product?: string }) {
  const query = new URLSearchParams({ days: String(params.days) })
  if (params.customerId) query.set('customerId', params.customerId)
  if (params.product) query.set('product', params.product)
  return apiRequest<ConsumptionAnalysis>(`/consumption/analysis?${query.toString()}`)
}
