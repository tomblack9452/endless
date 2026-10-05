import type { Piece } from '../format';
import { grid } from '../grid';

// vents-fan pieces. Generated layouts, kept here as literal grids: edit freely.

/** Ventilation: giant fans turning in pits either side of the walkway. */
export const fanRoom1: Piece = {
  id: 'fan-1',
  family: 'fanRoom',
  tiers: [1, 2],
  weight: 2,
  height: 6.5,
  grid: grid(
    [8, '#...................#'],
    [9, '#       ............#'],
    [5, '#...................#'],
    [9, '#............       #'],
    [3, '#...................#'],
    [7, '#       ............#'],
    [3, '#...................#'],
  ),
  overlays: [
    {at: 12, kind: 'fan', x: -6, y: -1.6, size: 2.6},
    {at: 26, kind: 'fan', x: 6, y: -1.6, size: 2.6},
    {at: 37, kind: 'fan', x: -6, y: -1.6, size: 2.4},
    {at: 12, kind: 'steam', x: -6, y: -1.4, h: 3.5},
    {at: 26, kind: 'steam', x: 6, y: -1.4, h: 3.5},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [43, 0]] },
  ],
};

/** Fan hall: the walkway weaves over a floor of fan pits. */
export const fanRoom2: Piece = {
  id: 'fan-2',
  family: 'fanRoom',
  tiers: [2, 2],
  weight: 2,
  height: 6.5,
  grid: grid(
    [10, '#...................#'],
    [2, '#       .......     #'],
    [4, '#        .......    #'],
    [5, '#         .......   #'],
    [1, '#        .......    #'],
    [2, '#...................#'],
    [1, '#        .......    #'],
    [4, '#       .......     #'],
    [4, '#      .......      #'],
    [3, '#     .......       #'],
    [2, '#...................#'],
    [3, '#    .......        #'],
    [3, '#   .......         #'],
    [4, '#    .......        #'],
    [3, '#     .......       #'],
    [10, '#...................#'],
  ),
  overlays: [
    {at: 14, kind: 'fan', x: -6, y: -1.8, size: 2.6},
    {at: 18, kind: 'fan', x: 7, y: -1.8, size: 1.8},
    {at: 30, kind: 'fan', x: 6, y: -1.8, size: 2.4},
    {at: 44, kind: 'fan', x: 5, y: -1.8, size: 2.6},
    {at: 44, kind: 'fan', x: -7, y: -1.8, size: 1.8},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [6, 0], [18, 3], [42, -3], [54, 0], [60, 0]] },
  ],
};
