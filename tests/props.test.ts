import type { BufferGeometry } from 'three';
import { describe, expect, it } from 'vitest';
import { alienCactus, basaltColumns, boulder, bush, crystalCluster, deadTree, mesa, MESA_RADIUS, mushroomTree, rockSpire, spireTree } from '../src/props';
import { MESA_HIT, Prop, PROP_HIT, ROCK_HIT } from '../src/world';

// Nothing solid may look wider than it collides: at the height the ship flies,
// each shape has to fit inside its hitbox (with a little leeway, since the
// hitbox is a square and the shapes are round). Rock shapes are jittered at
// random, so each is built several times.

const SHIP_BAND = 0.6; // the ship flies below this (scale-1 units, with room for banking and hills)
const LEEWAY = 1.1;

function widest(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  let r = 0;
  for (let i = 0; i < p.count; i++) if (p.getY(i) <= SHIP_BAND) r = Math.max(r, Math.hypot(p.getX(i), p.getZ(i)));
  return r;
}

const SHAPES: [string, () => BufferGeometry, number][] = [
  ['boulder (walls, rock faces, obstacles)', boulder, ROCK_HIT],
  ['boulder (scattered rocks)', boulder, PROP_HIT[Prop.Rock]],
  ['mushroom tree', mushroomTree, PROP_HIT[Prop.Mushroom]],
  ['spire tree', spireTree, PROP_HIT[Prop.Spire]],
  ['crystal', crystalCluster, PROP_HIT[Prop.Crystal]],
  ['bush', bush, PROP_HIT[Prop.Bush]],
  ['dead tree', deadTree, PROP_HIT[Prop.DeadTree]],
  ['rock spire', rockSpire, PROP_HIT[Prop.RockSpire]],
  ['alien cactus', alienCactus, PROP_HIT[Prop.Cactus]],
  ['basalt columns', basaltColumns, PROP_HIT[Prop.Basalt]],
  ['mesa', mesa, MESA_RADIUS * MESA_HIT],
];

describe('solid shapes fit their hitboxes', () => {
  for (const [name, make, hit] of SHAPES) {
    it(name, () => {
      for (let k = 0; k < 8; k++) expect(widest(make())).toBeLessThanOrEqual(hit * LEEWAY);
    });
  }
});
