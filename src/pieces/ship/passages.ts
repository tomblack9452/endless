import type { Piece } from '../format';
import { grid } from '../grid';

// passages pieces. Generated layouts, kept here as literal grids: edit freely.

/** Maintenance shaft: tight and low, pipes and red lights on the walls. */
export const shaft1: Piece = {
  id: 'shaft-1',
  family: 'shaft',
  tiers: [1, 2],
  weight: 2,
  height: 2.6,
  grid: grid(
    [24, '#.....#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [23, 0]] },
  ],
};

/** Junction: two branches round a divider; the left one has crates and pickups. */
export const junction1: Piece = {
  id: 'junction-1',
  family: 'junction',
  tiers: [0, 2],
  weight: 2,
  height: 3.8,
  grid: grid(
    [12, '#...............#'],
    [10, '#.......|.......#'],
    [2, '#cc.....|.......#'],
    [15, '#.......|.......#'],
    [12, '#...............#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [14, 3.5], [36, 3.5], [50, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [14, -3.5], [36, -3.5], [50, 0]] },
  ],
};

/** Three-way fork: any branch will do; the outer ones have pickups. */
export const fork1: Piece = {
  id: 'fork-1',
  family: 'fork',
  tiers: [1, 2],
  weight: 2,
  height: 4.2,
  grid: grid(
    [24, '#...................#'],
    [5, '#......|.....|......#'],
    [2, '#......|.....|....cc#'],
    [6, '#......|.....|......#'],
    [24, '#...................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [60, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [22, -5.5], [38, -5.5], [60, 0]] },
    { tag: 'risky', reward: 'pickups', points: [[0, 0], [22, 5.5], [38, 5.5], [60, 0]] },
  ],
};

/** Uneven split: a tight clean branch beside a wide one full of crates. */
export const uneven1: Piece = {
  id: 'uneven-1',
  family: 'uneven',
  tiers: [1, 2],
  weight: 2,
  height: 4,
  grid: grid(
    [15, '#.................#'],
    [5, '#.........|.......#'],
    [2, '#cc.......|.......#'],
    [6, '#.........|.......#'],
    [2, '#......cc.|.......#'],
    [3, '#.........|.......#'],
    [2, '#cc.......|.......#'],
    [3, '#.........|.......#'],
    [15, '#.................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [12, 3], [40, 3], [52, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [16, -4], [36, -4], [52, 0]] },
  ],
};

/** Bulkhead maze: wall islands across a wide hall; the way winds between them. */
export const islands1: Piece = {
  id: 'islands-1',
  family: 'islands',
  tiers: [1, 2],
  weight: 2,
  height: 4.6,
  grid: grid(
    [10, '#.....................#'],
    [2, '#...||................#'],
    [1, '#...||...........||...#'],
    [3, '#................||...#'],
    [2, '#........||...........#'],
    [6, '#.....................#'],
    [2, '#..||.................#'],
    [2, '#..||..............||.#'],
    [1, '#..................||.#'],
    [9, '#.....................#'],
    [4, '#................||...#'],
    [3, '#...||................#'],
    [1, '#.....................#'],
    [2, '#............||.......#'],
    [4, '#.....................#'],
    [3, '#.....||..........||..#'],
    [1, '#.....||..............#'],
    [6, '#.....................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, 3], [44, -3], [56, 0], [61, 0]] },
  ],
};

/** Chicane: baffle walls from alternating sides; the line swings round them. */
export const chicane1: Piece = {
  id: 'chicane-1',
  family: 'chicane',
  tiers: [2, 2],
  weight: 2,
  height: 3.6,
  grid: grid(
    [18, '#.............#'],
    [2, '#|||||||......#'],
    [10, '#.............#'],
    [2, '#.........||||#'],
    [10, '#.............#'],
    [2, '#......|||||||#'],
    [10, '#.............#'],
    [2, '#.........||||#'],
    [10, '#.............#'],
    [2, '#|||||||......#'],
    [15, '#.............#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [6, 0], [18, 3], [42, -3], [66, 3], [78, 0], [82, 0]] },
  ],
};
