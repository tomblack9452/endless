import type { Backend } from './server/backend';
import { storage } from './storage';

// Credits: earned by every run (ranked at full rate, the rest at half),
// promotions and stars; spent in the hangar on upgrades and looks.
// Cores: the premium currency. Earned slowly (daily rewards, quests, the season
// pass) and, later, bought; spent on premium looks, tickets, revives and the
// pass. A server version (stage C) keeps the same methods.

const KEY = 'endless.wallet';

export class Wallet {
  credits = 0;
  earned = 0; // lifetime, for the service record
  cores = 0;
  coresEarned = 0;
  /** With a server, cores are kept there: changes go to it, and its balance wins. */
  private remote: Backend | null = null;

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { credits?: number; earned?: number; cores?: number; coresEarned?: number };
      this.credits = s.credits ?? 0;
      this.earned = s.earned ?? this.credits;
      this.cores = s.cores ?? 0;
      this.coresEarned = s.coresEarned ?? this.cores;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ credits: this.credits, earned: this.earned, cores: this.cores, coresEarned: this.coresEarned }));
  }

  add(n: number): void {
    if (n <= 0) return;
    this.credits += n;
    this.earned += n;
    this.save();
  }

  /** Spend `n` if there's enough; returns whether it went through. */
  spend(n: number): boolean {
    if (n > this.credits) return false;
    this.credits -= n;
    this.save();
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
    await this.syncCores();
  }

  private async syncCores(): Promise<void> {
    const n = await this.remote?.cores();
    if (n === null || n === undefined) return;
    this.cores = n;
    this.save();
  }
}
