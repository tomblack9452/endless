import type { Piece } from '../format';
import { grid } from '../grid';

// Cargo bays. Crates are c (waist high) and C (stacked high), usually 2 wide.

/**
 * Crate grid: two blocks of stacks with a loading floor between. The way
 * through crosses the floor to the wide gap on the right; the narrow gap on
 * the left has pickups.
 */
export const cargo1: Piece = {
  id: 'cargo-1',
  family: 'cargo',
  tiers: [0, 2],
  weight: 3,
  height: 4.4,
  grid: grid(
    [8, '#.......................#'],
    [3, '#.CC...CC.......CC...CC.#'],
    [2, '#.......................#'],
    [3, '#.CC...cc.......CC...CC.#'],
    [24, '#.......................#'],
    [3, '#.CC...CC...CC.......CC.#'],
    [2, '#.......................#'],
    [3, '#.cc...CC...CC.......cc.#'],
    [22, '#.......................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [16, 0], [37, 5], [48, 5], [69, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [16, 0], [24, -2], [48, -2], [69, 0]] },
  ],
};

/** Crane bay: stacks along the walls, hooks on chains swinging across the middle. */
export const cargo2: Piece = {
  id: 'cargo-2',
  family: 'cargo',
  tiers: [0, 2],
  weight: 2,
  height: 6.5,
  grid: grid(
    [6, '#.....................#'],
    [10, '#.CC...............CC.#'],
    [4, '#.....................#'],
    [10, '#.cc...............CC.#'],
    [4, '#.....................#'],
    [10, '#.CC...............cc.#'],
    [6, '#.....................#'],
  ),
  overlays: [
    { at: 8, kind: 'hook', x: [-4, 4], arrive: -3.6 },
    { at: 16, kind: 'hook', x: [-4, 4], arrive: 3.6 },
    { at: 24, kind: 'hook', x: [-4, 4], arrive: -3.4 },
    { at: 32, kind: 'hook', x: [-4, 4], arrive: 3.5 },
    { at: 40, kind: 'hook', x: [-4, 4], arrive: -3.6 },
  ],
  routes: [{ tag: 'main', points: [[0, 0], [49, 0]] }],
};
