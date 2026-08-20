import type { ServiceAnalysisDimension, ServiceCustomerRanking, ServiceDistributionItem, ServiceSummary, ServiceTrendMonth } from '../types/service'
import { apiRequest } from './client'

export const getServiceSummary = () => apiRequest<ServiceSummary>('/service-analysis/summary?year=2026')
export const getServiceTrend = () => apiRequest<ServiceTrendMonth[]>('/service-analysis/trend?year=2026&dimension=status')
export const getServiceDistribution = (dimension: ServiceAnalysisDimension) => apiRequest<ServiceDistributionItem[]>(`/service-analysis/distribution?year=2026&dimension=${encodeURIComponent(dimension)}`)
export const getServiceCustomers = (limit = 10) => apiRequest<ServiceCustomerRanking[]>(`/service-analysis/customers?year=2026&limit=${limit}`)
