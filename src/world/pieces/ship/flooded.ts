import type { Piece } from '../format';
import { grid } from '../grid';

// flooded pieces. Generated layouts, kept here as literal grids: edit freely.

/** Flooded section: water over the deck, railed catwalks above it; the side one has pickups. */
export const flooded1: Piece = {
  id: 'flooded-1',
  family: 'flooded',
  tiers: [1, 2],
  weight: 2,
  height: 4.6,
  grid: grid(
    [20, '#...................#'],
    [11, '#~~~~~~~~===~~===~~~#'],
    [3, '#~~~~~~~~========~~~#'],
    [12, '#~~~~~~~~===~~===~~~#'],
    [20, '#...................#'],
  ),
  overlays: [
    {at: 26, kind: 'drip', x: 8},
    {at: 34, kind: 'drip', x: -5},
    {at: 41, kind: 'drip', x: 8},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [65, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [19, 5], [46, 5], [65, 0]] },
  ],
};

/** Sunken corridor: down into the flooded level, along between the water, and up again. */
export const flooded2: Piece = {
  id: 'flooded-2',
  family: 'flooded',
  tiers: [0, 2],
  weight: 2,
  height: 4,
  grid: grid(
    [8, '#.............#'],
    [25, '#~~~.......~~~#'],
    [7, '#.............#'],
  ),
  overlays: [
    {at: 3, kind: 'step', rise: -2, rows: 6},
    {at: 30, kind: 'step', rise: 2, rows: 6},
    {at: 14, kind: 'drip', x: 5},
    {at: 22, kind: 'drip', x: -5},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [39, 0]] },
  ],
};
