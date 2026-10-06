import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { CONFIG } from './config';
import { decalArt } from './decals';
import { emblem } from './leagues';
import { find, type Fin, type Marking, type ShipId, SLOT_NAMES, SLOTS, type Slot, type TrailId } from './looks';
import type { LivePalette } from './palette';
import { Player } from './player';
import { insignia } from './ranks';
import { Trail } from './trail';

// Pictures of other pilots' ships for the leaderboard: the game's own ship
// and engine flames, drawn from the looks a pilot has on (see set_ship on the
// server), in a small renderer of their own and kept as images.

/** A pilot's equipped looks, as the server keeps them; the rank and league are for the badge decals. */
export type ShipLook = Partial<Record<Slot, string>> & { rank?: number; league?: number; division?: number };

const W = 168;
const H = 100;
const KEEP = 200; // pictures kept before the oldest go

/** Looks that don't exist here (a newer version's, or nonsense) fall back to the slot's first. */
function look(ship: ShipLook, slot: Slot): string {
  return find(slot, ship[slot] ?? '').id;
}

/** "needle hull · scout paint · ...": what a pilot has on, leaving out what's plain. */
export function describeShip(ship: ShipLook): string {
  const out: string[] = [];
  for (const slot of SLOTS) {
    const id = look(ship, slot);
    if (slot !== 'hull' && (id === 'none' || id === 'standard')) continue;
    out.push(`${find(slot, id).name} ${SLOT_NAMES[slot]}`);
  }
  return out.join(' · ');
}

export class Portraits {
  private renderer: WebGLRenderer | null = null;
  private failed = false;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, W / H, 0.05, 20);
  private player: Player | null = null;
  private trail: Trail | null = null;
  private readonly cache = new Map<string, string>();

  constructor(private readonly palette: LivePalette) {}

  /** A picture of this ship (a data URL), or null where it can't be drawn. */
  get(ship: ShipLook): string | null {
    const key = JSON.stringify(ship);
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.ready()) return null;
    const url = this.draw(ship);
    if (this.cache.size >= KEEP) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, url);
    return url;
  }

  private ready(): boolean {
    if (this.renderer) return true;
    if (this.failed) return false;
    try {
      const canvas = document.createElement('canvas');
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(2);
      this.renderer.setSize(W, H, false);
      this.renderer.setClearColor(0x000000, 0);
      this.player = new Player(this.scene, this.palette);
      this.player.setVisible(true);
      this.trail = new Trail(this.player.engine, this.palette);
      this.trail.setVisible(true);
      // Three-quarters from the front, a little above: the hull, its markings and the flame all show.
      const S = CONFIG.ship;
      const a = 2.35;
      const d = 1.55;
      this.camera.position.set(Math.sin(a) * d, 0.75, Math.cos(a) * d);
      this.camera.lookAt(0, S.hoverY, 0.08);
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  private draw(ship: ShipLook): string {
    const p = this.player!;
    const t = this.trail!;
    p.setShape(look(ship, 'hull') as ShipId);
    p.setPaint(find('paint', look(ship, 'paint')).colors ?? null);
    const decalId = look(ship, 'decal');
    const decal = decalId === 'rank' ? insignia(ship.rank ?? 0) : decalId === 'league' ? emblem(ship.league ?? 0, ship.division ?? 0) : decalArt(decalId);
    p.setDressing(look(ship, 'markings') as Marking, look(ship, 'fins') as Fin, decal);
    const flame = find('engine', look(ship, 'engine')).colors;
    t.setTint(flame?.[0] ?? null, flame?.[1] ?? null);
    t.setStyle(look(ship, 'trail') as TrailId);
    t.update(0.05, 0.4, p.engineHalfSpan);
    this.renderer!.render(this.scene, this.camera);
    return this.renderer!.domElement.toDataURL('image/png');
  }
}
