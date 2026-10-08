import { CONFIG } from '../config';
import { storage } from '../storage';
import { formatScore } from '../ui';
import type { Reward } from './reward';
import { dayBefore, hash, picker } from './time';

// The daily habit: a 7-day login calendar, three daily quests and a free
// revive each day. Days turn over in UTC; quests are picked from the date, so
// everyone gets the same three. A finished quest is claimed with a tap (the
// goals screen), which pays its credits and pass XP; claiming all three pays
// cores. The weekly goals (weekly.ts) work the same way over a week.

export type QuestType = 'runs' | 'score' | 'level' | 'nearMisses' | 'pickups' | 'boost' | 'ranked' | 'rooms' | 'beatPar';

/** Targets to pick from, and whether a quest adds up across runs or takes the best one. */
const QUESTS: Record<QuestType, { targets: number[]; adds: boolean }> = {
  runs: { targets: [3, 4, 5], adds: true },
  score: { targets: [3000, 4500, 6000, 8000], adds: false },
  level: { targets: [4, 5, 6, 8], adds: false },
  nearMisses: { targets: [15, 25, 40], adds: true },
  pickups: { targets: [10, 20, 30], adds: true },
  boost: { targets: [20, 40, 60], adds: true },
  ranked: { targets: [1, 2], adds: true },
  rooms: { targets: [4, 6, 10], adds: true },
  beatPar: { targets: [1], adds: true },
};

/** Whether a quest adds up across runs (or takes the best single run). */
export function adds(type: QuestType): boolean {
  return QUESTS[type].adds;
}

export interface Quest {
  type: QuestType;
  target: number;
  progress: number;
  credits: number;
  done: boolean;
  /** Its reward has been taken (older saves paid on finishing, so done means claimed there). */
  claimed?: boolean;
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
  /** Ranked, and scored at least the league's par. */
  beatPar?: boolean;
}

/** What the goal asks, in words. `rankedOpen` false: the ranked goals take any run until ranked opens. */
export function questText(q: Quest, rankedOpen = true): string {
  const t = q.target;
  if (!rankedOpen && q.type === 'ranked') return `play ${t === 1 ? 'a run' : `${t} runs`} (any mode until ranked opens)`;
  if (!rankedOpen && q.type === 'beatPar') return `beat the bronze par ${t === 1 ? 'in a run' : `in ${t} runs`} (any mode until ranked opens)`;
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
    case 'beatPar':
      return t === 1 ? "beat your league's par in ranked" : `beat your league's par in ranked ${t} times`;
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
    case 'beatPar':
      return r.ranked && r.beatPar ? 1 : 0;
  }
}

/** Fold a run into a list of quests; returns the ones it finished. */
export function progressQuests(quests: Quest[], run: QuestRun): Quest[] {
  const done: Quest[] = [];
  for (const q of quests) {
    if (q.done) continue;
    const v = amount(q.type, run);
    q.progress = adds(q.type) ? q.progress + v : Math.max(q.progress, v);
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.done = true;
      done.push(q);
    }
  }
  return done;
}

/** The day's quests: the same for everyone on a UTC date. */
export function questsFor(day: string): Quest[] {
  const next = picker(hash(`quests-${day}`));
  const types = (Object.keys(QUESTS) as QuestType[]).filter((t) => t !== 'beatPar'); // par needs a league: weekly only
  const out: Quest[] = [];
  const Q = CONFIG.economy.quests;
  while (out.length < Q.count) {
    const type = types[Math.floor(next() * types.length)];
    if (out.some((q) => q.type === type)) continue;
    const targets = QUESTS[type].targets;
    const tier = Math.floor(next() * targets.length);
    const hard = tier / Math.max(1, targets.length - 1);
    const credits = Math.round((Q.credits[0] + (Q.credits[1] - Q.credits[0]) * hard) / 50) * 50;
    out.push({ type, target: targets[tier], progress: 0, credits, done: false, claimed: false });
  }
  return out;
}

interface Saved {
  loginDay: string; // last claim (UTC date)
  loginStep: number; // next calendar day to claim, 0..6
  questDay: string;
  quests: Quest[];
  allDonePaid: boolean; // the all-three bonus has been claimed
  reviveDay: string; // the day free revives were last used
  reviveUsed?: number; // how many that day (older saves: 1)
  rerollDay?: string; // the day a quest was last swapped (once a day)
  giftDay?: string; // the day the free gift was last taken
}

const KEY = 'endless.daily';

export class Daily {
  private s: Saved = { loginDay: '', loginStep: 0, questDay: '', quests: [], allDonePaid: false, reviveDay: '' };

  async load(day: string): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        this.s = { ...this.s, ...(JSON.parse(raw) as Partial<Saved>) };
        // Older saves paid a quest as it finished: a finished one there is already claimed.
        for (const q of this.s.quests) if (q.claimed === undefined) q.claimed = q.done;
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

  /** The UTC date today's quests belong to (YYYY-MM-DD). */
  get day(): string {
    return this.s.questDay;
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
  recordRun(day: string, run: QuestRun): Quest[] {
    this.turn(day);
    const done = progressQuests(this.s.quests, run);
    if (done.length > 0) this.save();
    return done;
  }

  /** Swap unfinished quest `i` for another kind (once a day); returns the new one, or null. */
  reroll(i: number, day: string): Quest | null {
    const q = this.s.quests[i];
    if (!q || q.done || this.s.rerollDay === day) return null;
    const taken = new Set(this.s.quests.map((x) => x.type));
    const pool = questsFor(`${day}-reroll-${i}`).concat(questsFor(`${day}-reroll-${i}-b`)).filter((x) => !taken.has(x.type));
    if (pool.length === 0) return null;
    this.s.quests[i] = pool[0];
    this.s.rerollDay = day;
    this.save();
    return pool[0];
  }

  canReroll(day: string): boolean {
    return this.s.rerollDay !== day;
  }

  /** Claim quest `i` if it's finished: returns its credits, or null. */
  claim(i: number): Quest | null {
    const q = this.s.quests[i];
    if (!q || !q.done || q.claimed) return null;
    q.claimed = true;
    this.save();
    return q;
  }

  /** The all-three bonus can be claimed: every quest claimed, bonus not yet taken. */
  get bonusReady(): boolean {
    return !this.s.allDonePaid && this.s.quests.length > 0 && this.s.quests.every((q) => q.claimed);
  }

  /** Claim the all-three bonus; returns its cores (0 if it isn't ready). */
  claimBonus(): number {
    if (!this.bonusReady) return 0;
    this.s.allDonePaid = true;
    this.save();
    return CONFIG.economy.quests.allDoneCores;
  }

  get bonusClaimed(): boolean {
    return this.s.allDonePaid;
  }

  /** How many rewards are waiting to be claimed (quests and the bonus). */
  get claimable(): number {
    return this.s.quests.filter((q) => q.done && !q.claimed).length + (this.bonusReady ? 1 : 0);
  }

  /** The free daily gift (a rewarded ad, or free with premium): once a day. */
  giftReady(day: string): boolean {
    return this.s.giftDay !== day;
  }

  takeGift(day: string): void {
    this.s.giftDay = day;
    this.save();
  }

  // --- revive ---

  /** Free revives left today, of `allowed` a day (premium allows more). */
  freeRevivesLeft(day: string, allowed = 1): number {
    const used = this.s.reviveDay === day ? (this.s.reviveUsed ?? 1) : 0;
    return Math.max(0, allowed - used);
  }

  useFreeRevive(day: string): void {
    if (this.s.reviveDay !== day) this.s = { ...this.s, reviveDay: day, reviveUsed: 0 };
    this.s.reviveUsed = (this.s.reviveUsed ?? 0) + 1;
    this.save();
  }
}
