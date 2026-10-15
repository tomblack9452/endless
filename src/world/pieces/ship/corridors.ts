import type { Piece } from '../format';
import { grid } from '../grid';

// Designed corridors: used between rooms in place of a plain corridor now and then.

/** Pillars standing off both walls, staggered. */
export const corridorPillars1: Piece = {
  id: 'corridor-pillars-1',
  family: 'corridor',
  name: '',
  tiers: [0, 2],
  weight: 2,
  height: 3.4,
  grid: grid(
    [2, '#.........#'],
    [1, '#.P.....P.#'],
    [3, '#.........#'],
    [1, '#..P...P..#'],
    [3, '#.........#'],
    [1, '#.P.....P.#'],
    [3, '#.........#'],
    [1, '#..P...P..#'],
    [2, '#.........#'],
  ),
  routes: [{ tag: 'main', points: [[0, 0], [16, 0]] }],
};

/** One corridor parts round a bulkhead and joins up again. */
export const corridorFork1: Piece = {
  id: 'corridor-fork-1',
  family: 'corridor',
  name: '',
  tiers: [0, 2],
  weight: 2,
  height: 3.6,
  grid: grid(
    [12, '#.............#'],
    [20, '#......|......#'],
    [14, '#.............#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [14, 3.5], [32, 3.5], [45, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [14, -3.5], [32, -3.5], [45, 0]] },
  ],
};

/** A ramp up to the next deck. */
export const corridorRampUp1: Piece = {
  id: 'corridor-ramp-up-1',
  family: 'corridor',
  name: '',
  tiers: [0, 2],
  weight: 1,
  height: 3.4,
  grid: grid([14, '#.......#']),
  overlays: [{ at: 3, kind: 'step', rise: 1.8, rows: 8 }],
  routes: [{ tag: 'main', points: [[0, 0], [13, 0]] }],
};

/** A ramp down to the deck below. */
export const corridorRampDown1: Piece = {
  id: 'corridor-ramp-down-1',
  family: 'corridor',
  name: '',
  tiers: [0, 2],
  weight: 1,
  height: 3.4,
  grid: grid([14, '#.......#']),
  overlays: [{ at: 3, kind: 'step', rise: -1.8, rows: 8 }],
  routes: [{ tag: 'main', points: [[0, 0], [13, 0]] }],
};
