export interface MySqlConnectionOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

export function parseMySqlUrl(value: string): MySqlConnectionOptions {
  const url = new URL(value);
  if (url.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use mysql://');
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: Number(url.searchParams.get('connection_limit') || 5),
  };
}
