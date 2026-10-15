import type { Piece } from '../format';
import { grid } from '../grid';

// Server halls. Racks are 1 unit wide (S). The lane keeps 1.3 clear either
// side, and sideways moves are slow (about a unit every 4 rows at most), so
// routes change aisle across open floor or drift along a slanting aisle.

/** Rack aisles: the main aisle down the middle; a side aisle (with pickups) to the left. */
export const servers1: Piece = {
  id: 'servers-1',
  family: 'servers',
  tiers: [0, 2],
  weight: 3,
  height: 3.8,
  grid: grid(
    [4, '#.K.................K.#'],
    [12, '#.....................#'],
    [5, '#....S...S...S...S....#'],
    [2, '#.....................#'],
    [7, '#....S...S...S...S....#'],
    [2, '#.....................#'],
    [7, '#....S...S...S...S....#'],
    [13, '#.....................#'],
    [3, '#.K.................K.#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [54, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [15, -4], [39, -4], [54, 0]] },
  ],
};

/** A slanting aisle: rack rows step across the hall, and the way through drifts right, then left, then back. */
export const servers2: Piece = {
  id: 'servers-2',
  family: 'servers',
  tiers: [1, 2],
  weight: 2,
  height: 3.8,
  grid: grid(
    [8, '#.....................#'],
    [4, '#....S...S.....S...S..#'],
    [1, '#.....................#'],
    [3, '#.....S...S.....S...S.#'],
    [2, '#......S...S.....S....#'],
    [1, '#.....................#'],
    [2, '#......S...S.....S....#'],
    [3, '#.....S...S.....S...S.#'],
    [1, '#.....................#'],
    [4, '#....S...S.....S...S..#'],
    [1, '#...S...S.....S...S...#'],
    [1, '#.....................#'],
    [2, '#...S...S.....S...S...#'],
    [3, '#..S...S.....S...S....#'],
    [1, '#.....................#'],
    [4, '#.S...S.....S...S.....#'],
    [1, '#....S.....S...S......#'],
    [1, '#.....................#'],
    [1, '#....S.....S...S......#'],
    [4, '#.S...S.....S...S.....#'],
    [1, '#.....................#'],
    [3, '#..S...S.....S...S....#'],
    [1, '#...S...S.....S...S...#'],
    [8, '#.....................#'],
  ),
  routes: [{ tag: 'main', points: [[0, 0], [6, 0], [18, 3], [42, -3], [54, 0], [60, 0]] }],
};
