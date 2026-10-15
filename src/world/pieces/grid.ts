/**
 * Build a piece's grid from [count, line] pairs: each line repeated `count`
 * times, near end first. Keeps long rooms readable: a stretch of identical
 * rows is one line with how many rows it lasts.
 */
export function grid(...parts: [number, string][]): string {
  const out: string[] = [];
  for (const [n, line] of parts) for (let i = 0; i < n; i++) out.push(line);
  return out.join('\n');
}
