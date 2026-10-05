// Days, weeks and seeded picks for the economy. Everything turns over in UTC,
// so a day's quests and shop (and a season) are the same for everyone at the
// same moment. Picks use their own small generator, never the course one in
// rng.ts, so opening the shop can't change a course.

const DAY = 86_400_000;

/** The UTC date as YYYY-MM-DD. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The UTC date the day before `day` (YYYY-MM-DD). */
export function dayBefore(day: string): string {
  return dayKey(Date.parse(`${day}T00:00:00Z`) - DAY);
}

/** Milliseconds until the next UTC midnight. */
export function untilTomorrow(ms: number): number {
  return DAY - (ms % DAY);
}

/** FNV-1a hash of some text: a seed for the day's picks. */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small seeded generator (mulberry32): 0..1. */
export function picker(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** "3h 20m", "12m", "40s": a wait, for refill and reset timers. */
export function formatWait(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
