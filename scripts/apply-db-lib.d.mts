export function applyMigrations(
  // biome-ignore lint/suspicious/noExplicitAny: rows come back in whatever shape each query asks for
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> },
  migrations: [string, string][],
  log?: (line: string) => void,
): Promise<{ applied: string[]; recorded: string[] }>;
