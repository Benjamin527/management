import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppEnvironment } from '../config/env.validation';

export const FEISHU_FETCH = Symbol('FEISHU_FETCH');

export interface FeishuBaseRecord {
  record_id: string;
  fields: Record<string, unknown>;
  created_time?: number;
  last_modified_time?: number;
}

export interface RecordSearchRange {
  start: Date;
  end: Date;
}

interface FeishuResponse<T> {
  code: number;
  msg: string;
  data?: T;
}

interface TokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface RecordPage {
  items?: FeishuBaseRecord[];
  has_more?: boolean;
  page_token?: string;
}

class FeishuApiError extends Error {
  constructor(
    readonly code: number,
    readonly status: number,
    context: string,
    message: string,
  ) {
    super(`Feishu ${context} failed (${code}): ${message}`);
  }

  get authenticationFailure() {
    return (
      this.status === 401 || [99991661, 99991663, 99991664].includes(this.code)
    );
  }
}

@Injectable()
export class FeishuClientService {
  private token: { value: string; refreshAt: number } | null = null;

  constructor(
    private readonly config: ConfigService<AppEnvironment, true>,
    @Inject(FEISHU_FETCH) private readonly fetcher: typeof fetch,
  ) {}

  async searchRecords(range: RecordSearchRange): Promise<FeishuBaseRecord[]> {
    const records: FeishuBaseRecord[] = [];
    let pageToken: string | undefined;

    do {
      const page = await this.searchPage(range, pageToken);
      records.push(...(page.items ?? []));
      pageToken = page.has_more ? page.page_token : undefined;
      if (page.has_more && !pageToken) {
        throw new Error(
          'Feishu record search returned has_more without page_token',
        );
      }
    } while (pageToken);

    return records;
  }

  private async searchPage(
    range: RecordSearchRange,
    pageToken?: string,
  ): Promise<RecordPage> {
    try {
      return await this.requestRecordPage(range, pageToken);
    } catch (error) {
      if (!(error instanceof FeishuApiError) || !error.authenticationFailure) {
        throw error;
      }
      this.token = null;
      return this.requestRecordPage(range, pageToken);
    }
  }

  private async requestRecordPage(
    range: RecordSearchRange,
    pageToken?: string,
  ): Promise<RecordPage> {
    const token = await this.getTenantToken();
    const appToken = encodeURIComponent(
      this.config.getOrThrow<string>('FEISHU_BASE_APP_TOKEN'),
    );
    const tableId = encodeURIComponent(
      this.config.getOrThrow<string>('FEISHU_SERVICE_TABLE_ID'),
    );
    const query = new URLSearchParams({ page_size: '500' });
    if (pageToken) query.set('page_token', pageToken);
    const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search?${query.toString()}`;

    const response = await this.requestJson<FeishuResponse<RecordPage>>(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            conjunction: 'and',
            conditions: [
              {
                field_name: '开始日期',
                operator: 'isGreaterEqual',
                value: [String(range.start.getTime())],
              },
              {
                field_name: '开始日期',
                operator: 'isLess',
                value: [String(range.end.getTime())],
              },
            ],
          },
        }),
      },
      'record search',
    );
    return response.data ?? {};
  }

  private async getTenantToken(): Promise<string> {
    if (this.token && Date.now() < this.token.refreshAt) {
      return this.token.value;
    }

    const response = await this.requestJson<TokenResponse>(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: this.config.getOrThrow<string>('FEISHU_APP_ID'),
          app_secret: this.config.getOrThrow<string>('FEISHU_APP_SECRET'),
        }),
      },
      'tenant token',
    );

    if (!response.tenant_access_token) {
      throw new FeishuApiError(
        response.code,
        200,
        'tenant token',
        'missing tenant_access_token',
      );
    }
    const expiresIn = Math.max(response.expire ?? 7200, 61);
    this.token = {
      value: response.tenant_access_token,
      refreshAt: Date.now() + (expiresIn - 60) * 1000,
    };
    return this.token.value;
  }

  private async requestJson<T>(
    url: string,
    init: RequestInit,
    context: string,
  ): Promise<T> {
    const delays = [250, 500, 1000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        const response = await this.fetcher(url, init);
        const body = (await response.json()) as FeishuResponse<unknown>;
        const code = Number(body.code ?? response.status);
        if (response.ok && code === 0) return body as T;

        const error = new FeishuApiError(
          code,
          response.status,
          context,
          String(body.msg || response.statusText || 'request failed'),
        );
        if (
          !this.isTransient(response.status, code) ||
          attempt === delays.length
        ) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        if (
          error instanceof FeishuApiError &&
          !this.isTransient(error.status, error.code)
        ) {
          throw error;
        }
        lastError = error;
        if (attempt === delays.length) break;
      }
      await this.sleep(delays[attempt]);
    }

    if (lastError instanceof FeishuApiError) throw lastError;
    const message =
      lastError instanceof Error ? lastError.message : 'network error';
    throw new Error(`Feishu ${context} failed: ${message}`);
  }

  private isTransient(status: number, code: number) {
    return (
      status === 429 || status >= 500 || [99991400, 1254290].includes(code)
    );
  }

  private sleep(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}
