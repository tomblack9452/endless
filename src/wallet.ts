import type { Backend } from './server/backend';
import { storage } from './storage';

// Credits: earned by every run (ranked at full rate, the rest at half),
// promotions and stars; spent in the hangar on upgrades and looks.
// Cores: the premium currency. Earned slowly (daily rewards, quests, the season
// pass) and, later, bought; spent on premium looks, revives and the
// pass. With a server, cores are held there, and credits are merged with the
// server's copy (sync_credits), so either can be changed from the dashboard.

const KEY = 'endless.wallet';

export class Wallet {
  credits = 0;
  earned = 0; // lifetime, for the service record
  cores = 0;
  coresEarned = 0;
  /** With a server, cores are kept there: changes go to it, and its balance wins. */
  private remote: Backend | null = null;
  /** The server's credits at the last sync (null: never synced on this device). */
  private creditsSynced: number | null = null;
  private syncTimer = 0;
  private syncing: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { credits?: number; earned?: number; cores?: number; coresEarned?: number; synced?: number | null };
      this.credits = s.credits ?? 0;
      this.earned = s.earned ?? this.credits;
      this.cores = s.cores ?? 0;
      this.coresEarned = s.coresEarned ?? this.cores;
      this.creditsSynced = s.synced ?? null;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ credits: this.credits, earned: this.earned, cores: this.cores, coresEarned: this.coresEarned, synced: this.creditsSynced }));
  }

  /** Sync credits a moment after they change (one call for a burst of changes). */
  private queueSync(): void {
    if (!this.remote) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.syncCredits(), 3000) as unknown as number;
  }

  add(n: number): void {
    if (n <= 0) return;
    this.credits += n;
    this.earned += n;
    this.save();
    this.queueSync();
  }

  /** Spend `n` if there's enough; returns whether it went through. */
  spend(n: number): boolean {
    if (n > this.credits) return false;
    this.credits -= n;
    this.save();
    this.queueSync();
    return true;
  }

  addCores(n: number, reason = 'reward'): void {
    if (n <= 0) return;
    this.cores += n;
    this.coresEarned += n;
    this.save();
    void this.remote?.earnCores(n, reason);
  }

  spendCores(n: number, reason = 'spend'): boolean {
    if (n > this.cores) return false;
    this.cores -= n;
    this.save();
    // The server has the last word: if it refuses, take its balance.
    if (this.remote) void this.remote.spendCores(n, reason).then((ok) => (ok ? undefined : this.syncCores()));
    return true;
  }

  /** Use the server for cores from now on, starting from its balance. */
  async link(remote: Backend): Promise<void> {
    if (!remote.online) return;
    this.remote = remote;
    await this.refresh();
  }

  /** Take the server's cores and merge credits with it (at start, and when the game comes back to the front). */
  async refresh(): Promise<void> {
    if (!this.remote) return;
    await Promise.all([this.syncCores(), this.syncCredits()]);
  }

  /** Merge credits with the server's copy; one at a time, keeping anything earned while it was on its way. */
  syncCredits(): Promise<void> {
    this.syncing = this.syncing.then(async () => {
      if (!this.remote) return;
      const sent = this.credits;
      const keep = await this.remote.syncCredits(sent, this.creditsSynced).catch(() => null);
      if (keep === null) return;
      this.credits = Math.max(0, keep + (this.credits - sent));
      this.creditsSynced = keep;
      this.save();
    });
    return this.syncing;
  }

  private async syncCores(): Promise<void> {
    const n = await this.remote?.cores();
    if (n === null || n === undefined) return;
    this.cores = n;
    this.save();
  }
}
