export type CustomerStatus = 'ONBOARDING' | 'ACTIVE' | 'AT_RISK' | 'PAUSED' | 'ENDED'
export type IssueStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'WAITING_INTERNAL' | 'RESOLVED' | 'CLOSED'
export type IssuePriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type IssueChannel = 'FEISHU' | 'WECHAT' | 'DINGTALK' | 'PHONE' | 'EMAIL' | 'FORM' | 'OTHER'

export interface Customer {
  id: string
  name: string
  industry: string | null
  level: string | null
  status: CustomerStatus
  owner: { id: string; name: string } | null
  _count?: { issues: number }
  createdAt: string
  updatedAt: string
}

export interface CustomerDraft {
  name: string
  industry?: string
  level?: string
  status?: CustomerStatus
  ownerId?: string
}

export interface CustomerListResponse {
  items: Customer[]
  page: number
  pageSize: number
  total: number
}

export interface ServiceIssue {
  id: string
  serviceNo: string
  customerId: string
  customer: { id: string; name: string }
  title: string
  description: string
  channel: IssueChannel
  priority: IssuePriority
  status: IssueStatus
  assignee: { id: string; name: string } | null
  slaDueAt: string | null
  createdAt: string
  updatedAt: string
}

export interface IssueDraft {
  serviceNo: string
  customerId: string
  title: string
  description: string
  channel: IssueChannel
  priority?: IssuePriority
  assigneeId?: string
}

export interface ConsumptionAnalysis {
  periodDays: 7 | 30 | 60
  range: { from: string; to: string }
  unit: string | null
  kpis: {
    totalAmount: number
    previousAmount: number
    changeRate: number | null
    activeCustomers: number
    anomalyCustomers: number
  }
  trend: Array<{ date: string; amount: number }>
  productDistribution: Array<{ product: string; amount: number; unit: string | null; share: number }>
  customerRanking: Array<{
    customerId: string
    customerName: string
    owner: string | null
    amount: number
    previousAmount: number
    changeRate: number | null
    products: string[]
    lastActiveDate: string | null
  }>
  anomalies: Array<{
    customerId: string
    customerName: string
    owner: string | null
    amount: number
    previousAmount: number
    changeRate: number | null
    type: 'DROP' | 'RISE' | 'SILENT'
    reason: string
  }>
  filters: { products: string[] }
}

export interface DashboardSummary {
  kpis: {
    customerCount: number
    openIssueCount: number
    overdueIssueCount: number
    resolutionRate: number
    averageFirstResponseMinutes: number | null
    currentConsumption: number | null
    consumptionChangeRate: number | null
  }
  issueStatusDistribution: Array<{ status: IssueStatus; count: number }>
  riskCustomers: Array<{ id: string; name: string; reason: string }>
}
