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

  it('enables Feishu handoff sync and preserves its table ID', () => {
    const value = validateEnv({
      DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
      JWT_SECRET: '12345678901234567890123456789012',
      FEISHU_HANDOFF_BASE_APP_TOKEN: '  handoff_base_token  ',
      FEISHU_HANDOFF_TABLE_ID: '  tblHandoff123  ',
      FEISHU_HANDOFF_BASE_URL: '  https://example.feishu.cn/base/example  ',
      FEISHU_HANDOFF_SYNC_CRON: '  30 2 * * *  ',
      HANDOFF_SECRET_ENCRYPTION_KEY:
        '  0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  ',
    });

    expect(value).toMatchObject({
      FEISHU_HANDOFF_SYNC_ENABLED: true,
      FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base_token',
      FEISHU_HANDOFF_TABLE_ID: 'tblHandoff123',
      FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/base/example',
      FEISHU_HANDOFF_SYNC_CRON: '30 2 * * *',
      HANDOFF_SECRET_ENCRYPTION_KEY:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
  });

  it.each([
    ['FEISHU_HANDOFF_TABLE_ID', { FEISHU_HANDOFF_TABLE_ID: undefined }],
    ['FEISHU_HANDOFF_BASE_URL', { FEISHU_HANDOFF_BASE_URL: undefined }],
    [
      'HANDOFF_SECRET_ENCRYPTION_KEY',
      { HANDOFF_SECRET_ENCRYPTION_KEY: undefined },
    ],
  ])('rejects handoff sync without %s', (missing, override) => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base_token',
        FEISHU_HANDOFF_TABLE_ID: 'tblHandoff123',
        FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/base/example',
        HANDOFF_SECRET_ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        ...override,
      }),
    ).toThrow(`${missing} is required when Feishu handoff sync is enabled`);
  });

  it('rejects a handoff encryption key that is not 64 hexadecimal characters', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base_token',
        FEISHU_HANDOFF_TABLE_ID: 'tblHandoff123',
        FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/base/example',
        HANDOFF_SECRET_ENCRYPTION_KEY: 'g'.repeat(64),
      }),
    ).toThrow(
      'HANDOFF_SECRET_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters',
    );
  });

  it('rejects a handoff cron expression that does not have five fields', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        FEISHU_HANDOFF_BASE_APP_TOKEN: 'handoff_base_token',
        FEISHU_HANDOFF_TABLE_ID: 'tblHandoff123',
        FEISHU_HANDOFF_BASE_URL: 'https://example.feishu.cn/base/example',
        FEISHU_HANDOFF_SYNC_CRON: '30 2 * *',
        HANDOFF_SECRET_ENCRYPTION_KEY:
          '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
    ).toThrow('FEISHU_HANDOFF_SYNC_CRON must be a five-field cron expression');
  });

  it('enables consumption sync only when a source URL is configured', () => {
    const base = {
      DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
      JWT_SECRET: '12345678901234567890123456789012',
    };
    expect(validateEnv(base).CONSUMPTION_SYNC_ENABLED).toBe(false);

    const result = validateEnv({
      ...base,
      CONSUMPTION_SOURCE_DATABASE_URL:
        'mysql://reader:secret@db.example.com:3306/guance_crm_v2',
      CONSUMPTION_SYNC_CRON: '0 13 * * *',
    });

    expect(result).toMatchObject({
      CONSUMPTION_SYNC_ENABLED: true,
      CONSUMPTION_SYNC_CRON: '0 13 * * *',
    });
  });

  it('rejects a non-MySQL consumption source URL', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'mysql://user:pass@localhost:3306/after_sales',
        JWT_SECRET: '12345678901234567890123456789012',
        CONSUMPTION_SOURCE_DATABASE_URL:
          'postgres://db.example.com/guance_crm_v2',
      }),
    ).toThrow(
      'CONSUMPTION_SOURCE_DATABASE_URL must be a MySQL connection string',
    );
  });
});
