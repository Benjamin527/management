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
export type HandoffState = "ALL" | "HANDED_OVER" | "PENDING";

export interface HandoffSummary {
  profileId: string;
  deploymentType: string | null;
  handoffPeople: string[];
  handoffAt: string | null;
  handoffStatus: string | null;
  hasLegacyIssues: boolean;
  legacyIssuePreview: string | null;
  sourceUpdatedAt: string | null;
}

export interface Customer {
  id: string;
  name: string;
  industry: string | null;
  level: string | null;
  status: CustomerStatus;
  owner: { id: string; name: string } | null;
  _count?: { issues: number };
  service2026?: { total: number; open: number; lastServiceAt: string | null };
  handoffSummary?: HandoffSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  owner: { id: string; name: string; email?: string } | null;
  handoffProfile: HandoffProfileDetail | null;
  service2026: {
    total: number;
    open: number;
    lastServiceAt: string | null;
    monthlyTrend: Array<{ month: string; count: number }>;
    topIssueTypes: Array<{ issueType: string; count: number }>;
  };
}

export interface HandoffProfileDetail {
  profileId: string;
  externalRecordId: string;
  deploymentType: string | null;
  deploymentChecklistMasked: string | null;
  saasSites: string[];
  featureUsage: string[];
  logCollection: string[];
  logCollectionNotes: string | null;
  apmProbes: string[];
  apmNotes: string | null;
  rumApps: string[];
  rumNotes: string | null;
  customFeatures: string | null;
  handoffPeople: string[];
  handoffAt: string | null;
  handoffStatus: string | null;
  importantIssues: string | null;
  legacyIssues: string | null;
  communicationChannel: string | null;
  contactInfo: string | null;
  sourceUpdatedAt: string | null;
  syncedAt: string | null;
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
  handoffOverview: {
    customerTotal: number;
    handedOver: number;
    pending: number;
    unmatched: number;
    legacyIssues: number;
  };
}

export interface UnmatchedHandoffProfile {
  profileId: string;
  externalRecordId: string;
  customerName: string;
  deploymentType: string | null;
  handoffPeople: string[];
  handoffAt: string | null;
  handoffStatus: string | null;
  sourceUpdatedAt: string | null;
}

export interface HandoffSyncRun {
  id?: string;
  status?: "RUNNING" | "SUCCESS" | "FAILED";
  readCount?: number;
  startedAt?: string;
  finishedAt: string | null;
}

export interface HandoffSyncStatus {
  enabled: boolean;
  running: boolean;
  lastSuccessfulRun: HandoffSyncRun | null;
  lastRun: HandoffSyncRun | null;
  nextScheduledAt: string | null;
  sourceUrl: string | null;
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

export type ConsumptionPeriod = 7 | 14;
export type ConsumptionSourceFilter = "ALL" | "DOMESTIC" | "OVERSEAS";
export type ConsumptionAnomalyStatus =
  | "ALL" | "SILENT" | "DROP" | "RISE" | "NORMAL";
export type ConsumptionDirection =
  | "ALL" | "UP" | "DOWN" | "FLAT" | "UNCOMPARABLE";
export type ConsumptionAnomalyState = Exclude<ConsumptionAnomalyStatus, "ALL">;
export type ConsumptionDirectionState = Exclude<ConsumptionDirection, "ALL">;

export interface ConsumptionFilters {
  period: ConsumptionPeriod;
  source: ConsumptionSourceFilter;
  accountId: string;
  product: string;
  managerName: string;
  anomalyStatus: ConsumptionAnomalyStatus;
  direction: ConsumptionDirection;
}

export interface ConsumptionAccountResult {
  accountId: string;
  externalId: string;
  accountName: string;
  source: Exclude<ConsumptionSourceFilter, "ALL">;
  managerName: string | null;
  currentAmount: number;
  previousAmount: number;
  changeRate: number | null;
  direction: ConsumptionDirectionState;
  anomalyStatus: ConsumptionAnomalyState;
  products: string[];
  lastActiveDate: string | null;
  reason: string | null;
  confidence: "HIGH" | "LOW";
}

export interface ConsumptionAnalysis {
  periodDays: ConsumptionPeriod;
  source: ConsumptionSourceFilter;
  range: {
    current: { from: string; to: string };
    previous: { from: string; to: string };
  };
  dataThrough: string;
  lastSyncedAt: string | null;
  unit: "CNY";
  kpis: {
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    dailyAverage: number;
    activeAccounts: number;
    anomalyAccounts: number;
  };
  trend: Array<{
    index: number;
    currentDate: string;
    previousDate: string;
    currentAmount: number | null;
    previousAmount: number | null;
  }>;
  coverage: Array<{ date: string; domestic: boolean; overseas: boolean }>;
  missingDates: string[];
  productDistribution: Array<{
    product: string;
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    share: number;
  }>;
  sourceDistribution: Array<{
    source: Exclude<ConsumptionSourceFilter, "ALL">;
    currentAmount: number;
    previousAmount: number;
    changeRate: number | null;
    share: number;
  }>;
  accountRanking: ConsumptionAccountResult[];
  anomalies: ConsumptionAccountResult[];
  summary: string[];
  filters: {
    products: string[];
    managers: string[];
    accounts: Array<{
      id: string;
      source: Exclude<ConsumptionSourceFilter, "ALL">;
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
