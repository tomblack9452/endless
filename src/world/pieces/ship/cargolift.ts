import type { Piece } from '../format';
import { grid } from '../grid';

// cargolift pieces. Generated layouts, kept here as literal grids: edit freely.

/** Cargo lift: the floor rises on a lift platform; hooks on chains swing across the bay. */
export const cargoLift1: Piece = {
  id: 'cargolift-1',
  family: 'cargoLift',
  tiers: [0, 2],
  weight: 2,
  height: 6.5,
  grid: grid(
    [4, '#...................#'],
    [5, '#CC.................#'],
    [21, '#...................#'],
    [5, '#.................CC#'],
    [5, '#...................#'],
    [5, '#cc.................#'],
    [5, '#...................#'],
  ),
  overlays: [
    {at: 16, kind: 'step', rise: 3.2, rows: 4},
    {at: 10, kind: 'hook', x: [-4, 4], arrive: 3.6},
    {at: 28, kind: 'hook', x: [-4, 4], arrive: -3.6},
    {at: 38, kind: 'hook', x: [-4, 4], arrive: 3.4},
  ],
  routes: [
    { tag: 'main', points: [[0, 0], [49, 0]] },
  ],
};
