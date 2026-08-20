import { FeishuBaseRecord } from '../feishu/feishu-client.service';
import { Prisma } from '../generated/prisma/client';
import {
  ServiceRecordStatus,
  type ServiceRecordStatus as ServiceRecordStatusType,
} from '../generated/prisma/enums';

const STATUS_MAP: Record<string, ServiceRecordStatusType> = {
  已解决: ServiceRecordStatus.RESOLVED,
  已关闭: ServiceRecordStatus.CLOSED,
  跟进中: ServiceRecordStatus.IN_PROGRESS,
  待回复: ServiceRecordStatus.WAITING_REPLY,
  已提交飞书项目: ServiceRecordStatus.ESCALATED,
};

const ISSUE_TYPE_MAP: Record<string, string> = {
  datakit问题: 'DataKit 问题',
  'datakit 问题': 'DataKit 问题',
  func问题: 'Func 问题',
  'func 问题': 'Func 问题',
};

export function normalizeStatus(value: unknown): ServiceRecordStatusType {
  const source = textValue(value);
  if (!source) return ServiceRecordStatus.UNKNOWN;
  return STATUS_MAP[source] ?? ServiceRecordStatus.OTHER;
}

export function normalizeIssueType(value: unknown): string | null {
  const source = textValue(value);
  if (!source) return null;
  return ISSUE_TYPE_MAP[source.toLowerCase()] ?? source.replace(/\s+/g, ' ');
}

export function mapServiceRecord(
  record: FeishuBaseRecord,
): Prisma.FeishuServiceRecordUncheckedCreateInput {
  if (!record.record_id.trim()) {
    throw new Error('record_id is required');
  }

  const fields = record.fields;
  const startDate = dateValue(fields['开始日期']);
  if (!startDate) {
    throw new Error(`${record.record_id}: 开始日期 is required`);
  }

  const customerName = textValue(fields['客户名称']) || '未填写客户';
  const status = textValue(fields['状态']);
  const feedbackType = textValue(fields['反馈类型']);
  const issueType = textValue(fields['问题类型']);
  const submitter = firstPerson(fields['提交人']);

  return {
    externalRecordId: record.record_id,
    serviceRecordNo: textValue(fields['服务记录ID']) || null,
    startDate,
    endDate: dateValue(fields['结束日期']),
    customerName,
    questionerRole: textValue(fields['提问者和角色']) || null,
    sourceType: textValue(fields['来源类型']) || null,
    feedbackTypeRaw: feedbackType || null,
    feedbackTypeNormalized: normalizeCategory(feedbackType),
    issueTypeRaw: issueType || null,
    issueTypeNormalized: normalizeIssueType(issueType),
    deploymentType: textValue(fields['部署形态']) || null,
    ticketId: textValue(fields['工单ID']) || null,
    summary: textValue(fields['反馈内容（简要描述）']),
    conclusion: textValue(fields['结论（简要描述或链接）']) || null,
    satisfaction: integerValue(fields['客户满意度']),
    sourceStatus: status || null,
    normalizedStatus: normalizeStatus(status),
    firstLineEngineer: personNames(fields['一线工程师']),
    secondLineEngineer: personNames(fields['二线工程师']),
    thirdLineEngineer: personNames(fields['三线产研']),
    keyIssue: booleanValue(fields['重点问题']),
    submittedByName: submitter?.name ?? null,
    submittedByOpenId: submitter?.id ?? null,
    submittedAt: dateValue(fields['提交时间']),
    rawFields: fields as Prisma.InputJsonObject,
    sourceCreatedAt: dateValue(record.created_time),
    sourceUpdatedAt: dateValue(record.last_modified_time),
    syncedAt: new Date(),
    deletedAt: null,
  };
}

function normalizeCategory(value: string) {
  return value ? value.replace(/\s+/g, ' ') : null;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join('、');
  }
  if (value && typeof value === 'object') {
    const cell = value as Record<string, unknown>;
    for (const key of ['text', 'name', 'value', 'link']) {
      const text = textValue(cell[key]);
      if (text) return text;
    }
  }
  return '';
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const source = textValue(value);
  if (!source) return null;
  if (/^\d+$/.test(source)) return dateValue(Number(source));
  const date = new Date(source);
  return Number.isNaN(date.getTime()) ? null : date;
}

function integerValue(value: unknown): number | null {
  const source = textValue(value);
  if (!source) return null;
  const number = Number(source);
  return Number.isFinite(number) && Number.isInteger(number) ? number : null;
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  const source = textValue(value).toLowerCase();
  return ['true', '1', '是', '重点', 'yes'].includes(source);
}

function personNames(value: unknown): string | null {
  const people = personList(value);
  return people.length ? people.map((person) => person.name).join('、') : null;
}

function firstPerson(value: unknown) {
  return personList(value)[0];
}

function personList(
  value: unknown,
): Array<{ name: string; id: string | null }> {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.flatMap((item) => {
    if (typeof item === 'string') {
      const name = item.trim();
      return name ? [{ name, id: null }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const person = item as Record<string, unknown>;
    const name = textValue(person.name);
    if (!name) return [];
    return [
      {
        name,
        id: textValue(person.open_id) || textValue(person.id) || null,
      },
    ];
  });
}
