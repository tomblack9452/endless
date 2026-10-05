import { rankName } from './ranks';
import { storage } from './storage';

// Ship upgrades: solo only. Ranked and daily runs always fly the standard ship
// (STANDARD below) so their scores stay comparable. Six systems, five tiers
// each, bought with credits; the top tiers also need a rank, so ranked play
// is what opens up the strongest solo ship.

export type SystemId = 'thrusters' | 'capacitor' | 'tractor' | 'deflector' | 'stabilisers' | 'scanner';

export interface SystemDef {
  id: SystemId;
  name: string;
  /** What the system does at `tier` (1..5), for the hangar. */
  effect(tier: number): string;
}

export const SYSTEMS: readonly SystemDef[] = [
  { id: 'thrusters', name: 'thrusters', effect: (t) => `boost lasts ${t * 8}% longer` },
  { id: 'capacitor', name: 'capacitor', effect: (t) => `boost refills ${t * 10}% faster` },
  { id: 'tractor', name: 'tractor beam', effect: (t) => `pickup reach +${t * 12}%, magnet +${t}s` },
  {
    id: 'deflector',
    name: 'deflector',
    effect: (t) => (t >= 5 ? `shield grace +${(t * 0.2).toFixed(1)}s, start every run shielded` : `shield grace +${(t * 0.2).toFixed(1)}s`),
  },
  { id: 'stabilisers', name: 'stabilisers', effect: (t) => `steering ${t * 3}% quicker` },
  { id: 'scanner', name: 'scanner', effect: (t) => `power-ups ${t * 8}% more often` },
];

export const MAX_TIER = 5;
/** Credits for tier 1..5. */
export const TIER_COST = [150, 400, 1000, 2500, 6000];
/** Rank index needed for tier 1..5 (7 = sergeant, 13 = lieutenant). */
export const TIER_RANK = [0, 0, 0, 7, 13];

/** What the ship's systems add up to for a run. */
export interface ShipStats {
  boostDrain: number; // multiplier on how long a full meter lasts
  boostFill: number; // multiplier on refill speed
  collect: number; // multiplier on pickup reach
  magnetExtra: number; // seconds
  graceExtra: number; // seconds
  startShield: boolean;
  steer: number; // multiplier on sideways speed
  powerRate: number; // multiplier on how often power-ups appear
}

/** The standard ship: what ranked and daily runs use. */
export const STANDARD: ShipStats = {
  boostDrain: 1,
  boostFill: 1,
  collect: 1,
  magnetExtra: 0,
  graceExtra: 0,
  startShield: false,
  steer: 1,
  powerRate: 1,
};

export function statsFor(tiers: Partial<Record<SystemId, number>>): ShipStats {
  const t = (id: SystemId) => tiers[id] ?? 0;
  return {
    boostDrain: 1 + 0.08 * t('thrusters'),
    boostFill: 1 + 0.1 * t('capacitor'),
    collect: 1 + 0.12 * t('tractor'),
    magnetExtra: t('tractor'),
    graceExtra: 0.2 * t('deflector'),
    startShield: t('deflector') >= 5,
    steer: 1 + 0.03 * t('stabilisers'),
    powerRate: 1 + 0.08 * t('scanner'),
  };
}

export type BuyCheck = { ok: true; cost: number } | { ok: false; reason: string };

const KEY = 'endless.upgrades';

export class Upgrades {
  tiers: Partial<Record<SystemId, number>> = {};

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      this.tiers = JSON.parse(raw) as Partial<Record<SystemId, number>>;
    } catch {
      // Corrupt value: start fresh.
    }
  }

  save(): void {
    void storage.set(KEY, JSON.stringify(this.tiers));
  }

  tier(id: SystemId): number {
    return this.tiers[id] ?? 0;
  }

  /** Can the next tier of `id` be bought with `credits` at rank `rank`? */
  check(id: SystemId, credits: number, rank: number): BuyCheck {
    const next = this.tier(id) + 1;
    if (next > MAX_TIER) return { ok: false, reason: 'maxed' };
    const needRank = TIER_RANK[next - 1];
    if (rank < needRank) return { ok: false, reason: `needs ${rankName(needRank)}` };
    const cost = TIER_COST[next - 1];
    if (credits < cost) return { ok: false, reason: `${cost.toLocaleString('en-US')} credits` };
    return { ok: true, cost };
  }

  raise(id: SystemId): void {
    this.tiers[id] = Math.min(MAX_TIER, this.tier(id) + 1);
    this.save();
  }

  stats(): ShipStats {
    return statsFor(this.tiers);
  }
}
