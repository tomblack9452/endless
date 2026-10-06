import { CONFIG } from './config';

// Seasons: six weeks each (the season pass, the generated season looks), the
// same moment for everyone (UTC Mondays).

/** Monday 14 Sep 2026 (UTC): season 1 starts here. */
const EPOCH = Date.UTC(2026, 8, 14);
const WEEK = 7 * 86_400_000;

export function seasonAt(ms: number): { season: number; start: number; end: number } {
  const len = CONFIG.economy.pass.weeks * WEEK;
  const n = Math.floor((ms - EPOCH) / len);
  return { season: n + 1, start: EPOCH + n * len, end: EPOCH + (n + 1) * len };
}
