import { type Achievement, achievement } from './achievements';
import { LOOKS } from './catalogue';
import { LEAGUES } from './leagues';
import { rankName } from './ranks';
import { storage } from './storage';

// Ship looks: what the ship wears. Purely cosmetic (every hull shares one
// hitbox), so they're allowed in ranked too. The catalogue and the ways to get
// each item are in catalogue.ts; this is the rules (what you own, what's on)
// and how an unlock reads in words.

export { LOOKS };

/** The hulls and flame styles (drawn in player.ts and trail.ts). */
export type ShipId = 'dart' | 'wing' | 'needle' | 'manta' | 'arrow' | 'talon' | 'viper' | 'nova' | 'phantom' | 'raptor' | 'kite' | 'comet' | 'halo';
export type TrailId = 'none' | 'line' | 'dashes' | 'ion' | 'triple' | 'wide' | 'long' | 'twin' | 'pulse' | 'ribbon' | 'crown';

export type Slot = 'hull' | 'paint' | 'markings' | 'fins' | 'engine' | 'decal' | 'trail';
export type Marking = 'none' | 'stripe' | 'twin' | 'chevron' | 'twotone' | 'split' | 'nose' | 'tips' | 'spine' | 'hazard' | 'checker' | 'dots' | 'rings';
export type Fin = 'none' | 'tail' | 'twin' | 'winglets' | 'blade' | 'crest' | 'swept';

export type Unlock =
  | { by: 'free' }
  | { by: 'credits'; cost: number }
  | { by: 'cores'; cost: number } // the premium currency (the shop sells these too)
  | { by: 'reward'; from: 'login' | 'pass' }
  | { by: 'rank'; rank: number }
  | { by: 'stars'; stars: number }
  | { by: 'league'; league: number }
  | { by: 'achievement'; id: string } // finishing a goal (achievements.ts)
  | { by: 'vault'; cost: number } // sold in the shop's vault, a month at a time, for cores
  | { by: 'premium' }; // owned while the player has the one-off premium unlock

export interface LookItem {
  slot: Slot;
  id: string;
  name: string;
  unlock: Unlock;
  /** Paint: top and shade. Engine: the flame's root and tip. */
  colors?: [string, string];
}

export const SLOTS: Slot[] = ['hull', 'paint', 'markings', 'fins', 'engine', 'decal', 'trail'];
export const SLOT_NAMES: Record<Slot, string> = {
  hull: 'hull',
  paint: 'paint',
  markings: 'markings',
  fins: 'fins',
  engine: 'engine colour',
  decal: 'wing decal',
  trail: 'flame',
};

export function itemsIn(slot: Slot): LookItem[] {
  return LOOKS.filter((l) => l.slot === slot);
}

export function find(slot: Slot, id: string): LookItem {
  return LOOKS.find((l) => l.slot === slot && l.id === id) ?? itemsIn(slot)[0];
}

export function keyOf(item: LookItem): string {
  return `${item.slot}:${item.id}`;
}

/** An item from its "slot:id" key. */
export function byKey(key: string): LookItem | undefined {
  const [slot, id] = key.split(':');
  return LOOKS.find((l) => l.slot === slot && l.id === id);
}

/** What the player has to unlock an item, for checking it. */
export interface Owner {
  rank: number;
  stars: number;
  league: number;
  /** Owns the one-off premium unlock (src/store/entitlements.ts). */
  premium: boolean;
  /** A goal's progress. */
  goal(id: string): { have: number; target: number; done: boolean };
}

/** How an item unlocks, in words (for the hangar). */
export function unlockText(u: Unlock): string {
  switch (u.by) {
    case 'free':
      return '';
    case 'premium':
      return 'premium';
    case 'credits':
      return `${u.cost.toLocaleString('en-US')} credits`;
    case 'cores':
      return `${u.cost.toLocaleString('en-US')} cores`;
    case 'vault':
      return `the vault · ${u.cost.toLocaleString('en-US')} cores`;
    case 'reward':
      return u.from === 'login' ? 'daily login reward' : 'season pass';
    case 'rank':
      return `rank ${rankName(u.rank)}`;
    case 'stars':
      return `${u.stars} stars`;
    case 'league':
      return `${LEAGUES[u.league].name} league`;
    case 'achievement': {
      const a: Achievement | undefined = achievement(u.id);
      return a ? `goal: ${a.text}` : 'a goal';
    }
  }
}

/** How far along an item's way to unlock you are, for the ones with a count to reach. */
export function unlockProgress(u: Unlock, o: Owner): { have: number; target: number } | null {
  switch (u.by) {
    case 'rank':
      return { have: Math.min(o.rank, u.rank), target: u.rank };
    case 'stars':
      return { have: Math.min(o.stars, u.stars), target: u.stars };
    case 'league':
      return { have: Math.min(o.league, u.league), target: u.league };
    case 'achievement': {
      const g = o.goal(u.id);
      return { have: g.have, target: g.target };
    }
    default:
      return null;
  }
}

/** True for looks you pay for. */
export function buyable(item: LookItem): boolean {
  return item.unlock.by === 'credits' || item.unlock.by === 'cores' || item.unlock.by === 'vault';
}

const KEY = 'endless.looks';

type Equipped = Record<Slot, string>;

export class Looks {
  /** Bought (credits or cores) or given as a reward; rank, star, goal and free items are owned when earned. */
  private bought = new Set<string>();
  equipped: Equipped = { hull: 'dart', paint: 'standard', markings: 'none', fins: 'none', engine: 'standard', decal: 'none', trail: 'none' };
  /** Sets whose completion bonus has been paid. */
  private paidSets = new Set<string>();

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { bought?: string[]; equipped?: Partial<Equipped>; paidSets?: string[] };
      this.bought = new Set(s.bought ?? []);
      this.equipped = { ...this.equipped, ...s.equipped };
      this.paidSets = new Set(s.paidSets ?? []);
    } catch {
      // Corrupt value: keep defaults.
    }
  }

  save(): void {
    void storage.set(KEY, JSON.stringify({ bought: [...this.bought], equipped: this.equipped, paidSets: [...this.paidSets] }));
  }

  owns(item: LookItem, o: Owner): boolean {
    const u = item.unlock;
    if (this.bought.has(keyOf(item))) return true; // bought, or granted (older saves keep their mission unlocks)
    switch (u.by) {
      case 'free':
        return true;
      case 'premium':
        return o.premium;
      case 'credits':
      case 'cores':
      case 'vault':
      case 'reward':
        return this.bought.has(keyOf(item));
      case 'rank':
        return o.rank >= u.rank;
      case 'stars':
        return o.stars >= u.stars;
      case 'league':
        return o.league >= u.league;
      case 'achievement':
        return o.goal(u.id).done;
    }
  }

  buy(item: LookItem): void {
    this.give(keyOf(item));
  }

  /** Own a look by key ("slot:id"): a purchase or a reward. */
  give(key: string): void {
    this.bought.add(key);
    this.save();
  }

  has(key: string): boolean {
    return this.bought.has(key);
  }

  /** How many looks are owned. */
  count(o: Owner): number {
    return LOOKS.filter((l) => this.owns(l, o)).length;
  }

  /** Sets that are now complete and haven't paid their bonus yet; marks them paid. */
  completedSets(sets: readonly { id: string; items: string[] }[], o: Owner): string[] {
    const done: string[] = [];
    for (const s of sets) {
      if (this.paidSets.has(s.id)) continue;
      if (s.items.every((k) => { const it = byKey(k); return it !== undefined && this.owns(it, o); })) {
        this.paidSets.add(s.id);
        done.push(s.id);
      }
    }
    if (done.length > 0) this.save();
    return done;
  }

  /** Own every look, whatever unlocks it (maxing out, and the dev panel). */
  buyAll(): void {
    for (const l of LOOKS) this.bought.add(keyOf(l));
    this.save();
  }

  equip(slot: Slot, id: string): void {
    this.equipped[slot] = id;
    this.save();
  }
}
