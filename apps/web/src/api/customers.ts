import { apiRequest } from "./client";
import type {
  Customer,
  CustomerDetail,
  CustomerDraft,
  CustomerListResponse,
  CustomerStatus,
  HandoffState,
} from "./types";

export function listCustomers(
  params: {
    keyword?: string;
    status?: CustomerStatus;
    handoffState?: HandoffState;
    handoffStatus?: string;
    deploymentType?: string;
    hasLegacyIssues?: boolean;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const query = new URLSearchParams();
  if (params.keyword) query.set("keyword", params.keyword);
  if (params.status) query.set("status", params.status);
  if (params.handoffState && params.handoffState !== "ALL")
    query.set("handoffState", params.handoffState);
  if (params.handoffStatus) query.set("handoffStatus", params.handoffStatus);
  if (params.deploymentType) query.set("deploymentType", params.deploymentType);
  if (params.hasLegacyIssues !== undefined)
    query.set("hasLegacyIssues", String(params.hasLegacyIssues));
  if (params.page) query.set("page", String(params.page));
  if (params.pageSize) query.set("pageSize", String(params.pageSize));
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<CustomerListResponse>(`/customers${suffix}`);
}

export function createCustomer(input: CustomerDraft) {
  return apiRequest<Customer>("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export const getCustomer = (id: string) =>
  apiRequest<CustomerDetail>(`/customers/${encodeURIComponent(id)}`);
