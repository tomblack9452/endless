import { storage } from './storage';

// Which goals have been claimed (paid), and which the player has been told are
// finished. The goals themselves are counted from stats the game keeps
// (achievements.ts); a finished goal is announced once, then waits on the goals
// screen to be claimed.

const KEY = 'endless.goals';

export class GoalLog {
  private done = new Set<string>(); // claimed
  private seen = new Set<string>(); // announced as finished
  /** False until the log has ever been written: a first run on a save that already has progress. */
  started = false;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { done?: string[]; seen?: string[] };
      this.done = new Set(s.done ?? []);
      this.seen = new Set([...(s.seen ?? []), ...this.done]);
      this.started = true;
    } catch {
      // Corrupt value: start again (silently, see startWith).
    }
  }

  has(id: string): boolean {
    return this.done.has(id);
  }

  add(id: string): void {
    this.done.add(id);
    this.seen.add(id);
  }

  /** Announced as finished (it may still be waiting to be claimed). */
  seenDone(id: string): boolean {
    return this.seen.has(id);
  }

  markSeen(id: string): void {
    this.seen.add(id);
  }

  save(): void {
    this.started = true;
    void storage.set(KEY, JSON.stringify({ done: [...this.done], seen: [...this.seen] }));
  }

  /** First time on a save with progress: what's already done counts, with no payout or fanfare. */
  startWith(ids: Iterable<string>): void {
    for (const id of ids) this.add(id);
    this.save();
  }
}
