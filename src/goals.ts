import { storage } from './storage';

// Which goals have been finished and paid. The goals themselves are counted from
// stats the game keeps (achievements.ts); this only remembers which ones the
// player has already been told about, so each pays once.

const KEY = 'endless.goals';

export class GoalLog {
  private done = new Set<string>();
  /** False until the log has ever been written: a first run on a save that already has progress. */
  started = false;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { done?: string[] };
      this.done = new Set(s.done ?? []);
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
  }

  save(): void {
    this.started = true;
    void storage.set(KEY, JSON.stringify({ done: [...this.done] }));
  }

  /** First time on a save with progress: what's already done counts, with no payout or fanfare. */
  startWith(ids: Iterable<string>): void {
    for (const id of ids) this.done.add(id);
    this.save();
  }
}
