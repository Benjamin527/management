import { FeishuBaseRecord } from '../feishu/feishu-client.service';

const DEPLOYMENT_CHECKLIST_FIELD = '部署清单';
const DEPLOYMENT_CHECKLIST_MASK = '包含受保护的部署信息';

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

export interface HandoffProfileInput {
  externalRecordId: string;
  customerName: string;
  normalizedCustomerName: string;
  deploymentType: string | null;
  deploymentChecklistMasked: string | null;
  saasSites: string[] | null;
  featureUsage: string[] | null;
  logCollection: string[] | null;
  apmProbes: string[] | null;
  rumApps: string[] | null;
  handoffPeople: string[] | null;
  logCollectionNotes: string | null;
  apmNotes: string | null;
  rumNotes: string | null;
  customFeatures: string | null;
  importantIssues: string | null;
  legacyIssues: string | null;
  communicationChannel: string | null;
  contactInfo: string | null;
  handoffAt: Date | null;
  handoffStatus: string | null;
  rawFieldsMasked: JsonObject;
  sourceCreatedAt: Date | null;
  sourceUpdatedAt: Date | null;
  syncedAt: Date;
  deletedAt: null;
}

export interface MappedHandoffRecord {
  profile: HandoffProfileInput;
  deploymentChecklistSecret: string | null;
}

export function normalizeCustomerName(value: unknown): string {
  return valueText(value)
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('zh-CN');
}

export function valueText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    return value.map(valueText).filter(Boolean).join('\n');
  }
  if (value && typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    const displayText = firstValueText(cell, ['name', 'text']);
    const linkText = firstValueText(cell, ['link', 'url']);
    return [...new Set([displayText, linkText].filter(Boolean))].join('\n');
  }
  return '';
}

function firstValueText(
  value: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const text = valueText(value[key]);
    if (text) return text;
  }
  return '';
}

export function mapHandoffRecord(
  source: FeishuBaseRecord,
): MappedHandoffRecord {
  const fields = source.fields;
  const customerName = valueText(fields['客户名称']);
  if (!customerName) {
    throw new Error('客户名称 is required');
  }

  const deploymentChecklistSecret = nullableText(
    fields[DEPLOYMENT_CHECKLIST_FIELD],
  );
  const primaryCustomFeatures = nullableText(
    fields['有无非标的操作或者特别开发使用的功能'],
  );

  return {
    profile: {
      externalRecordId: source.record_id,
      customerName,
      normalizedCustomerName: normalizeCustomerName(customerName),
      deploymentType: nullableText(fields['部署方式']),
      deploymentChecklistMasked: deploymentChecklistSecret
        ? DEPLOYMENT_CHECKLIST_MASK
        : null,
      saasSites: stringList(fields['SAAS站点']),
      featureUsage: stringList(fields['功能使用统计']),
      logCollection: stringList(fields['日志采集']),
      apmProbes: stringList(fields['APM接入探针']),
      rumApps: stringList(fields['RUM应用接入']),
      handoffPeople: stringList(fields['交接人']),
      logCollectionNotes: nullableText(fields['日志采集补充']),
      apmNotes: nullableText(fields['APM接入补充']),
      rumNotes: nullableText(fields['RUM接入方式补充']),
      customFeatures:
        primaryCustomFeatures ??
        nullableText(fields['有无非标的操作或者特别开发使用的功能 副本']),
      importantIssues: nullableText(
        fields['是否解决过非常重要或者经常出现的问题'],
      ),
      legacyIssues: nullableText(fields['有无遗留的问题']),
      communicationChannel: nullableText(fields['沟通渠道']),
      contactInfo: nullableText(fields['对接人信息']),
      handoffAt: dateValue(fields['交接时间']),
      handoffStatus: nullableText(fields['交接状态']),
      rawFieldsMasked: maskedFields(fields),
      sourceCreatedAt: dateValue(source.created_time),
      sourceUpdatedAt: dateValue(source.last_modified_time),
      syncedAt: new Date(),
      deletedAt: null,
    },
    deploymentChecklistSecret,
  };
}

function nullableText(value: unknown): string | null {
  return valueText(value) || null;
}

function stringList(value: unknown): string[] | null {
  if (value === null || value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  const result = values.map(valueText).filter(Boolean);
  return result.length ? result : null;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function maskedFields(fields: Record<string, unknown>): JsonObject {
  const copy = cloneJsonObject(fields);
  if (Object.hasOwn(fields, DEPLOYMENT_CHECKLIST_FIELD)) {
    copy[DEPLOYMENT_CHECKLIST_FIELD] = DEPLOYMENT_CHECKLIST_MASK;
  }
  return copy;
}

function cloneJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
  );
}

function cloneJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw unsupportedJsonValue('non-finite number');
    return value;
  }
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value && typeof value === 'object') {
    if (value instanceof Date) throw unsupportedJsonValue('Date');
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype === Object.prototype || prototype === null) {
      return cloneJsonObject(value as Record<string, unknown>);
    }
  }
  throw unsupportedJsonValue(typeof value);
}

function unsupportedJsonValue(type: string): Error {
  return new Error(`rawFieldsMasked contains unsupported JSON value: ${type}`);
}
