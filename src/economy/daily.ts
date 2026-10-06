import { CONFIG } from '../config';
import { storage } from '../storage';
import { formatScore } from '../ui';
import type { Reward } from './reward';
import { dayBefore, hash, picker } from './time';

// The daily habit: a 7-day login calendar, three daily quests and a free
// revive each day. Days turn over in UTC; quests are picked from the date, so
// everyone gets the same three.

export type QuestType = 'runs' | 'score' | 'level' | 'nearMisses' | 'pickups' | 'boost' | 'ranked' | 'rooms';

/** Targets to pick from, and whether a quest adds up across runs or takes the best one. */
const QUESTS: Record<QuestType, { targets: number[]; adds: boolean }> = {
  runs: { targets: [3, 4, 5], adds: true },
  score: { targets: [3000, 4500, 6000, 8000], adds: false },
  level: { targets: [4, 5, 6, 8], adds: false },
  nearMisses: { targets: [15, 25, 40], adds: true },
  pickups: { targets: [10, 20, 30], adds: true },
  boost: { targets: [20, 40, 60], adds: true },
  ranked: { targets: [1], adds: true }, // five tries a week: one is plenty
  rooms: { targets: [4, 6, 10], adds: true },
};

export interface Quest {
  type: QuestType;
  target: number;
  progress: number;
  credits: number;
  done: boolean;
}

/** One run, as quests see it. */
export interface QuestRun {
  ranked: boolean;
  score: number;
  level: number;
  nearMisses: number;
  pickups: number;
  boostSeconds: number;
  rooms: number;
}

export function questText(q: Quest): string {
  const t = q.target;
  switch (q.type) {
    case 'runs':
      return `play ${t} runs`;
    case 'score':
      return `score ${formatScore(t)} in one run`;
    case 'level':
      return `reach level ${t}`;
    case 'nearMisses':
      return `${t} near misses`;
    case 'pickups':
      return `collect ${t} pickups`;
    case 'boost':
      return `boost for ${t} seconds`;
    case 'ranked':
      return t === 1 ? 'play a ranked run' : `play ${t} ranked runs`;
    case 'rooms':
      return `fly through ${t} ship rooms`;
  }
}

function amount(q: QuestType, r: QuestRun): number {
  switch (q) {
    case 'runs':
      return 1;
    case 'score':
      return Math.floor(r.score);
    case 'level':
      return r.level;
    case 'nearMisses':
      return r.nearMisses;
    case 'pickups':
      return r.pickups;
    case 'boost':
      return Math.floor(r.boostSeconds);
    case 'ranked':
      return r.ranked ? 1 : 0;
    case 'rooms':
      return r.rooms;
  }
}

/** The day's quests: the same for everyone on a UTC date. */
export function questsFor(day: string): Quest[] {
  const next = picker(hash(`quests-${day}`));
  const types = Object.keys(QUESTS) as QuestType[];
  const out: Quest[] = [];
  const Q = CONFIG.economy.quests;
  while (out.length < Q.count) {
    const type = types[Math.floor(next() * types.length)];
    if (out.some((q) => q.type === type)) continue;
    const targets = QUESTS[type].targets;
    const tier = Math.floor(next() * targets.length);
    const hard = tier / Math.max(1, targets.length - 1);
    const credits = Math.round((Q.credits[0] + (Q.credits[1] - Q.credits[0]) * hard) / 50) * 50;
    out.push({ type, target: targets[tier], progress: 0, credits, done: false });
  }
  return out;
}

interface Saved {
  loginDay: string; // last claim (UTC date)
  loginStep: number; // next calendar day to claim, 0..6
  questDay: string;
  quests: Quest[];
  allDonePaid: boolean;
  reviveDay: string; // the day the free revive was used
}

const KEY = 'endless.daily';

export class Daily {
  private s: Saved = { loginDay: '', loginStep: 0, questDay: '', quests: [], allDonePaid: false, reviveDay: '' };

  async load(day: string): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        this.s = { ...this.s, ...(JSON.parse(raw) as Partial<Saved>) };
      } catch {
        // Corrupt value: start the calendar again.
      }
    }
    this.turn(day);
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.s));
  }

  /** A new day: new quests (call whenever the day may have changed). */
  turn(day: string): void {
    if (this.s.questDay === day) return;
    this.s.questDay = day;
    this.s.quests = questsFor(day);
    this.s.allDonePaid = false;
    this.save();
  }

  get quests(): readonly Quest[] {
    return this.s.quests;
  }

  // --- login calendar ---

  /** The calendar day (0..6) to claim today, or -1 if today's is claimed. */
  loginDue(day: string): number {
    return this.s.loginDay === day ? -1 : this.s.loginStep;
  }

  /** Which calendar day was last claimed or is next (for drawing the calendar). */
  get loginStep(): number {
    return this.s.loginStep;
  }

  /** True if yesterday's was claimed too (a streak, for the popup's wording). */
  streak(day: string): boolean {
    return this.s.loginDay === dayBefore(day);
  }

  /** Claim today's login reward; null if already claimed. */
  claimLogin(day: string): Reward | null {
    const step = this.loginDue(day);
    if (step < 0) return null;
    const login = CONFIG.economy.login as readonly Reward[];
    this.s.loginDay = day;
    this.s.loginStep = (step + 1) % login.length;
    this.save();
    return login[step];
  }

  // --- quests ---

  /**
   * Fold a run into today's quests. Returns the quests it completed, and the
   * all-three bonus (cores) if this run finished the set.
   */
  recordRun(day: string, run: QuestRun): { done: Quest[]; allDone: number } {
    this.turn(day);
    const done: Quest[] = [];
    for (const q of this.s.quests) {
      if (q.done) continue;
      const v = amount(q.type, run);
      q.progress = QUESTS[q.type].adds ? q.progress + v : Math.max(q.progress, v);
      if (q.progress >= q.target) {
        q.progress = q.target;
        q.done = true;
        done.push(q);
      }
    }
    let allDone = 0;
    if (!this.s.allDonePaid && this.s.quests.every((q) => q.done)) {
      this.s.allDonePaid = true;
      allDone = CONFIG.economy.quests.allDoneCores;
    }
    this.save();
    return { done, allDone };
  }

  // --- revive ---

  freeRevive(day: string): boolean {
    return this.s.reviveDay !== day;
  }

  useFreeRevive(day: string): void {
    this.s.reviveDay = day;
    this.save();
  }
}
