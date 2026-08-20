export interface AppEnvironment {
  DATABASE_URL: string;
  JWT_SECRET: string;
  HOST: string;
  PORT: number;
  COOKIE_SECURE: boolean;
  FEISHU_SYNC_ENABLED: boolean;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_BASE_APP_TOKEN?: string;
  FEISHU_SERVICE_TABLE_ID?: string;
  FEISHU_SYNC_YEAR?: number;
  FEISHU_SYNC_CRON?: string;
  FEISHU_SERVICE_BASE_URL?: string;
  CONSUMPTION_SYNC_ENABLED: boolean;
  CONSUMPTION_SOURCE_DATABASE_URL?: string;
  CONSUMPTION_SYNC_CRON?: string;
}

function stringValue(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function validateEnv(input: Record<string, unknown>): AppEnvironment {
  const databaseUrl = stringValue(input.DATABASE_URL);
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must be a MySQL connection string');
  }

  const jwtSecret = stringValue(input.JWT_SECRET);
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }

  const host = stringValue(input.HOST, '127.0.0.1');

  const port = Number(input.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  const secureValue = stringValue(input.COOKIE_SECURE, 'false').toLowerCase();
  if (!['true', 'false'].includes(secureValue)) {
    throw new Error('COOKIE_SECURE must be true or false');
  }

  const feishuAppId = stringValue(input.FEISHU_APP_ID).trim();
  const feishuEnabled = feishuAppId.length > 0;
  const feishuConfig = feishuEnabled
    ? validateFeishuConfig(input, feishuAppId)
    : {};
  const consumptionSourceUrl = stringValue(
    input.CONSUMPTION_SOURCE_DATABASE_URL,
  ).trim();
  const consumptionEnabled = consumptionSourceUrl.length > 0;
  const consumptionConfig = consumptionEnabled
    ? validateConsumptionConfig(input, consumptionSourceUrl)
    : {};

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    HOST: host,
    PORT: port,
    COOKIE_SECURE: secureValue === 'true',
    FEISHU_SYNC_ENABLED: feishuEnabled,
    CONSUMPTION_SYNC_ENABLED: consumptionEnabled,
    ...feishuConfig,
    ...consumptionConfig,
  };
}

function validateConsumptionConfig(
  input: Record<string, unknown>,
  source: string,
): Pick<
  AppEnvironment,
  'CONSUMPTION_SOURCE_DATABASE_URL' | 'CONSUMPTION_SYNC_CRON'
> {
  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    throw new Error(
      'CONSUMPTION_SOURCE_DATABASE_URL must be a MySQL connection string',
    );
  }
  if (sourceUrl.protocol !== 'mysql:') {
    throw new Error(
      'CONSUMPTION_SOURCE_DATABASE_URL must be a MySQL connection string',
    );
  }

  const cron = stringValue(input.CONSUMPTION_SYNC_CRON, '0 13 * * *').trim();
  if (cron.split(/\s+/).length !== 5) {
    throw new Error(
      'CONSUMPTION_SYNC_CRON must be a five-field cron expression',
    );
  }

  return {
    CONSUMPTION_SOURCE_DATABASE_URL: sourceUrl.toString(),
    CONSUMPTION_SYNC_CRON: cron,
  };
}

function validateFeishuConfig(
  input: Record<string, unknown>,
  appId: string,
): Pick<
  AppEnvironment,
  | 'FEISHU_APP_ID'
  | 'FEISHU_APP_SECRET'
  | 'FEISHU_BASE_APP_TOKEN'
  | 'FEISHU_SERVICE_TABLE_ID'
  | 'FEISHU_SYNC_YEAR'
  | 'FEISHU_SYNC_CRON'
  | 'FEISHU_SERVICE_BASE_URL'
> {
  const required = [
    'FEISHU_APP_SECRET',
    'FEISHU_BASE_APP_TOKEN',
    'FEISHU_SERVICE_TABLE_ID',
    'FEISHU_SERVICE_BASE_URL',
  ] as const;

  const values = Object.fromEntries(
    required.map((key) => [key, stringValue(input[key]).trim()]),
  ) as Record<(typeof required)[number], string>;
  const missing = required.find((key) => !values[key]);
  if (missing) {
    throw new Error(`${missing} is required when Feishu sync is enabled`);
  }

  const year = Number(input.FEISHU_SYNC_YEAR ?? 2026);
  if (year !== 2026) {
    throw new Error('FEISHU_SYNC_YEAR must be 2026');
  }

  const cron = stringValue(input.FEISHU_SYNC_CRON, '0 2 * * *').trim();
  if (cron.split(/\s+/).length !== 5) {
    throw new Error('FEISHU_SYNC_CRON must be a five-field cron expression');
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(values.FEISHU_SERVICE_BASE_URL);
  } catch {
    throw new Error('FEISHU_SERVICE_BASE_URL must be a valid HTTPS URL');
  }
  if (sourceUrl.protocol !== 'https:') {
    throw new Error('FEISHU_SERVICE_BASE_URL must be a valid HTTPS URL');
  }

  return {
    FEISHU_APP_ID: appId,
    FEISHU_APP_SECRET: values.FEISHU_APP_SECRET,
    FEISHU_BASE_APP_TOKEN: values.FEISHU_BASE_APP_TOKEN,
    FEISHU_SERVICE_TABLE_ID: values.FEISHU_SERVICE_TABLE_ID,
    FEISHU_SYNC_YEAR: year,
    FEISHU_SYNC_CRON: cron,
    FEISHU_SERVICE_BASE_URL: sourceUrl.toString(),
  };
}
