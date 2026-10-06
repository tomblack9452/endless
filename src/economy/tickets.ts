import { CONFIG } from '../config';
import { weekKey } from '../leagues';
import { storage } from '../storage';

// Ranked tickets: one per attempt at the week's ranked run. Everyone gets a
// fresh set each week (Monday, UTC); tickets from rewards or bought with
// cores come on top and carry over. A server version (stage C) keeps the
// same methods with the count held there.

const KEY = 'endless.tickets';
const WEEK = 7 * 86_400_000;

export class Tickets {
  count: number = CONFIG.economy.tickets.perWeek;
  private week = '';

  async load(now: number): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw) as { count?: number; week?: string };
        this.count = Math.max(0, s.count ?? this.count);
        this.week = s.week ?? '';
      } catch {
        // Corrupt value: a fresh set.
      }
    }
    this.refill(now);
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ count: this.count, week: this.week }));
  }

  /** A new week tops the count back up to the weekly allowance. */
  refill(now: number): void {
    const week = weekKey(now);
    if (week === this.week) return;
    this.week = week;
    this.count = Math.max(this.count, CONFIG.economy.tickets.perWeek);
    this.save();
  }

  /** Milliseconds until the next week's tickets. */
  nextIn(now: number): number {
    return Date.parse(`${weekKey(now)}T00:00:00Z`) + WEEK - now;
  }

  /** Use one for a ranked attempt; false if there are none. */
  use(now: number): boolean {
    this.refill(now);
    if (this.count <= 0) return false;
    this.count--;
    this.save();
    return true;
  }

  add(n: number): void {
    this.count += n;
    this.save();
  }
}
