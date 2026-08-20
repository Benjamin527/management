import { apiRequest } from './client'
import type { IssueDraft, IssueStatus, ServiceIssue } from './types'

export function listIssues(params: { status?: IssueStatus; customerId?: string; keyword?: string } = {}) {
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.customerId) query.set('customerId', params.customerId)
  if (params.keyword) query.set('keyword', params.keyword)
  const suffix = query.size ? `?${query.toString()}` : ''
  return apiRequest<ServiceIssue[]>(`/issues${suffix}`)
}

export function createIssue(input: IssueDraft) {
  return apiRequest<ServiceIssue>('/issues', { method: 'POST', body: JSON.stringify(input) })
}
