import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { lateralSpeedAt, speedAt } from '../src/difficulty';
import { LivePalette } from '../src/palette';
import { PIECES } from '../src/pieces';
import { check, parse, type RouteTag } from '../src/pieces/format';
import { World } from '../src/world';

// Hand-made pieces. First on paper: every grid parses and every route stays
// on floor, clear of solids, within the steering limit, end to end. Then in
// flight: a pilot (steering through the ship's own easing, as the real ship
// does) flies every route of every piece at the slowest and fastest speeds,
// and every ordered pair of pieces joined by a corridor.

describe('pieces: on paper', () => {
  for (const piece of PIECES) {
    it(`${piece.id} is well formed and its routes are clear`, () => {
      expect(() => parse(piece)).not.toThrow();
      expect(check(piece).join(' | ')).toBe('');
    });
  }
});

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
function fly(ids: string[], tag: RouteTag, speed: number, seed = 7): { crash: string | null; flown: string[] } {
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

const SLOW = speedAt(6 * CONFIG.score.levelLength);
const FAST = CONFIG.speed.max;
const ROOM_PIECES = PIECES.filter((p) => p.family !== 'corridor');
const CORRIDOR_PIECES = PIECES.filter((p) => p.family === 'corridor');

describe('pieces: every route, flown', () => {
  for (const piece of PIECES) {
    for (const tag of new Set(piece.routes.map((r) => r.tag))) {
      it(`${piece.id}, ${tag} route, slow and fast`, () => {
        // A room piece needs a room slot; a corridor piece a corridor slot.
        const ids = piece.family === 'corridor' ? [piece.id, piece.id] : [piece.id, piece.id];
        for (const speed of [SLOW, FAST]) {
          const r = fly(ids, tag, speed);
          expect(r.flown, `never reached ${piece.id}`).toContain(piece.id);
          expect(r.crash, `${speed.toFixed(0)} units/s`).toBeNull();
        }
      });
    }
  }
});

describe('pieces: every pair, joined', () => {
  it('every room piece into every room piece, main and alt routes', () => {
    const problems: string[] = [];
    for (const a of ROOM_PIECES) {
      for (const b of ROOM_PIECES) {
        for (const tag of ['main', 'alt'] as const) {
          const r = fly([a.id, b.id], tag, FAST);
          if (r.crash) problems.push(`${a.id} -> ${b.id} (${tag}): ${r.crash}`);
          if (!r.flown.includes(a.id) || !r.flown.includes(b.id)) problems.push(`${a.id} -> ${b.id}: flew only ${r.flown.join(", ")}`);
        }
      }
    }
    expect(problems.join(' | ')).toBe('');
  });

  it('every corridor piece between room pieces', () => {
    const problems: string[] = [];
    for (const c of CORRIDOR_PIECES) {
      for (const a of ROOM_PIECES) {
        for (const tag of ['main', 'alt'] as const) {
          const r = fly([a.id, c.id, a.id], tag, FAST);
          if (r.crash) problems.push(`${a.id} -> ${c.id} (${tag}): ${r.crash}`);
          if (!r.flown.includes(c.id)) problems.push(`${a.id} -> ${c.id}: never reached ${c.id}`);
        }
      }
    }
    expect(problems.join(' | ')).toBe('');
  });
});
