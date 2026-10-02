import { PALETTES } from './config';
import { storage } from './storage';

// Cosmetic unlocks: ship shapes, trails and world palettes. Missions unlock
// them one at a time in UNLOCK_ORDER; the hangar screen picks among unlocked.

export type ShipId = 'dart' | 'wing' | 'needle' | 'manta';
export type TrailId = 'none' | 'line' | 'dashes' | 'ion';

export const SHIPS: ShipId[] = ['dart', 'wing', 'needle', 'manta'];
export const TRAILS: TrailId[] = ['none', 'line', 'dashes', 'ion'];
export const PALETTE_NAMES = PALETTES.map((p) => p.name);

export type Unlock = { kind: 'ship'; id: ShipId } | { kind: 'trail'; id: TrailId } | { kind: 'palette'; id: string };

/** What each completed mission unlocks, in order. */
export const UNLOCK_ORDER: Unlock[] = [
  { kind: 'trail', id: 'line' },
  { kind: 'ship', id: 'wing' },
  { kind: 'palette', id: 'tidewater' },
  { kind: 'trail', id: 'dashes' },
  { kind: 'ship', id: 'needle' },
  { kind: 'palette', id: 'clay' },
  { kind: 'trail', id: 'ion' },
  { kind: 'ship', id: 'manta' },
  { kind: 'palette', id: 'lichen' },
  { kind: 'palette', id: 'ink' },
  { kind: 'palette', id: 'ember' },
];

export function describe(u: Unlock): string {
  return u.kind === 'palette' ? `${u.id} palette` : `${u.id} ${u.kind}`;
}

interface Saved {
  unlocked: number; // how many of UNLOCK_ORDER are unlocked
  ship: ShipId;
  trail: TrailId;
  palette: string;
}

const KEY = 'endless.cosmetics';

export class Cosmetics {
  unlocked = 0;
  ship: ShipId = 'dart';
  trail: TrailId = 'none';
  palette = PALETTE_NAMES[0];

  async load(): Promise<void> {
    const raw = await storage.get(KEY);
    if (!raw) return;
    try {
      const s = JSON.parse(raw) as Partial<Saved>;
      this.unlocked = s.unlocked ?? 0;
      if (s.ship && this.ships().includes(s.ship)) this.ship = s.ship;
      if (s.trail && this.trails().includes(s.trail)) this.trail = s.trail;
      if (s.palette && this.palettes().includes(s.palette)) this.palette = s.palette;
    } catch {
      // Corrupt value: keep defaults.
    }
  }

  save(): void {
    void storage.set(KEY, JSON.stringify({ unlocked: this.unlocked, ship: this.ship, trail: this.trail, palette: this.palette }));
  }

  private owned(kind: Unlock['kind']): string[] {
    return UNLOCK_ORDER.slice(0, this.unlocked)
      .filter((u) => u.kind === kind)
      .map((u) => u.id);
  }

  ships(): ShipId[] {
    return ['dart', ...(this.owned('ship') as ShipId[])];
  }

  trails(): TrailId[] {
    return ['none', ...(this.owned('trail') as TrailId[])];
  }

  /** Unlocked palettes in the order they appear in the config. */
  palettes(): string[] {
    const owned = new Set([PALETTE_NAMES[0], ...this.owned('palette')]);
    return PALETTE_NAMES.filter((n) => owned.has(n));
  }

  /** Unlock the next item; returns it, or null when everything is unlocked. */
  unlockNext(): Unlock | null {
    if (this.unlocked >= UNLOCK_ORDER.length) return null;
    const u = UNLOCK_ORDER[this.unlocked++];
    this.save();
    return u;
  }

  next(): Unlock | null {
    return UNLOCK_ORDER[this.unlocked] ?? null;
  }

  /** Step a hangar choice to the next unlocked option. */
  cycle(kind: 'ship' | 'trail' | 'palette'): void {
    if (kind === 'ship') {
      const list = this.ships();
      this.ship = list[(list.indexOf(this.ship) + 1) % list.length];
    } else if (kind === 'trail') {
      const list = this.trails();
      this.trail = list[(list.indexOf(this.trail) + 1) % list.length];
    } else {
      const list = this.palettes();
      this.palette = list[(list.indexOf(this.palette) + 1) % list.length];
    }
    this.save();
  }
}
