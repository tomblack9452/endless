import type { Piece } from '../format';
import { grid } from '../grid';

// plant pieces. Generated layouts, kept here as literal grids: edit freely.

/** Coolant plant: curtains of falling coolant across the room, the gap moving from one to the next. */
export const coolant1: Piece = {
  id: 'coolant-1',
  family: 'coolant',
  tiers: [0, 2],
  weight: 2,
  height: 4.4,
  grid: grid(
    [12, '#.................#'],
    [1, '#wwwwwww.....wwwww#'],
    [7, '#.................#'],
    [1, '#wwwwwwwww.....www#'],
    [7, '#.................#'],
    [1, '#wwwwwww.....wwwww#'],
    [7, '#.................#'],
    [1, '#wwwww.....wwwwwww#'],
    [7, '#.................#'],
    [1, '#www.....wwwwwwwww#'],
    [7, '#.................#'],
    [1, '#wwwww.....wwwwwww#'],
    [9, '#.................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, 3], [44, -3], [56, 0], [61, 0]] },
  ],
};

/** Steam vents: rows of floor vents firing on a rhythm either side of the walkway. */
export const vents1: Piece = {
  id: 'vents-1',
  family: 'vents',
  tiers: [1, 2],
  weight: 2,
  height: 3.8,
  grid: grid(
    [8, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [5, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [5, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [5, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [5, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [5, '#.................#'],
    [1, '#..v..v.....v..v..#'],
    [11, '#.................#'],
  ),
  routes: [
    { tag: 'main', points: [[0, 0], [49, 0]] },
  ],
};

/** Foundry: curtains of molten metal across the floor, sparks, troughs along the walls. */
export const foundry1: Piece = {
  id: 'foundry-1',
  family: 'foundry',
  tiers: [1, 2],
  weight: 2,
  height: 5.2,
  grid: grid(
    [14, '#...................#'],
    [1, '#mmmmmm.....mmmmmmmm#'],
    [3, '#...................#'],
    [3, '#cc.................#'],
    [5, '#...................#'],
    [1, '#mmmmmm.....mmmmmmmm#'],
    [3, '#...................#'],
    [3, '#.................cc#'],
    [5, '#...................#'],
    [1, '#mmmmmmmmm.....mmmmm#'],
    [3, '#...................#'],
    [3, '#cc.................#'],
    [5, '#...................#'],
    [1, '#mmmmmmmmm.....mmmmm#'],
    [11, '#...................#'],
  ),
  overlays: [
    {at: 14, kind: 'sparks', x: -8, y: 1},
    {at: 38, kind: 'sparks', x: 8, y: 1},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, -3], [44, 3], [56, 0], [61, 0]] },
  ],
};

/** Reactor collapse: wreckage crashes down off the line as you come. */
export const collapse1: Piece = {
  id: 'collapse-1',
  family: 'collapse',
  tiers: [2, 2],
  weight: 1,
  height: 6,
  grid: grid(
    [20, '#.....................#'],
    [2, '#xx...................#'],
    [12, '#.....................#'],
    [2, '#...................xx#'],
    [26, '#.....................#'],
  ),
  overlays: [
    {at: 10, kind: 'debris', x: 5.5, w: 1.4},
    {at: 14, kind: 'debris', x: 7.5, w: 1.4},
    {at: 18, kind: 'debris', x: 6.5, w: 1.4},
    {at: 22, kind: 'debris', x: 7.5, w: 1.4},
    {at: 26, kind: 'debris', x: 7.5, w: 1.4},
    {at: 30, kind: 'debris', x: 4.5, w: 1.4},
    {at: 34, kind: 'debris', x: 4.5, w: 1.4},
    {at: 38, kind: 'debris', x: 4.5, w: 1.4},
    {at: 42, kind: 'debris', x: 1.5, w: 1.4},
    {at: 46, kind: 'debris', x: 2.5, w: 1.4},
    {at: 50, kind: 'debris', x: 4.5, w: 1.4},
    {at: 24, kind: 'sparks', x: -9.5, y: 2},
    {at: 40, kind: 'sparks', x: 9.5, y: 2},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, 3], [44, -3], [56, 0], [61, 0]] },
  ],
};
