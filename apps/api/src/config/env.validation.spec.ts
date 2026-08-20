import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('rejects an incomplete environment', () => {
    expect(() => validateEnv({ JWT_SECRET: 'short' })).toThrow(
      'DATABASE_URL must be a MySQL connection string',
    );
  });

  it('rejects a weak JWT secret', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: 'short',
      }),
    ).toThrow('JWT_SECRET must contain at least 32 characters');
  });

  it('normalizes a complete environment', () => {
    expect(
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        HOST: '127.0.0.1',
        PORT: '3100',
        COOKIE_SECURE: 'true',
      }),
    ).toMatchObject({ HOST: '127.0.0.1', PORT: 3100, COOKIE_SECURE: true });
  });

  it('accepts the complete Feishu sync configuration', () => {
    const value = validateEnv({
      DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
      JWT_SECRET: '12345678901234567890123456789012',
      FEISHU_APP_ID: 'cli_example',
      FEISHU_APP_SECRET: 'server-only-secret',
      FEISHU_BASE_APP_TOKEN: 'base_token',
      FEISHU_SERVICE_TABLE_ID: 'tblczuC0hyPSnOMj',
      FEISHU_SYNC_YEAR: '2026',
      FEISHU_SYNC_CRON: '0 2 * * *',
      FEISHU_SERVICE_BASE_URL: 'https://example.feishu.cn/wiki/example',
    });

    expect(value).toMatchObject({
      FEISHU_APP_ID: 'cli_example',
      FEISHU_SYNC_YEAR: 2026,
      FEISHU_SYNC_CRON: '0 2 * * *',
    });
  });

  it('rejects a partial Feishu configuration', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        FEISHU_APP_ID: 'cli_example',
      }),
    ).toThrow('FEISHU_APP_SECRET is required when Feishu sync is enabled');
  });
});
