import { parseMySqlUrl } from './mysql-url';

describe('parseMySqlUrl', () => {
  it('decodes credentials and connection options', () => {
    expect(
      parseMySqlUrl(
        'mysql://after_sales:p%40ss@db.internal:3307/after_sales?connection_limit=8',
      ),
    ).toEqual({
      host: 'db.internal',
      port: 3307,
      user: 'after_sales',
      password: 'p@ss',
      database: 'after_sales',
      connectionLimit: 8,
    });
  });

  it('rejects non-MySQL URLs', () => {
    expect(() => parseMySqlUrl('postgres://localhost/app')).toThrow(
      'DATABASE_URL must use mysql://',
    );
  });
});
