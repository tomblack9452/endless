import type { Backend } from '../server/backend';
import { storage } from '../core/storage';

// Credits: earned by every run (ranked at full rate, the rest at half),
// promotions and stars; spent in the hangar on upgrades and looks.
// Cores: the premium currency. Earned slowly (daily rewards, quests, the season
// pass) and, later, bought; spent on premium looks, revives and the
// pass. With a server, cores are held there, and credits are merged with the
// server's copy (sync_credits), so either can be changed from the dashboard.
// A cores change the server didn't hear about (no signal) waits in a list on
// this device and is sent, in order, before the server's balance is taken
// again: otherwise coming back online would undo it (a spend refunded, a
// reward lost). Each spend has its own id, so one sent again after its answer
// was lost isn't charged twice.

const KEY = 'endless.wallet';
/** Cores changes waiting for the server (this device only, never in the cloud save: see sync.ts). */
export const CORES_PENDING_KEY = 'endless.coresPending';
/** A long spell without a signal keeps the latest changes, not everything. */
const MAX_PENDING = 100;

interface CoresChange {
  kind: 'earn' | 'spend';
  n: number;
  reason: string;
  /** A spend's own id: sent again after a lost answer, the server knows it took it already. */
  id?: string;
}

/** A fresh id for a spend (random; older webviews without randomUUID get one from Math.random). */
function spendId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}

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
  /** Cores changes not yet taken by the server, oldest first. */
  private pending: CoresChange[] = [];
  private sending: Promise<void> = Promise.resolve();

  async load(): Promise<void> {
    try {
      const waiting = JSON.parse((await storage.get(CORES_PENDING_KEY)) ?? '[]') as CoresChange[];
      if (Array.isArray(waiting)) this.pending = [...waiting, ...this.pending];
    } catch {
      // Unreadable: nothing waiting.
    }
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
    void storage.set(
      KEY,
      JSON.stringify({ credits: this.credits, earned: this.earned, cores: this.cores, coresEarned: this.coresEarned, synced: this.creditsSynced }),
    );
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
    // The server decides what a reward is worth (earn_cores): take its balance after.
    this.queueCores({ kind: 'earn', n, reason });
  }

  spendCores(n: number, reason = 'spend'): boolean {
    if (n > this.cores) return false;
    this.cores -= n;
    this.save();
    // The server has the last word: if it refuses, take its balance.
    this.queueCores({ kind: 'spend', n, reason, id: spendId() });
    return true;
  }

  /** Cores changes still waiting for a signal. */
  get coresWaiting(): number {
    return this.pending.length;
  }

  private queueCores(change: CoresChange): void {
    this.pending.push(change);
    if (this.pending.length > MAX_PENDING) this.pending.splice(0, this.pending.length - MAX_PENDING);
    this.savePending();
    if (this.remote) void this.sendCores();
  }

  private savePending(): void {
    void storage.set(CORES_PENDING_KEY, JSON.stringify(this.pending));
  }

  /** Send the waiting cores changes in order, one at a time; once none are left, take the server's balance. */
  private sendCores(): Promise<void> {
    this.sending = this.sending.then(async () => {
      const remote = this.remote;
      if (!remote) return;
      while (this.pending.length > 0) {
        const c = this.pending[0];
        const answer =
          c.kind === 'earn' ? await remote.earnCores(c.n, c.reason).catch(() => null) : await remote.spendCores(c.n, c.reason, c.id).catch(() => null);
        if (answer === null) return; // no answer: keep it (and the device's balance) for the next try
        this.pending.shift();
        this.savePending();
      }
      await this.syncCores();
    });
    return this.sending;
  }

  /** Use the server for cores from now on, starting from its balance. */
  async link(remote: Backend): Promise<void> {
    if (!remote.online) {
      // No server in this build: the device's balance is the only one, with nothing to send.
      this.pending = [];
      this.savePending();
      return;
    }
    this.remote = remote;
    await this.refresh();
  }

  /** Take the server's cores and merge credits with it (at start, and when the game comes back to the front). */
  async refresh(): Promise<void> {
    if (!this.remote) return;
    await Promise.all([this.sendCores(), this.syncCredits()]);
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
    if (this.pending.length > 0) return; // the server hasn't heard about everything yet
    const n = await this.remote?.cores();
    if (n === null || n === undefined) return;
    this.cores = n;
    this.save();
  }
}
