import type { Piece } from '../format';
import { grid } from '../grid';

// dropshaft pieces. Generated layouts, kept here as literal grids: edit freely.

/** Drop shaft: a railed catwalk over the shaft, then the deck drops away to the level below. */
export const dropShaft1: Piece = {
  id: 'dropshaft-1',
  family: 'dropShaft',
  tiers: [1, 2],
  weight: 2,
  height: 7.5,
  grid: grid(
    [8, '#.................#'],
    [23, '#       ===       #'],
    [19, '#.................#'],
  ),
  overlays: [
    {at: 34, kind: 'step', rise: -4.5, rows: 6},
    {at: 12, kind: 'sparks', x: -7.5, y: 2},
    {at: 22, kind: 'steam', x: 5, y: -4, h: 6},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [49, 0]] },
  ],
};

/** Zigzag: a catwalk winding down the shaft in two drops. */
export const dropShaft2: Piece = {
  id: 'dropshaft-2',
  family: 'dropShaft',
  tiers: [2, 2],
  weight: 2,
  height: 8,
  grid: grid(
    [6, '#.................#'],
    [4, '#        ===      #'],
    [4, '#         ===     #'],
    [4, '#          ===    #'],
    [5, '#           ===   #'],
    [4, '#          ===    #'],
    [4, '#         ===     #'],
    [4, '#        ===      #'],
    [4, '#       ===       #'],
    [4, '#      ===        #'],
    [4, '#     ===         #'],
    [6, '#      ===        #'],
    [3, '#       ===       #'],
    [6, '#.................#'],
  ),
  overlays: [
    {at: 14, kind: 'step', rise: -2.4, rows: 6},
    {at: 36, kind: 'step', rise: -2.4, rows: 6},
    {at: 26, kind: 'steam', x: -5, y: -4, h: 7},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [4, 0], [20, 4], [44, -2], [56, 0], [61, 0]] },
  ],
};
