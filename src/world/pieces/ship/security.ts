import type { Piece } from '../format';
import { grid } from '../grid';

// security pieces. Generated layouts, kept here as literal grids: edit freely.

/** Laser gates: beams across the corridor, the gap moving from gate to gate. */
export const lasers1: Piece = {
  id: 'lasers-1',
  family: 'lasers',
  tiers: [1, 2],
  weight: 2,
  height: 3.4,
  grid: grid(
    [12, '#...............#'],
    [1, '#LLLLLL.....LLLL#'],
    [7, '#...............#'],
    [1, '#LLLLLLLL.....LL#'],
    [7, '#...............#'],
    [1, '#LLLLLL.....LLLL#'],
    [7, '#...............#'],
    [1, '#LLLL.....LLLLLL#'],
    [7, '#...............#'],
    [1, '#LL.....LLLLLLLL#'],
    [7, '#...............#'],
    [1, '#LLLL.....LLLLLL#'],
    [9, '#...............#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, 3], [44, -3], [56, 0], [61, 0]] },
  ],
};

/** Security checkpoint: laser gates and blast doors in turn. */
export const lasers2: Piece = {
  id: 'lasers-2',
  family: 'lasers',
  tiers: [2, 2],
  weight: 2,
  height: 3.6,
  grid: grid(
    [10, '#...............#'],
    [1, '#LLLLL.....LLLLL#'],
    [5, '#...............#'],
    [3, '#PP.............#'],
    [7, '#...............#'],
    [1, '#LLLLL.....LLLLL#'],
    [5, '#...............#'],
    [3, '#.............PP#'],
    [7, '#...............#'],
    [1, '#LLLLL.....LLLLL#'],
    [7, '#...............#'],
  ),
  overlays: [
    {at: 18, kind: 'door', x: 0, half: 2},
    {at: 34, kind: 'door', x: 0, half: 2},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [49, 0]] },
  ],
};
