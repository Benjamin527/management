export type CustomerStatus =
  "ONBOARDING" | "ACTIVE" | "AT_RISK" | "PAUSED" | "ENDED";
export type IssueStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "WAITING_CUSTOMER"
  | "WAITING_INTERNAL"
  | "RESOLVED"
  | "CLOSED";
export type IssuePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IssueChannel =
  "FEISHU" | "WECHAT" | "DINGTALK" | "PHONE" | "EMAIL" | "FORM" | "OTHER";

export interface Customer {
  id: string;
  name: string;
  industry: string | null;
  level: string | null;
  status: CustomerStatus;
  owner: { id: string; name: string } | null;
  _count?: { issues: number };
  service2026?: { total: number; open: number; lastServiceAt: string | null };
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  owner: { id: string; name: string; email?: string } | null;
  service2026: {
    total: number;
    open: number;
    lastServiceAt: string | null;
    monthlyTrend: Array<{ month: string; count: number }>;
    topIssueTypes: Array<{ issueType: string; count: number }>;
  };
}

export interface CustomerDraft {
  name: string;
  industry?: string;
  level?: string;
  status?: CustomerStatus;
  ownerId?: string;
}

export interface CustomerListResponse {
  items: Customer[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ServiceIssue {
  id: string;
  serviceNo: string;
  customerId: string;
  customer: { id: string; name: string };
  title: string;
  description: string;
  channel: IssueChannel;
  priority: IssuePriority;
  status: IssueStatus;
  assignee: { id: string; name: string } | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueDraft {
  serviceNo: string;
  customerId: string;
  title: string;
  description: string;
  channel: IssueChannel;
  priority?: IssuePriority;
  assigneeId?: string;
}

export interface ConsumptionAnalysis {
  periodDays: 14;
  source: "ALL" | "DOMESTIC" | "OVERSEAS";
  range: { from: string; to: string };
  dataThrough: string;
  lastSyncedAt: string | null;
  unit: "CNY";
  kpis: {
    totalAmount: number;
    recent7Amount: number;
    previous7Amount: number;
    changeRate: number | null;
    activeAccounts: number;
    anomalyAccounts: number;
  };
  trend: Array<{ date: string; amount: number }>;
  coverage: Array<{ date: string; domestic: boolean; overseas: boolean }>;
  availableDates: string[];
  missingDates: string[];
  productDistribution: Array<{
    product: string;
    amount: number;
    unit: string | null;
    share: number;
  }>;
  accountRanking: Array<{
    accountId: string;
    externalId: string;
    accountName: string;
    source: "DOMESTIC" | "OVERSEAS";
    managerName: string | null;
    amount: number;
    recent7Amount: number;
    previous7Amount: number;
    changeRate: number | null;
    products: string[];
    lastActiveDate: string | null;
  }>;
  anomalies: Array<{
    accountId: string;
    externalId: string;
    accountName: string;
    source: "DOMESTIC" | "OVERSEAS";
    managerName: string | null;
    amount: number;
    recent7Amount: number;
    previous7Amount: number;
    changeRate: number | null;
    type: "DROP" | "RISE" | "SILENT";
    reason: string;
    confidence: "HIGH" | "LOW";
  }>;
  filters: {
    products: string[];
    accounts: Array<{
      id: string;
      source: "DOMESTIC" | "OVERSEAS";
      externalId: string;
      displayName: string;
      managerName: string | null;
    }>;
  };
}

export interface ConsumptionSyncRun {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  rangeStart: string;
  rangeEnd: string;
  readCount: number;
  accountCount: number;
  rowCount: number;
  errorSummary: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ConsumptionSyncStatus {
  enabled: boolean;
  running: boolean;
  lastSuccessfulRun: ConsumptionSyncRun | null;
  lastRun: ConsumptionSyncRun | null;
  nextScheduledAt: string | null;
}

export interface DashboardSummary {
  kpis: {
    customerCount: number;
    openIssueCount: number;
    overdueIssueCount: number;
    resolutionRate: number;
    averageFirstResponseMinutes: number | null;
    currentConsumption: number | null;
    consumptionChangeRate: number | null;
  };
  issueStatusDistribution: Array<{ status: IssueStatus; count: number }>;
  riskCustomers: Array<{ id: string; name: string; reason: string }>;
}
