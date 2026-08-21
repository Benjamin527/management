import { apiRequest } from "./client";
import type {
  ConsumptionAnalysis,
  ConsumptionFilters,
  ConsumptionSyncStatus,
} from "./types";

export function getConsumptionAnalysis(
  params: ConsumptionFilters,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    period: String(params.period),
    source: params.source,
  });
  for (const key of ["accountId", "product", "managerName"] as const) {
    if (params[key]) query.set(key, params[key]);
  }
  if (params.anomalyStatus !== "ALL") {
    query.set("anomalyStatus", params.anomalyStatus);
  }
  if (params.direction !== "ALL") query.set("direction", params.direction);
  return apiRequest<ConsumptionAnalysis>(
    `/consumption/analysis?${query.toString()}`,
    { signal },
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
