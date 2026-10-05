import { LEAGUES } from './leagues';
import { storage } from './storage';

// Ship upgrades: solo only. Ranked and daily runs always fly the standard ship
// (STANDARD below) so their scores stay comparable. Six systems, five tiers
// each, bought with credits; tiers 3-5 also need a league (see leagues.ts),
// and each tier owned is one upgrade point towards the next league.

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
/** Credits for tier 1..5: 41,000 a system, 246,000 for the whole ship. */
export const TIER_COST = [500, 1500, 4000, 10000, 25000];
/** League needed for tier 1..5 (2 = gold, 3 = platinum, 4 = diamond). */
export const TIER_LEAGUE = [0, 0, 2, 3, 4];

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
  /** Bought systems switched off in the hangar (they keep their tier). */
  private off = new Set<SystemId>();

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { tiers?: Partial<Record<SystemId, number>>; off?: SystemId[] } & Partial<Record<SystemId, number>>;
      // Older saves were just the tiers.
      this.tiers = s.tiers ?? (s as Partial<Record<SystemId, number>>);
      this.off = new Set(s.off ?? []);
    } catch {
      // Corrupt value: start fresh.
    }
  }

  save(): void {
    void storage.set(KEY, JSON.stringify({ tiers: this.tiers, off: [...this.off] }));
  }

  isOn(id: SystemId): boolean {
    return !this.off.has(id);
  }

  /** Switch a bought system on or off. */
  toggle(id: SystemId): void {
    if (this.tier(id) === 0) return;
    if (this.off.has(id)) this.off.delete(id);
    else this.off.add(id);
    this.save();
  }

  tier(id: SystemId): number {
    return this.tiers[id] ?? 0;
  }

  /** Can the next tier of `id` be bought with `credits` in league `league`? */
  check(id: SystemId, credits: number, league: number): BuyCheck {
    const next = this.tier(id) + 1;
    if (next > MAX_TIER) return { ok: false, reason: 'maxed' };
    const needLeague = TIER_LEAGUE[next - 1];
    if (league < needLeague) return { ok: false, reason: `needs ${LEAGUES[needLeague].name}` };
    const cost = TIER_COST[next - 1];
    if (credits < cost) return { ok: false, reason: `${cost.toLocaleString('en-US')} credits` };
    return { ok: true, cost };
  }

  /** Upgrade points owned: one per tier. */
  points(): number {
    let n = 0;
    for (const s of SYSTEMS) n += this.tier(s.id);
    return n;
  }

  /** Upgrade points on systems that are switched on. */
  activePoints(): number {
    let n = 0;
    for (const s of SYSTEMS) if (this.isOn(s.id)) n += this.tier(s.id);
    return n;
  }

  raise(id: SystemId): void {
    this.tiers[id] = Math.min(MAX_TIER, this.tier(id) + 1);
    this.save();
  }

  /** The ship's systems with switched-off ones left out. */
  stats(): ShipStats {
    const on: Partial<Record<SystemId, number>> = {};
    for (const [id, t] of Object.entries(this.tiers) as [SystemId, number][]) if (this.isOn(id)) on[id] = t;
    return statsFor(on);
  }
}
