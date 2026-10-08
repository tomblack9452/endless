import { CONFIG } from '../config';
import { storage } from '../storage';
import { adds, progressQuests, type Quest, type QuestRun, type QuestType } from './daily';
import { hash, picker } from './time';

// Weekly goals: five harder ones that span many runs, the same for everyone,
// new every Monday (UTC, the same week as ranked). Each is claimed with a tap
// for credits and a lot of pass XP; claiming all five pays cores.

const WEEKLY: Partial<Record<QuestType, number[]>> = {
  runs: [30, 40, 60],
  nearMisses: [300, 500, 800],
  pickups: [200, 350, 500],
  boost: [300, 500, 800],
  rooms: [40, 60, 90],
  ranked: [5, 10, 15],
  beatPar: [2, 3, 5],
  score: [8000, 12000, 16000],
  level: [10, 13, 16],
};

/** The week's goals (`week` is its Monday, YYYY-MM-DD): the same for everyone. */
export function weeklyFor(week: string): Quest[] {
  const next = picker(hash(`weekly-${week}`));
  const types = Object.keys(WEEKLY) as QuestType[];
  const W = CONFIG.economy.weekly;
  const out: Quest[] = [];
  while (out.length < W.count) {
    const type = types[Math.floor(next() * types.length)];
    if (out.some((q) => q.type === type)) continue;
    // Best-of goals (one great run) are rarer: at most one a week.
    if (!adds(type) && out.some((q) => !adds(q.type))) continue;
    const targets = WEEKLY[type]!;
    out.push({ type, target: targets[Math.floor(next() * targets.length)], progress: 0, credits: W.credits, done: false, claimed: false });
  }
  return out;
}

interface Saved {
  week: string;
  goals: Quest[];
  bonusPaid: boolean;
}

const KEY = 'endless.weekly';

export class Weekly {
  private s: Saved = { week: '', goals: [], bonusPaid: false };

  async load(week: string): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        this.s = { ...this.s, ...(JSON.parse(raw) as Partial<Saved>) };
      } catch {
        // Corrupt value: a fresh week.
      }
    }
    this.turn(week);
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.s));
  }

  /** A new week: new goals (call whenever the week may have changed). */
  turn(week: string): void {
    if (this.s.week === week) return;
    this.s = { week, goals: weeklyFor(week), bonusPaid: false };
    this.save();
  }

  get goals(): readonly Quest[] {
    return this.s.goals;
  }

  /** The Monday these goals belong to (YYYY-MM-DD). */
  get week(): string {
    return this.s.week;
  }

  recordRun(week: string, run: QuestRun): Quest[] {
    this.turn(week);
    const done = progressQuests(this.s.goals, run);
    if (done.length > 0) this.save();
    return done;
  }

  claim(i: number): Quest | null {
    const q = this.s.goals[i];
    if (!q || !q.done || q.claimed) return null;
    q.claimed = true;
    this.save();
    return q;
  }

  get bonusReady(): boolean {
    return !this.s.bonusPaid && this.s.goals.length > 0 && this.s.goals.every((q) => q.claimed);
  }

  get bonusClaimed(): boolean {
    return this.s.bonusPaid;
  }

  claimBonus(): number {
    if (!this.bonusReady) return 0;
    this.s.bonusPaid = true;
    this.save();
    return CONFIG.economy.weekly.allDoneCores;
  }

  get claimable(): number {
    return this.s.goals.filter((q) => q.done && !q.claimed).length + (this.bonusReady ? 1 : 0);
  }
}
