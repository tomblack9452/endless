import type { Piece } from '../format';
import { grid } from '../grid';

// hangar pieces. Generated layouts, kept here as literal grids: edit freely.

/** Hangar: parked shuttles either side, blast doors closing down to a gap at the far end. */
export const hangar1: Piece = {
  id: 'hangar-1',
  family: 'hangar',
  tiers: [2, 2],
  weight: 2,
  height: 7,
  grid: grid(
    [8, '#.........................#'],
    [3, '#..ssss...................#'],
    [3, '#.........................#'],
    [3, '#...................ssss..#'],
    [5, '#.........................#'],
    [3, '#..ssss...................#'],
    [5, '#.........................#'],
    [3, '#...................ssss..#'],
    [5, '#.........................#'],
    [3, '#..ssss...................#'],
    [5, '#.........................#'],
    [3, '#...................ssss..#'],
    [9, '#.........................#'],
  ),
  overlays: [
    {at: 53, kind: 'door', x: 0, half: 2},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [57, 0]] },
    { tag: 'alt', reward: 'pickups', points: [[0, 0], [14, 3.5], [36, 3.5], [50, 0], [57, 0]] },
  ],
};

/** Hangar deck: shuttles on moving pads slide across; each is clear of the line as you pass. */
export const hangar2: Piece = {
  id: 'hangar-2',
  family: 'hangar',
  tiers: [1, 2],
  weight: 2,
  height: 7,
  grid: grid(
    [4, '#.........................#'],
    [3, '#.ssss....................#'],
    [35, '#.........................#'],
    [3, '#....................ssss.#'],
    [5, '#.........................#'],
  ),
  overlays: [
    {at: 12, kind: 'slider', x: [-8, 8], arrive: -6.5, w: 3.4, h: 1.4, depth: 4},
    {at: 20, kind: 'slider', x: [-8, 8], arrive: 6.5, w: 3.4, h: 1.4, depth: 4},
    {at: 28, kind: 'slider', x: [-8, 8], arrive: -6.5, w: 3.4, h: 1.4, depth: 4},
    {at: 36, kind: 'slider', x: [-8, 8], arrive: 6.5, w: 3.4, h: 1.4, depth: 4},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [49, 0]] },
  ],
};
