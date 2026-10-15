import type { Piece } from '../format';
import { grid } from '../grid';

// command pieces. Generated layouts, kept here as literal grids: edit freely.

/** Command deck: tiers of consoles under the viewscreen, a gap through each on the line. */
export const command1: Piece = {
  id: 'command-1',
  family: 'command',
  tiers: [0, 2],
  weight: 2,
  height: 4.6,
  grid: grid(
    [12, '#.....................#'],
    [1, '#KKKKKKKKK.....KKKKKKK#'],
    [7, '#.....................#'],
    [1, '#KKKKKKKKKKK.....KKKKK#'],
    [7, '#.....................#'],
    [1, '#KKKKKKKKKKK.....KKKKK#'],
    [7, '#.....................#'],
    [1, '#KKKKKKKKKK.....KKKKKK#'],
    [15, '#.....................#'],
  ),
  overlays: [
    {at: 2, kind: 'step', rise: 1.1, rows: 4},
    {at: 46, kind: 'step', rise: -1.1, rows: 4},
    {at: 48, kind: 'holo', x: 0, y: 1.2, w: 14, h: 2.6},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [8, 0], [20, 3], [32, 3], [44, 0], [51, 0]] },
  ],
};

/** The bridge: round the captain's dais either side, consoles along the windows. */
export const command2: Piece = {
  id: 'command-2',
  family: 'command',
  tiers: [1, 2],
  weight: 2,
  height: 4.8,
  grid: grid(
    [10, '#.....................#'],
    [3, '#KK.................KK#'],
    [9, '#.....................#'],
    [9, '#........KKKKK........#'],
    [13, '#.....................#'],
    [3, '#KK.................KK#'],
    [10, '#.....................#'],
  ),
  overlays: [
    {at: 26, kind: 'holo', x: 0, y: 1, w: 3, h: 1.4},
    {at: 54, kind: 'holo', x: 0, y: 1.2, w: 14, h: 2.6},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [20, 5], [36, 5], [56, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [20, -5], [36, -5], [56, 0]] },
  ],
};
