import type { RoomId } from '../interior';
import { rand } from '../rng';
import type { Piece } from './format';
import { cargo1, cargo2 } from './ship/cargo';
import { corridorFork1, corridorPillars1, corridorRampDown1, corridorRampUp1 } from './ship/corridors';
import { servers1, servers2 } from './ship/servers';

// The pack: every hand-made piece, by id. Families listed in FAMILIES are
// built from pieces; the rest still use the room templates in interior.ts
// until they're moved over.

export const PIECES: readonly Piece[] = [servers1, servers2, cargo1, cargo2, corridorPillars1, corridorFork1, corridorRampUp1, corridorRampDown1];

export const PIECE_IDS = PIECES.map((p) => p.id);

const BY_ID = new Map(PIECES.map((p) => [p.id, p]));

export function pieceById(id: string): Piece | undefined {
  return BY_ID.get(id);
}

/** Room families built from pieces (the room templates aren't used for these). */
export const FAMILIES = new Set<RoomId>(PIECES.filter((p) => p.family !== 'corridor').map((p) => p.family));

/** A piece of `family` for ship level `tier` (0-2), by weight, or null if there isn't one. */
export function pickPiece(family: RoomId, tier: number): Piece | null {
  const t = Math.min(2, tier);
  const options = PIECES.filter((p) => p.family === family && t >= p.tiers[0] && t <= p.tiers[1]);
  if (!options.length) return null;
  let total = 0;
  for (const p of options) total += p.weight;
  let r = rand() * total;
  for (const p of options) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return options[options.length - 1];
}
