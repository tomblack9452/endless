import { CONFIG } from '../config';
import { storage } from '../storage';

// Ranked tickets: one per ranked attempt. They refill one at a time up to the
// cap; tickets from rewards or bought with cores can go over it (refilling
// waits until you're back under). A server version (stage C) keeps the same
// methods with the count held there.

const KEY = 'endless.tickets';

export class Tickets {
  count: number = CONFIG.economy.tickets.max;
  /** When the refill clock last ticked (ms); only counts while under the cap. */
  private since = 0;

  private get period(): number {
    return CONFIG.economy.tickets.refillMinutes * 60_000;
  }

  async load(now: number): Promise<void> {
    const raw = await storage.get(KEY);
    this.since = now;
    if (raw) {
      try {
        const s = JSON.parse(raw) as { count?: number; since?: number };
        this.count = Math.max(0, s.count ?? this.count);
        this.since = Math.min(now, s.since ?? now);
      } catch {
        // Corrupt value: a full set.
      }
    }
    this.refill(now);
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ count: this.count, since: this.since }));
  }

  /** Add the tickets that have refilled since last time. */
  refill(now: number): void {
    const max = CONFIG.economy.tickets.max;
    if (this.count >= max) {
      this.since = now;
      return;
    }
    const n = Math.floor((now - this.since) / this.period);
    if (n <= 0) return;
    this.count = Math.min(max, this.count + n);
    this.since = this.count >= max ? now : this.since + n * this.period;
    this.save();
  }

  /** Milliseconds until the next ticket refills (0 when full). */
  nextIn(now: number): number {
    if (this.count >= CONFIG.economy.tickets.max) return 0;
    return Math.max(0, this.since + this.period - now);
  }

  /** Use one for a ranked attempt; false if there are none. */
  use(now: number): boolean {
    this.refill(now);
    if (this.count <= 0) return false;
    if (this.count >= CONFIG.economy.tickets.max) this.since = now; // the clock starts now
    this.count--;
    this.save();
    return true;
  }

  add(n: number): void {
    this.count += n;
    this.save();
  }
}
