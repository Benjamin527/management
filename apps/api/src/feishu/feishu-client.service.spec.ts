import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/env.validation';
import { FeishuClientService } from './feishu-client.service';

const configValues: Partial<AppEnvironment> = {
  FEISHU_APP_ID: 'cli_example',
  FEISHU_APP_SECRET: 'server-only-secret',
  FEISHU_BASE_APP_TOKEN: 'base_token',
  FEISHU_SERVICE_TABLE_ID: 'tblczuC0hyPSnOMj',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tokenResponse(token = 'tenant-token', expire = 7200) {
  return jsonResponse({
    code: 0,
    msg: 'ok',
    tenant_access_token: token,
    expire,
  });
}

function recordsResponse(
  ids: string[],
  hasMore = false,
  pageToken?: string,
  startDates: Record<string, number | string> = {},
) {
  return jsonResponse({
    code: 0,
    msg: 'ok',
    data: {
      items: ids.map((record_id) => ({
        record_id,
        fields: {
          开始日期: startDates[record_id] ?? 1767196800000,
        },
      })),
      has_more: hasMore,
      page_token: pageToken,
    },
  });
}

function fetchUrl(input: string | URL | Request) {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function stringBody(request?: RequestInit) {
  if (typeof request?.body !== 'string') {
    throw new Error('Expected a JSON string request body');
  }
  return request.body;
}

describe('FeishuClientService', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;
  let service: FeishuClientService;

  beforeEach(() => {
    fetchMock = jest.fn();
    const config = {
      getOrThrow: jest.fn((key: keyof AppEnvironment) => configValues[key]),
    } as unknown as ConfigService<AppEnvironment, true>;
    service = new FeishuClientService(config, fetchMock);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('caches the tenant token before its refresh boundary', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(recordsResponse(['r1']))
      .mockResolvedValueOnce(recordsResponse(['r2']));

    await service.searchRecords({
      start: new Date('2026-01-01T00:00:00+08:00'),
      end: new Date('2026-01-02T00:00:00+08:00'),
    });
    await service.searchRecords({
      start: new Date('2026-01-02T00:00:00+08:00'),
      end: new Date('2026-01-03T00:00:00+08:00'),
    });

    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      fetchUrl(url).includes('/auth/v3/tenant_access_token/internal'),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it('searches every page without inheriting a view or unsupported API filter', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(recordsResponse(['r1'], true, 'next'))
      .mockResolvedValueOnce(recordsResponse(['r2']));

    const records = await service.searchRecords({
      start: new Date('2026-01-01T00:00:00+08:00'),
      end: new Date('2027-01-01T00:00:00+08:00'),
    });

    expect(records.map((item) => item.record_id)).toEqual(['r1', 'r2']);
    expect(fetchUrl(fetchMock.mock.calls[1][0])).not.toContain('view_id');
    expect(fetchUrl(fetchMock.mock.calls[2][0])).toContain('page_token=next');
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    const body: unknown = JSON.parse(stringBody(request));
    expect(body).toEqual({});
  });

  it('keeps only records whose start date is inside the requested range', async () => {
    const start = new Date('2026-01-01T00:00:00+08:00');
    const end = new Date('2026-01-02T00:00:00+08:00');
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
      recordsResponse(
        ['before', 'at-start', 'inside', 'at-end', 'invalid'],
        false,
        undefined,
        {
          before: start.getTime() - 1,
          'at-start': start.getTime(),
          inside: String(start.getTime() + 60_000),
          'at-end': end.getTime(),
          invalid: 'not-a-date',
        },
      ),
    );

    const records = await service.searchRecords({ start, end });

    expect(records.map((item) => item.record_id)).toEqual([
      'at-start',
      'inside',
    ]);
  });

  it('retries a rate-limited request and then succeeds', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(jsonResponse({ code: 99991400, msg: 'rate' }, 429))
      .mockResolvedValueOnce(recordsResponse(['r1']));

    const resultPromise = service.searchRecords({
      start: new Date('2026-01-01T00:00:00+08:00'),
      end: new Date('2026-01-02T00:00:00+08:00'),
    });
    await jest.runAllTimersAsync();

    await expect(resultPromise).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not include the app secret or tenant token in errors', async () => {
    fetchMock
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        jsonResponse({ code: 1254291, msg: 'request failed' }, 400),
      );

    let message = '';
    try {
      await service.searchRecords({
        start: new Date('2026-01-01T00:00:00+08:00'),
        end: new Date('2026-01-02T00:00:00+08:00'),
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('1254291');
    expect(message).not.toContain('tenant-token');
    expect(message).not.toContain('server-only-secret');
  });
});
