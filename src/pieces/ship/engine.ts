import type { Piece } from '../format';
import { grid } from '../grid';

// engine pieces. Generated layouts, kept here as literal grids: edit freely.

/** Engine room: blocks sliding across on rails; each is off the line when you get there. */
export const engine1: Piece = {
  id: 'engine-1',
  family: 'pistons',
  tiers: [1, 2],
  weight: 2,
  height: 3.6,
  grid: grid(
    [42, '#.................#'],
  ),
  overlays: [
    {at: 8, kind: 'slider', x: [-6.5, 6.5], arrive: -4.5, w: 1.8, h: 1.6, depth: 1.2},
    {at: 14, kind: 'slider', x: [-6.5, 6.5], arrive: 4.5, w: 1.8, h: 1.6, depth: 1.2},
    {at: 20, kind: 'slider', x: [-6.5, 6.5], arrive: -4.5, w: 1.8, h: 1.6, depth: 1.2},
    {at: 26, kind: 'slider', x: [-6.5, 6.5], arrive: 4.5, w: 1.8, h: 1.6, depth: 1.2},
    {at: 32, kind: 'slider', x: [-6.5, 6.5], arrive: -4.5, w: 1.8, h: 1.6, depth: 1.2},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [41, 0]] },
  ],
};

/** Engine room, deep: sliding blocks timed to the weave, flywheels turning overhead. */
export const engine2: Piece = {
  id: 'engine-2',
  family: 'pistons',
  tiers: [2, 2],
  weight: 2,
  height: 4.4,
  grid: grid(
    [20, '#.................#'],
    [3, '#PP...............#'],
    [15, '#.................#'],
    [3, '#...............PP#'],
    [18, '#.................#'],
  ),
  overlays: [
    {at: 12, kind: 'slider', x: [-6.5, 6.5], arrive: -3.0999999999999996, w: 1.6, h: 1.6, depth: 1.2},
    {at: 20, kind: 'slider', x: [-6.5, 6.5], arrive: -2.0999999999999996, w: 1.6, h: 1.6, depth: 1.2},
    {at: 28, kind: 'slider', x: [-6.5, 6.5], arrive: -4.1, w: 1.6, h: 1.6, depth: 1.2},
    {at: 36, kind: 'slider', x: [-6.5, 6.5], arrive: 3.0999999999999996, w: 1.6, h: 1.6, depth: 1.2},
    {at: 44, kind: 'slider', x: [-6.5, 6.5], arrive: 2.0999999999999996, w: 1.6, h: 1.6, depth: 1.2},
    {at: 16, kind: 'fan', x: -5, y: 3.6, size: 1.6},
    {at: 34, kind: 'fan', x: 5, y: 3.6, size: 1.6},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [6, 0], [18, 3], [42, -3], [54, 0], [58, 0]] },
  ],
};
