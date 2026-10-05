import { describe, expect, it } from 'vitest';
import { PIECES } from '../src/pieces';
import { FAST, fly } from './pilot';

// Every join between pieces, flown at top speed. Every route shares its
// piece's way in and way out, so one route through each pair proves the join;
// tests/pieces.test.ts flies every route inside each piece.

const ROOM_PIECES = PIECES.filter((p) => p.family !== 'corridor');
const CORRIDOR_PIECES = PIECES.filter((p) => p.family === 'corridor');

describe('pieces: every pair, joined', () => {
  for (const a of ROOM_PIECES) {
    it(`${a.id} into every room piece`, () => {
      const problems: string[] = [];
      for (const b of ROOM_PIECES) {
        const r = fly([a.id, b.id], 'main', FAST);
        if (r.crash) problems.push(`${a.id} -> ${b.id}: ${r.crash}`);
        if (!r.flown.includes(a.id) || !r.flown.includes(b.id)) problems.push(`${a.id} -> ${b.id}: flew only ${r.flown.join(', ')}`);
      }
      expect(problems.join(' | ')).toBe('');
    });
  }

  for (const c of CORRIDOR_PIECES) {
    it(`${c.id} between every room piece`, () => {
      const problems: string[] = [];
      for (const a of ROOM_PIECES) {
        const r = fly([a.id, c.id, a.id], 'main', FAST);
        if (r.crash) problems.push(`${a.id} -> ${c.id}: ${r.crash}`);
        if (!r.flown.includes(c.id)) problems.push(`${a.id} -> ${c.id}: never reached ${c.id}`);
      }
      expect(problems.join(' | ')).toBe('');
    });
  }
});
