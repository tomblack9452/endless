export function statements(sql: string): string[];
export function parts(sql: string, limit: number): string[];
export const PART_LIMIT: number;
export function partFiles(sql: string, limit?: number): { name: string; text: string }[];
