export function applyMigrations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> },
  migrations: [string, string][],
  log?: (line: string) => void,
): Promise<{ applied: string[]; recorded: string[] }>;
