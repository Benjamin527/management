import { IsIn } from 'class-validator';

export const serviceSyncModes = ['recent', 'full-year'] as const;
export type ServiceSyncRequestMode = (typeof serviceSyncModes)[number];

export class RunServiceSyncDto {
  @IsIn(serviceSyncModes)
  mode!: ServiceSyncRequestMode;
}
