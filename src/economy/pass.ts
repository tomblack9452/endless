import { CONFIG } from '../config';
import { storage } from '../storage';
import type { Reward } from './reward';

// The season pass: six weeks (six weekly levels), thirty tiers of XP. Runs
// and daily quests earn XP. Every tier pays on the free track; the premium
// track (cores now, a purchase later) pays more, with the pass looks. Rewards
// are paid as tiers are reached; unlocking premium pays every premium tier
// already reached.

/** Monday 14 Sep 2026 (UTC): season 1 starts here. */
const EPOCH = Date.UTC(2026, 8, 14);
const WEEK = 7 * 86_400_000;

export function seasonAt(ms: number): { season: number; start: number; end: number } {
  const len = CONFIG.economy.pass.weeks * WEEK;
  const n = Math.floor((ms - EPOCH) / len);
  return { season: n + 1, start: EPOCH + n * len, end: EPOCH + (n + 1) * len };
}

/** The free track's reward at a tier (1-based). */
export function freeReward(tier: number): Reward {
  if (tier % 10 === 0) return { tickets: tier / 10 };
  if (tier % 5 === 0) return { cores: 5 };
  return { credits: 100 + 10 * tier };
}

/** The premium track's reward at a tier (1-based). */
export function premiumReward(tier: number): Reward {
  if (tier === 10) return { look: 'paint:frost' };
  if (tier === 15) return { look: 'engine:solar' };
  if (tier === 20) return { look: 'hull:raptor' };
  if (tier === 30) return { look: 'paint:ember', cores: 50 };
  if (tier % 5 === 0) return { tickets: 2 };
  if (tier % 3 === 0) return { cores: 15 };
  return { credits: 250 + 20 * tier };
}

interface Saved {
  season: number;
  xp: number;
  premium: boolean;
  paidFree: number; // tiers paid on each track
  paidPremium: number;
}

const KEY = 'endless.pass';

export class Pass {
  private s: Saved = { season: 0, xp: 0, premium: false, paidFree: 0, paidPremium: 0 };

  async load(now: number): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        this.s = { ...this.s, ...(JSON.parse(raw) as Partial<Saved>) };
      } catch {
        // Corrupt value: a fresh pass.
      }
    }
    this.turn(now);
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify(this.s));
  }

  /** A new season starts the pass again. */
  turn(now: number): void {
    const { season } = seasonAt(now);
    if (this.s.season === season) return;
    this.s = { season, xp: 0, premium: false, paidFree: 0, paidPremium: 0 };
    this.save();
  }

  get season(): number {
    return this.s.season;
  }
  get xp(): number {
    return this.s.xp;
  }
  get premium(): boolean {
    return this.s.premium;
  }

  /** Tiers reached (0..tiers). */
  get tier(): number {
    const P = CONFIG.economy.pass;
    return Math.min(P.tiers, Math.floor(this.s.xp / P.xpPerTier));
  }

  /** XP into the current tier, 0..1. */
  get tierFraction(): number {
    const P = CONFIG.economy.pass;
    return this.tier >= P.tiers ? 1 : (this.s.xp % P.xpPerTier) / P.xpPerTier;
  }

  /** Add XP; returns the rewards for any tiers it reached. */
  addXp(now: number, xp: number): Reward[] {
    this.turn(now);
    if (xp > 0) this.s.xp += Math.floor(xp);
    return this.pay();
  }

  /** Unlock the premium track; returns the premium rewards already reached. */
  unlockPremium(): Reward[] {
    this.s.premium = true;
    return this.pay();
  }

  private pay(): Reward[] {
    const out: Reward[] = [];
    const t = this.tier;
    while (this.s.paidFree < t) out.push(freeReward(++this.s.paidFree));
    if (this.s.premium) while (this.s.paidPremium < t) out.push(premiumReward(++this.s.paidPremium));
    this.save();
    return out;
  }
}

/** Pass XP for a run's score. */
export function runXp(score: number): number {
  const P = CONFIG.economy.pass;
  return Math.min(P.runXpMax, Math.floor(score / P.runXpPer));
}
