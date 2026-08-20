process.env.DATABASE_URL ??=
  'mysql://test:test@127.0.0.1:3306/after_sales_test';
process.env.JWT_SECRET ??= 'test-secret-that-is-at-least-32-characters';
process.env.HOST ??= '127.0.0.1';
process.env.COOKIE_SECURE ??= 'false';
process.env.PORT ??= '3000';
