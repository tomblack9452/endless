import type { Piece } from '../format';
import { grid } from '../grid';

// lab pieces. Generated layouts, kept here as literal grids: edit freely.

/** Lab: rows of glass tanks; a side aisle between them has pickups. */
export const lab1: Piece = {
  id: 'lab-1',
  family: 'lab',
  tiers: [0, 2],
  weight: 2,
  height: 4.6,
  grid: grid(
    [6, '#...................#'],
    [2, '#...............KKK.#'],
    [14, '#...................#'],
    [3, '#..T...T.....T...T..#'],
    [2, '#...................#'],
    [3, '#..T...T.....T...T..#'],
    [2, '#...................#'],
    [3, '#..T...T.....T...T..#'],
    [2, '#...................#'],
    [3, '#..T...T.....T...T..#'],
    [10, '#...................#'],
    [2, '#...............KKK.#'],
    [11, '#...................#'],
  ),
  overlays: [
    {at: 6, kind: 'holo', x: 7, y: 0.9, w: 1.6, h: 0.8},
    {at: 50, kind: 'holo', x: 7, y: 0.9, w: 1.6, h: 0.8},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [62, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [20, -5], [42, -5], [62, 0]] },
  ],
};

/** Quarantine: an airlock door and laser gates, specimen tanks along the walls. */
export const lab2: Piece = {
  id: 'lab-2',
  family: 'lab',
  tiers: [1, 2],
  weight: 2,
  height: 4.2,
  grid: grid(
    [4, '#.................#'],
    [6, '#.T.............T.#'],
    [2, '#.................#'],
    [1, '#LLLLLL.....LLLLLL#'],
    [11, '#.................#'],
    [1, '#LLLLLL.....LLLLLL#'],
    [1, '#.................#'],
    [6, '#.T.............T.#'],
    [10, '#.................#'],
  ),
  overlays: [
    {at: 18, kind: 'door', x: 0, half: 2},
    {at: 36, kind: 'door', x: 0, half: 2},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [41, 0]] },
  ],
};
