import { FeishuBaseRecord } from '../feishu/feishu-client.service';
import { Prisma } from '../generated/prisma/client';
import {
  mapHandoffRecord,
  normalizeCustomerName,
  valueText,
} from './handoff-record.mapper';

function record(
  fields: Record<string, unknown>,
  timestamps: Pick<FeishuBaseRecord, 'created_time' | 'last_modified_time'> = {
    created_time: 1_753_027_200,
    last_modified_time: 1_753_113_600_000,
  },
): FeishuBaseRecord {
  return {
    record_id: 'rec_handoff_1',
    fields,
    ...timestamps,
  };
}

describe('handoff record mapper', () => {
  it('maps every handoff field while masking the deployment checklist', () => {
    const deploymentSecret = 'root_password=sk-live-secret';
    const deploymentLink = 'https://deploy.example/secret-runbook';
    const source = record({
      客户名称: [{ text: '云鲸智能', type: 'text' }],
      部署方式: 'SaaS',
      部署清单: [
        { text: deploymentSecret, type: 'text' },
        { link: deploymentLink, type: 'url' },
      ],
      SAAS站点: ['杭州'],
      功能使用统计: ['日志', 'APM', 'RUM'],
      日志采集: ['DataKit', 'Fluent Bit'],
      日志采集补充: [{ text: '保留七天' }],
      APM接入探针: ['Java', 'Python'],
      APM接入补充: [{ link: 'https://docs.example/apm' }],
      RUM应用接入: ['Web', 'Android'],
      RUM接入方式补充: [{ url: 'https://docs.example/rum' }],
      有无非标的操作或者特别开发使用的功能: [{ name: '专属清洗规则' }],
      '有无非标的操作或者特别开发使用的功能 副本': [{ text: '不应覆盖主字段' }],
      交接人: [{ name: '苏桐桐', open_id: 'ou_sutongtong' }],
      交接时间: 1_753_027_200_000,
      交接状态: '已完成',
      是否解决过非常重要或者经常出现的问题: [{ text: '处理过采集器内存升高' }],
      有无遗留的问题: [{ link: 'https://issues.example/legacy-1' }],
      沟通渠道: [{ text: '飞书群：云鲸服务群' }],
      对接人信息: [
        { name: '张三' },
        { text: '技术负责人' },
        { url: 'mailto:zhangsan@example.com' },
      ],
      其他保留字段: {
        nested: [{ text: '必须原样保留' }],
      },
    });
    const sourceSnapshot = structuredClone(source);

    const result = mapHandoffRecord(source);
    const prismaCompatible: Prisma.FeishuHandoffProfileUncheckedCreateInput =
      result.profile;

    expect(prismaCompatible).toMatchObject({
      externalRecordId: 'rec_handoff_1',
      customerName: '云鲸智能',
      normalizedCustomerName: '云鲸智能',
      deploymentType: 'SaaS',
      deploymentChecklistMasked: '包含受保护的部署信息',
      saasSites: ['杭州'],
      featureUsage: ['日志', 'APM', 'RUM'],
      logCollection: ['DataKit', 'Fluent Bit'],
      logCollectionNotes: '保留七天',
      apmProbes: ['Java', 'Python'],
      apmNotes: 'https://docs.example/apm',
      rumApps: ['Web', 'Android'],
      rumNotes: 'https://docs.example/rum',
      customFeatures: '专属清洗规则',
      handoffPeople: ['苏桐桐'],
      handoffAt: new Date(1_753_027_200_000),
      handoffStatus: '已完成',
      importantIssues: '处理过采集器内存升高',
      legacyIssues: 'https://issues.example/legacy-1',
      communicationChannel: '飞书群：云鲸服务群',
      contactInfo: '张三\n技术负责人\nmailto:zhangsan@example.com',
      sourceCreatedAt: new Date(1_753_027_200_000),
      sourceUpdatedAt: new Date(1_753_113_600_000),
      deletedAt: null,
    });
    expect(prismaCompatible.syncedAt).toBeInstanceOf(Date);
    expect(result.deploymentChecklistSecret).toBe(
      `${deploymentSecret}\n${deploymentLink}`,
    );
    expect(prismaCompatible.rawFieldsMasked).toEqual({
      ...source.fields,
      部署清单: '包含受保护的部署信息',
    });
    expect(JSON.stringify(prismaCompatible.rawFieldsMasked)).not.toContain(
      deploymentSecret,
    );
    expect(JSON.stringify(prismaCompatible.rawFieldsMasked)).not.toContain(
      deploymentLink,
    );
    expect(source).toEqual(sourceSnapshot);
    expect(prismaCompatible.rawFieldsMasked).not.toBe(source.fields);
    expect(
      (prismaCompatible.rawFieldsMasked as Record<string, unknown>)[
        '其他保留字段'
      ],
    ).not.toBe(source.fields['其他保留字段']);
  });

  it('uses the custom-feature copy only when the primary field is empty', () => {
    const mapped = mapHandoffRecord(
      record({
        客户名称: [{ text: '云鲸智能' }],
        有无非标的操作或者特别开发使用的功能: [{ text: '  ' }],
        '有无非标的操作或者特别开发使用的功能 副本': [
          { text: '来自副本的功能' },
        ],
      }),
    );

    expect(mapped.profile.customFeatures).toBe('来自副本的功能');
  });

  it('keeps both display text and URL from one deployment checklist cell', () => {
    const mapped = mapHandoffRecord(
      record({
        客户名称: [{ text: '云鲸智能' }],
        部署清单: [
          { text: 'runbook', link: 'https://deploy.example/runbook' },
          { text: 'second item', url: 'https://deploy.example/second' },
        ],
      }),
    );

    expect(mapped.deploymentChecklistSecret).toBe(
      'runbook\nhttps://deploy.example/runbook\nsecond item\nhttps://deploy.example/second',
    );
  });

  it('maps empty optional fields to null', () => {
    const mapped = mapHandoffRecord(
      record({ 客户名称: [{ text: '云鲸智能' }] }),
    );

    expect(mapped).toMatchObject({
      deploymentChecklistSecret: null,
      profile: {
        deploymentType: null,
        deploymentChecklistMasked: null,
        saasSites: null,
        featureUsage: null,
        logCollection: null,
        logCollectionNotes: null,
        apmProbes: null,
        apmNotes: null,
        rumApps: null,
        rumNotes: null,
        customFeatures: null,
        handoffPeople: null,
        handoffAt: null,
        handoffStatus: null,
        importantIssues: null,
        legacyIssues: null,
        communicationChannel: null,
        contactInfo: null,
      },
    });
  });

  it('normalizes customer names with NFKC, whitespace folding, and zh-CN lowercase', () => {
    expect(normalizeCustomerName('  ＹＵＮＪＩＮＧ\t  AI　客户  ')).toBe(
      'yunjing ai 客户',
    );
  });

  it('recursively extracts value text in name, text, link, url order', () => {
    expect(
      valueText([
        ' first ',
        42,
        {
          name: ' Name ',
          text: 'ignored display',
          link: ' https://example/preferred ',
          url: 'https://example/ignored',
        },
        { name: ' ', text: ' Text ' },
        { text: '', link: ' https://example/link ' },
        { link: null, url: ' https://example/url ' },
        null,
        {},
      ]),
    ).toBe(
      'first\n42\nName\nhttps://example/preferred\nText\nhttps://example/link\nhttps://example/url',
    );
  });

  it.each([
    ['undefined', undefined, ''],
    ['bigint', 9_876_543_210_123_456_789n, '9876543210123456789'],
    ['Date', new Date('2025-07-21T00:00:00.000Z'), '2025-07-21'],
    ['non-finite number', Number.POSITIVE_INFINITY, 'Infinity'],
  ])(
    'rejects %s raw field values without exposing their data',
    (type, unsupportedValue, forbiddenText) => {
      expect.assertions(forbiddenText ? 2 : 1);

      try {
        mapHandoffRecord(
          record({
            客户名称: [{ text: '云鲸智能' }],
            非JSON字段: { nested: unsupportedValue },
          }),
        );
      } catch (error) {
        expect(error).toEqual(
          new Error(`rawFieldsMasked contains unsupported JSON value: ${type}`),
        );
        if (forbiddenText) {
          expect((error as Error).message).not.toContain(forbiddenText);
        }
      }
    },
  );

  it('rejects a record without a customer name', () => {
    expect(() => mapHandoffRecord(record({ 客户名称: [] }))).toThrow(
      '客户名称 is required',
    );
  });

  it('returns null for invalid source dates', () => {
    const mapped = mapHandoffRecord(
      record(
        {
          客户名称: [{ text: '云鲸智能' }],
          交接时间: 9_000_000_000_000_000,
        },
        {
          created_time: Number.NaN,
          last_modified_time: 9_000_000_000_000_000,
        },
      ),
    );

    expect(mapped.profile).toMatchObject({
      handoffAt: null,
      sourceCreatedAt: null,
      sourceUpdatedAt: null,
    });
  });
});
