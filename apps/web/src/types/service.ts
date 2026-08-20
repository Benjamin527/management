export type ServiceRecordStatus = 'RESOLVED' | 'CLOSED' | 'IN_PROGRESS' | 'WAITING_REPLY' | 'ESCALATED' | 'UNKNOWN' | 'OTHER'
export type ServiceSyncMode = 'RECENT' | 'FULL_YEAR'
export type ServiceSyncRequestMode = 'recent' | 'full-year'
export type ServiceSyncRunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED'
export type ServiceAnalysisDimension = 'status' | 'feedbackType' | 'issueType' | 'sourceType' | 'deploymentType' | 'engineer'

export interface CoverageMetric { populated: number; total: number; rate: number }

export interface ServiceSummary {
  total: number
  waitingReply: number
  inProgress: number
  escalated: number
  bugCount: number
  bugRate: number
  resolvedOrClosedRate: number
  customerCount: number
  freshness: { lastSyncedAt: string | null; dataThrough: string | null }
  quality: {
    firstLineEngineer: CoverageMetric
    satisfaction: CoverageMetric
    ticketId: CoverageMetric
    keyIssue: CoverageMetric
    supportsPreciseSla: false
  }
}

export interface ServiceTrendMonth {
  month: string
  total: number
  statuses: Record<ServiceRecordStatus, number>
}

export interface ServiceDistributionItem { key: string; count: number; thirdLineEscalated?: number }

export interface ServiceCustomerRanking {
  customerName: string
  total: number
  open: number
  lastServiceAt: string
  topIssueType: string | null
}

export interface ServiceSyncRun {
  id: string
  mode: ServiceSyncMode
  status: ServiceSyncRunStatus
  rangeStart: string
  rangeEnd: string
  readCount: number
  createdCount: number
  updatedCount: number
  deletedCount: number
  failedCount: number
  errorSummary: string | null
  startedAt: string
  finishedAt: string | null
}

export interface ServiceSyncStatus {
  enabled: boolean
  running: boolean
  lastSuccessfulRun: ServiceSyncRun | null
  lastRun: ServiceSyncRun | null
  nextScheduledAt: string | null
  sourceUrl: string
}

export interface ServiceRecordListItem {
  id: string
  externalRecordId: string
  serviceRecordNo: string | null
  startDate: string
  endDate: string | null
  customerId: string | null
  customerName: string
  summary: string
  sourceType: string | null
  feedbackTypeNormalized: string | null
  issueTypeNormalized: string | null
  deploymentType: string | null
  normalizedStatus: ServiceRecordStatus
  sourceStatus: string | null
  firstLineEngineer: string | null
  thirdLineEngineer: string | null
  ticketId: string | null
  keyIssue: boolean
  syncedAt: string
}

export interface ServiceRecordDetail extends ServiceRecordListItem {
  questionerRole: string | null
  feedbackTypeRaw: string | null
  issueTypeRaw: string | null
  conclusion: string | null
  satisfaction: number | null
  secondLineEngineer: string | null
  submittedByName: string | null
  submittedByOpenId: string | null
  submittedAt: string | null
  rawFields: Record<string, unknown>
  sourceCreatedAt: string | null
  sourceUpdatedAt: string | null
  sourceUrl: string
}

export interface ServiceRecordQuery {
  page?: number
  pageSize?: number
  keyword?: string
  customer?: string
  customerId?: string
  status?: ServiceRecordStatus
  feedbackType?: string
  issueType?: string
  sourceType?: string
  deploymentType?: string
  engineer?: string
  dateFrom?: string
  dateTo?: string
}

export interface ServiceRecordListResponse {
  items: ServiceRecordListItem[]
  page: number
  pageSize: number
  total: number
}
