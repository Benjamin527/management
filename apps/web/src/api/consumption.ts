import { apiRequest } from "./client";
import type { ConsumptionAnalysis, ConsumptionSyncStatus } from "./types";

export function getConsumptionAnalysis(params: {
  source: "ALL" | "DOMESTIC" | "OVERSEAS";
  accountId?: string;
  product?: string;
}) {
  const query = new URLSearchParams({ source: params.source });
  if (params.accountId) query.set("accountId", params.accountId);
  if (params.product) query.set("product", params.product);
  return apiRequest<ConsumptionAnalysis>(
    `/consumption/analysis?${query.toString()}`,
  );
}

export function getConsumptionSyncStatus() {
  return apiRequest<ConsumptionSyncStatus>("/consumption/sync/status");
}

export function runConsumptionSync() {
  return apiRequest<{ accepted: true }>("/consumption/sync/run", {
    method: "POST",
  });
}
