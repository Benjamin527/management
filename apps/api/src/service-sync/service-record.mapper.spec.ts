import { FeishuBaseRecord } from '../feishu/feishu-client.service';
import {
  mapServiceRecord,
  normalizeIssueType,
  normalizeStatus,
} from './service-record.mapper';

function record(fields: Record<string, unknown>): FeishuBaseRecord {
  return {
    record_id: 'rec_1',
    fields,
    created_time: 1767225600000,
    last_modified_time: 1767312000000,
  };
}

describe('service record mapper', () => {
  it.each([
    ['已解决', 'RESOLVED'],
    ['已关闭', 'CLOSED'],
    ['跟进中', 'IN_PROGRESS'],
    ['待回复', 'WAITING_REPLY'],
    ['已提交飞书项目', 'ESCALATED'],
    ['', 'UNKNOWN'],
    ['新状态', 'OTHER'],
  ])('maps source status %s to %s', (source, expected) => {
    expect(normalizeStatus(source)).toBe(expected);
  });

  it.each([
    ['Datakit问题', 'DataKit 问题'],
    ['DataKit 问题', 'DataKit 问题'],
    ['Func问题', 'Func 问题'],
    ['Func 问题', 'Func 问题'],
  ])('normalizes issue type %s', (source, expected) => {
    expect(normalizeIssueType(source)).toBe(expected);
  });

  it('keeps raw fields while extracting stable analysis fields', () => {
    const source = record({
      服务记录ID: 4096,
      客户名称: [{ text: '太保', type: 'text' }],
      开始日期: 1767225600000,
      状态: '跟进中',
      问题类型: 'Datakit问题',
      反馈类型: '产品使用',
      来源类型: '钉钉',
      部署形态: 'SaaS',
      '反馈内容（简要描述）': '告警通知对象调整',
      一线工程师: [{ name: '王雨轩', id: 'ou_1' }],
      二线工程师: [{ name: '焦奕杰', id: 'ou_2' }],
      三线产研: [{ name: '研发甲', id: 'ou_3' }],
      提交人: [{ name: '提交人甲', id: 'ou_submitter' }],
      提交时间: 1767225600000,
      重点问题: true,
      客户满意度: '5',
    });

    expect(mapServiceRecord(source)).toMatchObject({
      externalRecordId: 'rec_1',
      serviceRecordNo: '4096',
      customerName: '太保',
      normalizedStatus: 'IN_PROGRESS',
      issueTypeRaw: 'Datakit问题',
      issueTypeNormalized: 'DataKit 问题',
      firstLineEngineer: '王雨轩',
      secondLineEngineer: '焦奕杰',
      thirdLineEngineer: '研发甲',
      submittedByName: '提交人甲',
      submittedByOpenId: 'ou_submitter',
      keyIssue: true,
      satisfaction: 5,
      rawFields: source.fields,
    });
  });

  it('keeps incomplete source records countable', () => {
    expect(
      mapServiceRecord(
        record({
          开始日期: 1767225600000,
          状态: '',
        }),
      ),
    ).toMatchObject({
      customerName: '未填写客户',
      summary: '',
      normalizedStatus: 'UNKNOWN',
    });
  });

  it('rejects a record without a usable start date', () => {
    expect(() => mapServiceRecord(record({ 客户名称: '太保' }))).toThrow(
      'rec_1: 开始日期 is required',
    );
  });
});
