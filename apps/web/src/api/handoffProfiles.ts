import { apiRequest } from "./client";
import type { HandoffSyncStatus, UnmatchedHandoffProfile } from "./types";

export const getHandoffSyncStatus = () =>
  apiRequest<HandoffSyncStatus>("/admin/handoff-sync/status");

export const runHandoffSync = () =>
  apiRequest<{ accepted: boolean }>("/admin/handoff-sync/run", {
    method: "POST",
  });

export const listUnmatchedHandoffProfiles = () =>
  apiRequest<UnmatchedHandoffProfile[]>("/handoff-profiles/unmatched");

export const linkHandoffProfile = (profileId: string, customerId: string) =>
  apiRequest<{
    profileId: string;
    customerId: string;
    linkSource: "MANUAL";
    linkedAt: string;
  }>(`/handoff-profiles/${encodeURIComponent(profileId)}/link`, {
    method: "PATCH",
    body: JSON.stringify({ customerId }),
  });
