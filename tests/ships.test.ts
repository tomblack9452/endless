import { describe, expect, it } from 'vitest';
import { LOOKS } from '../src/catalogue';
import { CONFIG } from '../src/config';
import { DECAL_SVG } from '../src/decals';
import { itemsIn } from '../src/looks';
import { MARKING_ID, shipGeometry } from '../src/player';
import { TRAIL_STYLES } from '../src/trail';
import type { ShipId } from '../src/cosmetics';

// Every look in the catalogue can be drawn, and none of them changes how the
// ship flies: the hitbox is the same whatever you wear.

const S = CONFIG.ship;

describe('hulls', () => {
  for (const item of itemsIn('hull')) {
    it(`${item.id} is a real shape that fits the ship's footprint`, () => {
      const g = shipGeometry(item.id as ShipId);
      const p = g.getAttribute('position');
      expect(p.count).toBeGreaterThanOrEqual(6);
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      let maxY = 0;
      for (let i = 0; i < p.count; i++) {
        minX = Math.min(minX, p.getX(i));
        maxX = Math.max(maxX, p.getX(i));
        minZ = Math.min(minZ, p.getZ(i));
        maxZ = Math.max(maxZ, p.getZ(i));
        maxY = Math.max(maxY, p.getY(i));
      }
      // Wings may be wider than the starter hull, never wildly: the hitbox is the same for all.
      expect(maxX).toBeLessThanOrEqual(S.halfWidth * 1.6);
      expect(minX).toBeGreaterThanOrEqual(-S.halfWidth * 1.6);
      expect(minZ).toBeGreaterThanOrEqual(-S.length * 0.95);
      expect(maxZ).toBeLessThanOrEqual(S.length * 0.8);
      expect(maxY).toBeGreaterThan(0);
      expect(maxY).toBeLessThanOrEqual(S.height * 2);
      // Symmetrical about the middle.
      expect(Math.abs(maxX + minX)).toBeLessThan(1e-6);
    });
  }

  it('are all different shapes', () => {
    const sig = (id: string) => {
      const p = shipGeometry(id as ShipId).getAttribute('position');
      return Array.from({ length: p.count }, (_, i) => `${p.getX(i).toFixed(3)},${p.getZ(i).toFixed(3)}`).join(' ');
    };
    const all = itemsIn('hull').map((h) => sig(h.id));
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('markings, decals and flames', () => {
  it('every marking has a shader id, and they are all different', () => {
    for (const item of itemsIn('markings')) expect(MARKING_ID[item.id as keyof typeof MARKING_ID], item.id).toBeDefined();
    const ids = Object.values(MARKING_ID);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBe(ids.length - 1); // no gaps: the shader steps through them in order
  });

  it('every decal that is a picture has one', () => {
    for (const item of itemsIn('decal')) {
      if (['none', 'rank', 'league'].includes(item.id)) continue;
      const svg = DECAL_SVG[item.id];
      expect(svg, item.id).toBeDefined();
      expect(svg).toContain('<svg');
      expect(svg).toContain('currentColor');
      expect((svg.match(/</g) ?? []).length, item.id).toBe((svg.match(/>/g) ?? []).length); // balanced tags
    }
  });

  it('no decal art without a look to unlock it', () => {
    const ids = new Set(itemsIn('decal').map((d) => d.id));
    for (const id of Object.keys(DECAL_SVG)) expect(ids.has(id), id).toBe(true);
  });

  it('every flame look draws between one and three flames', () => {
    for (const item of itemsIn('trail')) {
      const spec = TRAIL_STYLES[item.id as keyof typeof TRAIL_STYLES];
      expect(spec, item.id).toBeDefined();
      expect(spec.length).toBeGreaterThanOrEqual(1);
      expect(spec.length).toBeLessThanOrEqual(3);
      for (const f of spec) {
        expect(f.len).toBeGreaterThan(0);
        expect(f.width).toBeGreaterThan(0);
        expect(f.alpha).toBeGreaterThan(0);
        expect(f.alpha).toBeLessThanOrEqual(1);
      }
    }
  });

  it('every fin look is one the ship can build', () => {
    const fins = itemsIn('fins').map((f) => f.id);
    expect(fins).toEqual(expect.arrayContaining(['none', 'tail', 'twin', 'winglets', 'blade', 'crest', 'swept']));
    expect(LOOKS.filter((l) => l.slot === 'fins').length).toBe(fins.length);
  });
});
