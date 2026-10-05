import type { Piece } from '../format';
import { grid } from '../grid';

// reactor pieces. Generated layouts, kept here as literal grids: edit freely.

/** The core: a glowing gap around it, the way past on one side, pickups on the other. */
export const reactor1: Piece = {
  id: 'reactor-1',
  family: 'reactor',
  tiers: [1, 2],
  weight: 2,
  height: 6,
  grid: grid(
    [19, '#.....................#'],
    [1, '#.......       .......#'],
    [4, '#....... ooooo .......#'],
    [2, '#....... ooooo ....P..#'],
    [6, '#....... ooooo .......#'],
    [2, '#..P.... ooooo .......#'],
    [2, '#....... ooooo ....P..#'],
    [3, '#....... ooooo .......#'],
    [1, '#.......       .......#'],
    [19, '#.....................#'],
  ),
  overlays: [
    {at: 22, kind: 'steam', x: 2.8, y: -1.5, h: 4},
    {at: 30, kind: 'steam', x: -2.8, y: -1.5, h: 4},
    {at: 36, kind: 'steam', x: 2.8, y: -1.5, h: 4},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [18, 4.5], [40, 4.5], [58, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [18, -4.5], [40, -4.5], [58, 0]] },
  ],
};

/** Over the reactor pit: two railed catwalks across the drop, steam rising between them. */
export const reactor2: Piece = {
  id: 'reactor-2',
  family: 'reactor',
  tiers: [1, 2],
  weight: 2,
  height: 7,
  grid: grid(
    [25, '#...................#'],
    [9, '#        ===   ===  #'],
    [3, '#        =========  #'],
    [9, '#        ===   ===  #'],
    [25, '#...................#'],
  ),
  overlays: [
    {at: 28, kind: 'steam', x: -5, y: -3, h: 6},
    {at: 34, kind: 'steam', x: 3, y: -3, h: 6},
    {at: 40, kind: 'steam', x: -6, y: -3, h: 6},
    {at: 31, kind: 'sparks', x: -8.5, y: 1.5},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [70, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [24, 6], [46, 6], [70, 0]] },
  ],
};
