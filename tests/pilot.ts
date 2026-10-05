import { Scene } from 'three';
import { CONFIG } from '../src/config';
import { lateralSpeedAt } from '../src/difficulty';
import { LivePalette } from '../src/palette';
import type { RouteTag } from '../src/pieces/format';
import { World } from '../src/world';

// The test pilot for hand-made pieces (tests/pieces*.test.ts).

/** Top speed: the hardest test of a piece. */
export const FAST = CONFIG.speed.max;

interface Hooked {
  row(d: number): void;
  lane: number;
  shipX: number;
  piece: { piece: { id: string; routes: { tag: RouteTag }[] } } | null;
  pieceStart: number;
  pieceEnd: number;
  routesNow: number[];
}

/**
 * Fly the ship section with `ids` queued (each in its next slot), following
 * route `tag` through every piece that has one (the main route otherwise), at
 * a fixed `speed`. Returns where it crashed, or null, and the pieces flown.
 */
export function fly(ids: string[], tag: RouteTag, speed: number, seed = 7): { crash: string | null; flown: string[] } {
  const world = new World(new Scene(), new LivePalette());
  world.devPieces = ids;
  const h = world as unknown as Hooked;
  const line: [number, number][] = [];
  const flown: string[] = [];
  const row = h.row.bind(world);
  h.row = (d: number) => {
    row(d);
    let x = h.lane;
    const p = h.piece;
    if (p && h.routesNow.length) {
      const k = p.piece.routes.findIndex((r) => r.tag === tag);
      if (k >= 0) x = h.routesNow[k];
      if (flown[flown.length - 1] !== p.piece.id) flown.push(p.piece.id);
    }
    line.push([d, x]);
    if (line.length > 800) line.shift();
  };
  // Level 8 of the loop (the ship), whatever the speed.
  const startScore = 7 * CONFIG.score.levelLength;
  world.reset(CONFIG.field.startClearance, true, startScore, seed);
  const at = (d: number): number => {
    let best = h.shipX;
    let gap = Infinity;
    for (const [rd, x] of line) {
      const g = Math.abs(rd - d);
      if (g < gap) {
        gap = g;
        best = x;
      }
    }
    return best;
  };
  const DT = 1 / 60;
  let eased = 0;
  const lateral = lateralSpeedAt(speed);
  const seconds = (ids.length * 260) / speed + 4; // long enough to get through them all
  for (let t = 0; t < seconds; t += DT) {
    const steer = Math.max(-1, Math.min(1, (at(world.distance + 3) - h.shipX) * 1.5));
    eased += (steer - eased) * (1 - Math.exp(-CONFIG.steering.response * DT));
    const prev = world.distance;
    world.advance(DT, speed, eased * lateral);
    if (world.overPit() || world.hitTest(prev)) {
      return { crash: `${world.overPit() ? 'fell' : 'hit something'} in ${h.piece?.piece.id ?? world.roomName}`, flown };
    }
  }
  return { crash: null, flown };
}
