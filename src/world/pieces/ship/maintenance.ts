import type { Piece } from '../format';
import { grid } from '../grid';

// maintenance pieces. Generated layouts, kept here as literal grids: edit freely.

/** Maintenance gantry: railed catwalks over the drop, joined by cross-walks. */
export const gantry1: Piece = {
  id: 'gantry-1',
  family: 'gantry',
  tiers: [1, 2],
  weight: 2,
  height: 6,
  grid: grid(
    [20, '#...................#'],
    [6, '#   ===  ===        #'],
    [3, '#   ========        #'],
    [9, '#   ===  ===        #'],
    [3, '#   ========        #'],
    [5, '#   ===  ===        #'],
    [20, '#...................#'],
  ),
  overlays: [
    {at: 30, kind: 'sparks', x: 8.5, y: 1.5},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [65, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [19, -5], [46, -5], [65, 0]] },
  ],
};

/** Hull breach: holes torn in the deck against the walls, wreckage, sparks. */
export const breach1: Piece = {
  id: 'breach-1',
  family: 'breach',
  tiers: [0, 2],
  weight: 2,
  height: 4,
  grid: grid(
    [4, '#.................#'],
    [2, '#xx...............#'],
    [2, '#.................#'],
    [4, '#       ..........#'],
    [4, '#        .........#'],
    [1, '#.............    #'],
    [3, '#..............   #'],
    [4, '#.............    #'],
    [1, '#        .........#'],
    [4, '#       ..........#'],
    [3, '#      ...........#'],
    [4, '#..........       #'],
    [4, '#.........        #'],
    [1, '#    .............#'],
    [3, '#   ..............#'],
    [4, '#    .............#'],
    [1, '#.........        #'],
    [4, '#..........       #'],
    [3, '#.................#'],
    [2, '#...............xx#'],
    [3, '#.................#'],
  ),
  overlays: [
    {at: 14, kind: 'sparks', x: 7.6, y: 1},
    {at: 30, kind: 'sparks', x: -7.6, y: 1.4},
    {at: 46, kind: 'steam', x: 7.6, y: 0, h: 2.4},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [6, 0], [18, 3], [42, -3], [54, 0], [60, 0]] },
  ],
};
