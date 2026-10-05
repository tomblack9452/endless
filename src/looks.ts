import type { ShipId } from './cosmetics';
import { LEAGUES } from './leagues';
import { rankName } from './ranks';
import { storage } from './storage';

// Ship looks: what the ship wears. Purely cosmetic (every hull shares one
// hitbox), so they're allowed in ranked too. Items unlock by being free,
// credits, cores, a rank, a league, a total of stars, or as a reward (the
// login calendar and the season pass). Hull shapes beyond the starter also come
// from missions (see cosmetics.ts).

export type Slot = 'hull' | 'paint' | 'markings' | 'fins' | 'engine' | 'decal';
export type Marking = 'none' | 'stripe' | 'twin' | 'chevron' | 'twotone' | 'split';
export type Fin = 'none' | 'tail' | 'twin' | 'winglets';

export type Unlock =
  | { by: 'free' }
  | { by: 'mission' } // hull shapes unlocked by missions
  | { by: 'credits'; cost: number }
  | { by: 'cores'; cost: number } // the premium currency (the shop sells these too)
  | { by: 'reward'; from: 'login' | 'pass' }
  | { by: 'rank'; rank: number }
  | { by: 'stars'; stars: number }
  | { by: 'league'; league: number };

export interface LookItem {
  slot: Slot;
  id: string;
  name: string;
  unlock: Unlock;
  colors?: [string, string]; // paint: top and shade; engine: [colour, colour]
}

const free: Unlock = { by: 'free' };
const credits = (cost: number): Unlock => ({ by: 'credits', cost });
const rank = (r: number): Unlock => ({ by: 'rank', rank: r });
const stars = (n: number): Unlock => ({ by: 'stars', stars: n });
const league = (l: number): Unlock => ({ by: 'league', league: l });
const cores = (cost: number): Unlock => ({ by: 'cores', cost });
const pass: Unlock = { by: 'reward', from: 'pass' };

export const LOOKS: readonly LookItem[] = [
  { slot: 'hull', id: 'dart', name: 'dart', unlock: free },
  { slot: 'hull', id: 'wing', name: 'wing', unlock: { by: 'mission' } },
  { slot: 'hull', id: 'needle', name: 'needle', unlock: { by: 'mission' } },
  { slot: 'hull', id: 'manta', name: 'manta', unlock: { by: 'mission' } },
  { slot: 'hull', id: 'arrow', name: 'arrow', unlock: credits(1500) },
  { slot: 'hull', id: 'talon', name: 'talon', unlock: credits(4000) },
  { slot: 'hull', id: 'nova', name: 'nova', unlock: cores(400) },
  { slot: 'hull', id: 'raptor', name: 'raptor', unlock: { by: 'reward', from: 'pass' } },

  { slot: 'paint', id: 'standard', name: 'standard', unlock: free },
  { slot: 'paint', id: 'slate', name: 'slate', unlock: credits(200), colors: ['#66707a', '#454c54'] },
  { slot: 'paint', id: 'crimson', name: 'crimson', unlock: credits(300), colors: ['#b8403c', '#812a28'] },
  { slot: 'paint', id: 'cobalt', name: 'cobalt', unlock: credits(300), colors: ['#3f63b8', '#2a4482'] },
  { slot: 'paint', id: 'olive', name: 'olive', unlock: credits(300), colors: ['#717f3e', '#4e582a'] },
  { slot: 'paint', id: 'sand', name: 'sand', unlock: credits(400), colors: ['#cdb68d', '#9d8a64'] },
  { slot: 'paint', id: 'white', name: 'white', unlock: credits(500), colors: ['#efefeb', '#bfc0bb'] },
  { slot: 'paint', id: 'carbon', name: 'carbon', unlock: credits(800), colors: ['#2e2e31', '#1a1a1c'] },
  { slot: 'paint', id: 'gunmetal', name: 'gunmetal', unlock: rank(25), colors: ['#4c525b', '#30343a'] },
  { slot: 'paint', id: 'chrome', name: 'chrome', unlock: rank(31), colors: ['#dde1e6', '#9ba3ac'] },
  // One paint for reaching each league above bronze.
  { slot: 'paint', id: 'silver', name: 'silver', unlock: league(1), colors: ['#c5cad0', '#8f959d'] },
  { slot: 'paint', id: 'gold', name: 'gold', unlock: league(2), colors: ['#d9ab3d', '#a17b24'] },
  { slot: 'paint', id: 'platinum', name: 'platinum', unlock: league(3), colors: ['#cfe4e5', '#90b2b5'] },
  { slot: 'paint', id: 'diamond', name: 'diamond', unlock: league(4), colors: ['#aac8f1', '#6e92c5'] },
  { slot: 'paint', id: 'champion', name: 'champion', unlock: league(5), colors: ['#ab8ce2', '#7458ac'] },
  { slot: 'paint', id: 'supernova', name: 'supernova', unlock: league(6), colors: ['#e8684f', '#a83f30'] },
  // Premium paints: cores, the login calendar and the season pass.
  { slot: 'paint', id: 'nebula', name: 'nebula', unlock: cores(120), colors: ['#7a4fb8', '#3d2a6e'] },
  { slot: 'paint', id: 'solar', name: 'solar', unlock: cores(150), colors: ['#f0b23a', '#c2541e'] },
  { slot: 'paint', id: 'void', name: 'void', unlock: cores(200), colors: ['#1c1d2b', '#0b0b12'] },
  { slot: 'paint', id: 'aurora', name: 'aurora', unlock: { by: 'reward', from: 'login' }, colors: ['#5fd6a8', '#3a6fb0'] },
  { slot: 'paint', id: 'frost', name: 'frost', unlock: pass, colors: ['#d8eef6', '#8fbcd4'] },
  { slot: 'paint', id: 'ember', name: 'ember', unlock: pass, colors: ['#d4522f', '#5a1c14'] },
  { slot: 'paint', id: 'mint', name: 'mint', unlock: credits(600), colors: ['#8fd3b6', '#5b9c82'] },
  { slot: 'paint', id: 'rose', name: 'rose gold', unlock: credits(900), colors: ['#e2a99a', '#a8706a'] },
  { slot: 'paint', id: 'midnight', name: 'midnight', unlock: cores(100), colors: ['#253a6e', '#121c38'] },
  { slot: 'paint', id: 'glacier', name: 'glacier', unlock: cores(140), colors: ['#a6dcef', '#4f8fb3'] },

  { slot: 'markings', id: 'none', name: 'none', unlock: free },
  { slot: 'markings', id: 'stripe', name: 'stripe', unlock: credits(250) },
  { slot: 'markings', id: 'twin', name: 'twin stripes', unlock: credits(400) },
  { slot: 'markings', id: 'split', name: 'split', unlock: credits(600) },
  { slot: 'markings', id: 'chevron', name: 'chevron', unlock: stars(10) },
  { slot: 'markings', id: 'twotone', name: 'two-tone', unlock: stars(25) },

  { slot: 'fins', id: 'none', name: 'none', unlock: free },
  { slot: 'fins', id: 'tail', name: 'tail fin', unlock: credits(300) },
  { slot: 'fins', id: 'twin', name: 'twin fins', unlock: stars(15) },
  { slot: 'fins', id: 'winglets', name: 'winglets', unlock: credits(800) },

  { slot: 'engine', id: 'standard', name: 'standard', unlock: free },
  { slot: 'engine', id: 'amber', name: 'amber', unlock: credits(150), colors: ['#e2a64e', '#e2a64e'] },
  { slot: 'engine', id: 'cyan', name: 'cyan', unlock: credits(150), colors: ['#4fc3d9', '#4fc3d9'] },
  { slot: 'engine', id: 'violet', name: 'violet', unlock: credits(250), colors: ['#a07ae0', '#a07ae0'] },
  { slot: 'engine', id: 'green', name: 'green', unlock: credits(250), colors: ['#6ccf7c', '#6ccf7c'] },
  { slot: 'engine', id: 'white', name: 'white', unlock: credits(400), colors: ['#f4f4f0', '#f4f4f0'] },
  { slot: 'engine', id: 'red', name: 'red', unlock: rank(7), colors: ['#e0503f', '#e0503f'] },
  { slot: 'engine', id: 'plasma', name: 'plasma', unlock: cores(60), colors: ['#ff5fd2', '#7a6bff'] },
  { slot: 'engine', id: 'solar', name: 'solar', unlock: pass, colors: ['#ffd25a', '#ff7a2e'] },
  { slot: 'engine', id: 'ice', name: 'ice', unlock: credits(350), colors: ['#bfeaff', '#bfeaff'] },
  { slot: 'engine', id: 'gold', name: 'gold', unlock: cores(80), colors: ['#ffcf4a', '#ffcf4a'] },

  { slot: 'decal', id: 'none', name: 'none', unlock: free },
  { slot: 'decal', id: 'rank', name: 'rank insignia', unlock: free },
  { slot: 'decal', id: 'league', name: 'league emblem', unlock: free },
];

export const SLOTS: Slot[] = ['hull', 'paint', 'markings', 'fins', 'engine', 'decal'];
export const SLOT_NAMES: Record<Slot, string> = {
  hull: 'hull',
  paint: 'paint',
  markings: 'markings',
  fins: 'fins',
  engine: 'engine colour',
  decal: 'wing decal',
};

export function itemsIn(slot: Slot): LookItem[] {
  return LOOKS.filter((l) => l.slot === slot);
}

export function find(slot: Slot, id: string): LookItem {
  return LOOKS.find((l) => l.slot === slot && l.id === id) ?? itemsIn(slot)[0];
}

/** What the player has to unlock an item, for checking it. */
export interface Owner {
  rank: number;
  stars: number;
  league: number;
  missionHulls: ShipId[];
}

/** How an item unlocks, in words (for the hangar). */
export function unlockText(u: Unlock): string {
  switch (u.by) {
    case 'free':
      return '';
    case 'mission':
      return 'from missions';
    case 'credits':
      return `${u.cost.toLocaleString('en-US')} credits`;
    case 'cores':
      return `${u.cost.toLocaleString('en-US')} cores`;
    case 'reward':
      return u.from === 'login' ? 'daily login reward' : 'season pass';
    case 'rank':
      return `rank ${rankName(u.rank)}`;
    case 'stars':
      return `${u.stars} stars`;
    case 'league':
      return `${LEAGUES[u.league].name} league`;
  }
}

const KEY = 'endless.looks';

type Equipped = Record<Slot, string>;

export class Looks {
  /** Bought (credits or cores) or given as a reward; rank, star, mission and free items are owned when earned. */
  private bought = new Set<string>();
  equipped: Equipped = { hull: 'dart', paint: 'standard', markings: 'none', fins: 'none', engine: 'standard', decal: 'none' };

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as { bought?: string[]; equipped?: Partial<Equipped> };
      this.bought = new Set(s.bought ?? []);
      this.equipped = { ...this.equipped, ...s.equipped };
    } catch {
      // Corrupt value: keep defaults.
    }
  }

  save(): void {
    void storage.set(KEY, JSON.stringify({ bought: [...this.bought], equipped: this.equipped }));
  }

  owns(item: LookItem, o: Owner): boolean {
    const u = item.unlock;
    switch (u.by) {
      case 'free':
        return true;
      case 'mission':
        return o.missionHulls.includes(item.id as ShipId);
      case 'credits':
      case 'cores':
      case 'reward':
        return this.bought.has(`${item.slot}:${item.id}`);
      case 'rank':
        return o.rank >= u.rank;
      case 'stars':
        return o.stars >= u.stars;
      case 'league':
        return o.league >= u.league;
    }
  }

  buy(item: LookItem): void {
    this.give(`${item.slot}:${item.id}`);
  }

  /** Own a look by key ("slot:id"): a purchase or a reward. */
  give(key: string): void {
    this.bought.add(key);
    this.save();
  }

  has(key: string): boolean {
    return this.bought.has(key);
  }

  /** Mark everything bought (dev). */
  buyAll(): void {
    for (const l of LOOKS) if (l.unlock.by === 'credits' || l.unlock.by === 'cores' || l.unlock.by === 'reward') this.bought.add(`${l.slot}:${l.id}`);
    this.save();
  }

  equip(slot: Slot, id: string): void {
    this.equipped[slot] = id;
    this.save();
  }

  /** Put anything no longer owned back to the slot's default. */
  validate(o: Owner): void {
    for (const slot of SLOTS) if (!this.owns(find(slot, this.equipped[slot]), o)) this.equipped[slot] = itemsIn(slot)[0].id;
  }
}
