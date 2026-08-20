import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'mariadb';
import { dateKey, dateOnly } from './consumption-window';

export const CONSUMPTION_SOURCE_POOL = Symbol('CONSUMPTION_SOURCE_POOL');

export type ConsumptionSourceValue = 'DOMESTIC' | 'OVERSEAS';

export interface ConsumptionWindow {
  start: Date;
  end: Date;
}

export interface SourceConsumptionRow {
  source: ConsumptionSourceValue;
  externalId: string;
  displayName: string;
  managerName: string | null;
  date: Date;
  product: string;
  amount: string;
}

export interface SourceDayCoverage {
  source: ConsumptionSourceValue;
  date: Date;
  recordCount: number;
  amount: string;
}

type SourcePool = Pick<Pool, 'query'>;
type QueryRow = Record<string, unknown>;

const latestSql = `
SELECT
  (SELECT DATE_FORMAT(MAX(query_date), '%Y-%m-%d') FROM daily_consumption_report) AS domesticMax,
  (SELECT DATE_FORMAT(MAX(query_date), '%Y-%m-%d') FROM guance_abroad_consumption) AS overseasMax
`;

const domesticSql = `
SELECT
  customer_id AS externalId,
  MAX(customer_name) AS displayName,
  MAX(tam_real_name) AS managerName,
  DATE_FORMAT(consume_time_of_day, '%Y-%m-%d') AS date,
  COALESCE(NULLIF(product_detail, ''), '未分类') AS product,
  CAST(SUM(origin_amount) AS CHAR) AS amount
FROM daily_usage_details
WHERE consume_time_of_day BETWEEN ? AND ?
GROUP BY customer_id, consume_time_of_day,
  COALESCE(NULLIF(product_detail, ''), '未分类')
`;

const overseasSql = `
SELECT
  detail.gc_account AS externalId,
  COALESCE(NULLIF(MAX(customer.company_name), ''), detail.gc_account) AS displayName,
  NULL AS managerName,
  DATE_FORMAT(detail.consume_time_of_day, '%Y-%m-%d') AS date,
  COALESCE(NULLIF(detail.product_detail, ''), '未分类') AS product,
  CAST(SUM(detail.origin_amount) AS CHAR) AS amount
FROM guance_abroad_consumption_detail detail
LEFT JOIN signed_abroad_customer customer
  ON customer.gc_account = detail.gc_account
WHERE detail.consume_time_of_day BETWEEN ? AND ?
GROUP BY detail.gc_account, detail.consume_time_of_day,
  COALESCE(NULLIF(detail.product_detail, ''), '未分类')
`;

const domesticCoverageSql = `
SELECT DATE_FORMAT(query_date, '%Y-%m-%d') AS date, COUNT(*) AS recordCount,
  CAST(SUM(origin_amount) AS CHAR) AS amount
FROM daily_consumption_report
WHERE query_date BETWEEN ? AND ?
GROUP BY query_date
`;

const overseasCoverageSql = `
SELECT DATE_FORMAT(query_date, '%Y-%m-%d') AS date, COUNT(*) AS recordCount,
  CAST(SUM(all_amount) AS CHAR) AS amount
FROM guance_abroad_consumption
WHERE query_date BETWEEN ? AND ?
GROUP BY query_date
`;

@Injectable()
export class ConsumptionSourceClient {
  constructor(
    @Inject(CONSUMPTION_SOURCE_POOL) private readonly pool: SourcePool | null,
  ) {}

  async latestBusinessDate() {
    const rows = await this.query(latestSql);
    const first = rows[0] ?? {};
    const dates = [first.domesticMax, first.overseasMax]
      .filter(
        (value): value is Date | string =>
          value instanceof Date || typeof value === 'string',
      )
      .map(dateOnly);
    if (!dates.length) {
      throw new Error('Consumption source has no business dates');
    }
    return new Date(Math.max(...dates.map((date) => date.getTime())));
  }

  async readWindow(window: ConsumptionWindow) {
    const params = [dateKey(window.start), dateKey(window.end)];
    const [domestic, overseas] = await Promise.all([
      this.query(domesticSql, params),
      this.query(overseasSql, params),
    ]);
    return [
      ...domestic.map((row) => this.mapConsumption(row, 'DOMESTIC')),
      ...overseas.map((row) => this.mapConsumption(row, 'OVERSEAS')),
    ];
  }

  async readCoverage(window: ConsumptionWindow) {
    const params = [dateKey(window.start), dateKey(window.end)];
    const [domestic, overseas] = await Promise.all([
      this.query(domesticCoverageSql, params),
      this.query(overseasCoverageSql, params),
    ]);
    return [
      ...domestic.map((row) => this.mapCoverage(row, 'DOMESTIC')),
      ...overseas.map((row) => this.mapCoverage(row, 'OVERSEAS')),
    ];
  }

  private mapConsumption(
    row: QueryRow,
    source: ConsumptionSourceValue,
  ): SourceConsumptionRow {
    const externalId = this.text(row.externalId);
    const displayName = this.text(row.displayName) || externalId;
    const amount = this.amount(row.amount);
    if (!externalId)
      throw new Error('Consumption source row is missing account ID');
    return {
      source,
      externalId,
      displayName,
      managerName: this.text(row.managerName) || null,
      date: this.rowDate(row.date),
      product: this.text(row.product) || '未分类',
      amount,
    };
  }

  private mapCoverage(
    row: QueryRow,
    source: ConsumptionSourceValue,
  ): SourceDayCoverage {
    const recordCount = Number(row.recordCount);
    if (!Number.isInteger(recordCount) || recordCount < 0) {
      throw new Error('Consumption coverage has an invalid record count');
    }
    return {
      source,
      date: this.rowDate(row.date),
      recordCount,
      amount: this.amount(row.amount),
    };
  }

  private rowDate(value: unknown) {
    if (!(value instanceof Date) && typeof value !== 'string') {
      throw new Error('Consumption source row has an invalid date');
    }
    return dateOnly(value);
  }

  private amount(value: unknown) {
    const source = this.text(value);
    const number = Number(source);
    if (!source || !Number.isFinite(number) || number < 0) {
      throw new Error('Consumption source row has an invalid amount');
    }
    return source;
  }

  private text(value: unknown) {
    if (
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'bigint'
    ) {
      return '';
    }
    return String(value).trim();
  }

  private async query(sql: string, params: string[] = []): Promise<QueryRow[]> {
    if (!this.pool) {
      throw new Error('Consumption synchronization is disabled');
    }
    try {
      const rows = (await this.pool.query(sql, params)) as unknown;
      return Array.isArray(rows) ? (rows as QueryRow[]) : [];
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Consumption ')) {
        throw error;
      }
      throw new Error('Consumption source query failed');
    }
  }
}
