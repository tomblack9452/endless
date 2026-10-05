import type { RoomId } from '../interior';
import { rand } from '../rng';
import type { Piece } from './format';
import * as cargo from './ship/cargo';
import * as cargoLift from './ship/cargolift';
import * as command from './ship/command';
import * as corridors from './ship/corridors';
import * as deck from './ship/deck';
import * as dropShaft from './ship/dropshaft';
import * as engine from './ship/engine';
import * as flooded from './ship/flooded';
import * as hangar from './ship/hangar';
import * as hydroponics from './ship/hydroponics';
import * as lab from './ship/lab';
import * as maintenance from './ship/maintenance';
import * as passages from './ship/passages';
import * as plant from './ship/plant';
import * as reactor from './ship/reactor';
import * as security from './ship/security';
import * as servers from './ship/servers';
import * as ventilation from './ship/vents-fan';

// The pack: every hand-made piece, by id. Every room family is built from
// pieces; a family's room template in interior.ts now only gives its name,
// lighting, look and wall dressing.

const FILES = [servers, cargo, cargoLift, deck, reactor, engine, hangar, lab, flooded, dropShaft, command, ventilation, hydroponics, security, maintenance, plant, passages, corridors];

export const PIECES: readonly Piece[] = FILES.flatMap((f) => Object.values(f) as Piece[]);

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
  let options = PIECES.filter((p) => p.family === family && t >= p.tiers[0] && t <= p.tiers[1]);
  // A family whose pieces all start later still appears, with its easiest piece.
  if (!options.length) options = PIECES.filter((p) => p.family === family).sort((a, b) => a.tiers[0] - b.tiers[0]).slice(0, 1);
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
