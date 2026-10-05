import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { speedAt } from '../src/difficulty';
import { PIECES } from '../src/pieces';
import { check, parse } from '../src/pieces/format';
import { fly } from './pilot';

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

const SLOW = speedAt(6 * CONFIG.score.levelLength);
const FAST = CONFIG.speed.max;

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
