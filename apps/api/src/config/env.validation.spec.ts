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
        PORT: '3100',
        COOKIE_SECURE: 'true',
      }),
    ).toMatchObject({ PORT: 3100, COOKIE_SECURE: true });
  });
});
