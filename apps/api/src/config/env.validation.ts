export interface AppEnvironment {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  COOKIE_SECURE: boolean;
}

export function validateEnv(input: Record<string, unknown>): AppEnvironment {
  const databaseUrl = String(input.DATABASE_URL ?? '');
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must be a MySQL connection string');
  }

  const jwtSecret = String(input.JWT_SECRET ?? '');
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }

  const port = Number(input.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }

  const secureValue = String(input.COOKIE_SECURE ?? 'false').toLowerCase();
  if (!['true', 'false'].includes(secureValue)) {
    throw new Error('COOKIE_SECURE must be true or false');
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    PORT: port,
    COOKIE_SECURE: secureValue === 'true',
  };
}
