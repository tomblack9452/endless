import type { Piece } from '../format';
import { grid } from '../grid';

// deck pieces. Generated layouts, kept here as literal grids: edit freely.

/** Open deck: console islands under the windows; the bonus line runs along the window side. */
export const deck1: Piece = {
  id: 'deck-1',
  family: 'deck',
  tiers: [0, 2],
  weight: 2,
  height: 3.6,
  grid: grid(
    [6, '#...................#'],
    [3, '#..KKK..............#'],
    [1, '#...................#'],
    [3, '#.................KK#'],
    [3, '#...................#'],
    [3, '#.....KK............#'],
    [7, '#...................#'],
    [3, '#.KKK...............#'],
    [1, '#...................#'],
    [3, '#...........KK......#'],
    [3, '#...................#'],
    [3, '#.................KK#'],
    [25, '#...................#'],
  ),
  overlays: [
    {at: 8, kind: 'holo', x: -6, y: 1, w: 2, h: 1.2},
    {at: 31, kind: 'holo', x: 2.5, y: 1, w: 1.6, h: 1},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [63, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [20, 5], [43, 5], [63, 0]] },
  ],
};

/** Split deck: a long console bank divides the main walk from a narrow window gallery with pickups. */
export const deck2: Piece = {
  id: 'deck-2',
  family: 'deck',
  tiers: [1, 2],
  weight: 2,
  height: 3.8,
  grid: grid(
    [14, '#.....................#'],
    [3, '#.KK..................#'],
    [6, '#.....................#'],
    [7, '#.............K.......#'],
    [2, '#.KK..........K.....cc#'],
    [1, '#.KK..........K.......#'],
    [8, '#.............K.......#'],
    [28, '#.....................#'],
  ),
  overlays: [
    {at: 24, kind: 'holo', x: 3, y: 1, w: 0.2, h: 1.4},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [68, 0]] },
    { tag: 'risky', reward: 'pickups', points: [[0, 0], [24, 6], [44, 6], [68, 0]] },
  ],
};
