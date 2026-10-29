// Text formats shared by several screens.
import { formatScore } from './ui';

/** "1:23.4" */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

/** "+250 credits" lines from several promotions at once, added into one. */
export function mergeCredits(lines: string[]): string[] {
  let credits = 0;
  const rest: string[] = [];
  for (const l of lines) {
    const m = /^\+([\d,]+) credits$/.exec(l);
    if (m) credits += Number(m[1].replace(/,/g, ''));
    else if (!rest.includes(l)) rest.push(l);
  }
  return credits > 0 ? [`+${formatScore(credits)} credits`, ...rest] : rest;
}
