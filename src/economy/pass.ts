import { CONFIG } from '../config';
import { storage } from '../storage';
import { seasonAt } from '../season';
import { seasonPassKeys } from '../seasonLooks';
import type { Reward } from './reward';

// The season pass: six weeks (six weekly levels), thirty tiers of XP. Runs
// and daily quests earn XP. Every tier pays on the free track; the premium
// track (cores now, a purchase later) pays more, with the pass looks. Rewards
// are paid as tiers are reached; unlocking premium pays every premium tier
// already reached.

export { seasonAt };

/** A generated season look as a reward, or cores if it was vetoed (CONFIG.seasons.overrides). */
function seasonLook(key: string, cores: number): Reward {
  return CONFIG.seasons.overrides[key]?.veto ? { cores } : { look: key };
}

/** The free track's reward at a tier (1-based) in `season`. From season 2 its tier 25 is a generated paint. */
export function freeReward(tier: number, season = 1): Reward {
  if (season >= 2 && tier === 25) return seasonLook(seasonPassKeys(season).f1, 10);
  if (tier % 10 === 0) return { cores: tier };
  if (tier % 5 === 0) return { cores: 5 };
  return { credits: 50 + 5 * tier };
}

/** The premium track's reward at a tier (1-based) in `season`. Season 1's looks were hand-made; later ones are generated. */
export function premiumReward(tier: number, season = 1): Reward {
  if (season >= 2) {
    const k = seasonPassKeys(season);
    if (tier === 10) return seasonLook(k.p1, 30);
    if (tier === 15) return seasonLook(k.e1, 30);
    if (tier === 20) return seasonLook(k.d1, 30);
    if (tier === 30) return { ...seasonLook(k.p2, 30), cores: 50 };
  }
  if (tier === 10) return { look: 'paint:frost' };
  if (tier === 15) return { look: 'engine:solar' };
  if (tier === 20) return { look: 'hull:raptor' };
  if (tier === 30) return { look: 'paint:ember', cores: 50 };
  if (tier % 5 === 0) return { cores: 20 };
  if (tier % 3 === 0) return { cores: 15 };
  return { credits: 250 + 20 * tier };
}

interface Saved {
  season: number;
  xp: number;
  premium: boolean;
  paidFree: number; // tiers paid on each track
  paidPremium: number;
  /** 2 since tiers took 600 XP (they took 120): older saves are scaled up once to keep their tier. */
  v?: number;
}

const KEY = 'endless.pass';
const OLD_XP_PER_TIER = 120;

export class Pass {
  private s: Saved = { season: 0, xp: 0, premium: false, paidFree: 0, paidPremium: 0, v: 2 };

  async load(now: number): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<Saved>;
        this.s = { ...this.s, ...saved };
        if (!saved.v) this.s = { ...this.s, xp: Math.round(((saved.xp ?? 0) * CONFIG.economy.pass.xpPerTier) / OLD_XP_PER_TIER), v: 2 };
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
    this.s = { season, xp: 0, premium: false, paidFree: 0, paidPremium: 0, v: 2 };
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
    while (this.s.paidFree < t) out.push(freeReward(++this.s.paidFree, this.s.season));
    if (this.s.premium) while (this.s.paidPremium < t) out.push(premiumReward(++this.s.paidPremium, this.s.season));
    this.save();
    return out;
  }
}

/** Pass XP for a run's score. */
export function runXp(score: number): number {
  const P = CONFIG.economy.pass;
  return Math.min(P.runXpMax, Math.floor(score / P.runXpPer));
}
