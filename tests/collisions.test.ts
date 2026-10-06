import { Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { speedAt } from '../src/difficulty';
import { InstancedField } from '../src/field';
import { LivePalette } from '../src/palette';
import { World } from '../src/world';

// Collision audit over every pool in the game. The world is generated across
// every area and sub-level for a few seeds, and every live instance is checked
// against the mesh it draws:
//   - anything solid is in the list the ship is tested against
//   - nothing solid is drawn wider than it collides ("flew through it")
//   - nothing collides much wider than it is drawn ("invisible wall")
//   - nothing solid floats above the height the ship flies at
// The fairness tests then prove the safe lane never touches any of it.

// The ship hovers at 0.14 with a ridge of 0.08, and banks and rides slopes, so
// what it can touch is anything crossing these heights.
const SLICES = [0.05, 0.15, 0.25, 0.35, 0.45]; // the ship's height with room for banking and slopes
// What the eye reads as an object's footprint: anything bigger than this is an invisible wall.
const FOOTPRINT = [...SLICES, 0.6, 1, 1.5, 2.5, 4];
const SHIP_TOP = 0.45;
const TOO_SMALL = 1.1; // drawn radius may exceed the hitbox by this much (boxes vs round shapes)
const TOO_BIG = 1.8; // hitbox may exceed the drawn radius by this factor (clumps of crystals and bushes are ragged)...
const SLACK = 0.2; // ...plus this much
const SEEDS = [5, 77, 2024];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 20, 21, 22, 23, 24];
const SECONDS = 18;
const DT = 1 / 20;

interface Mesh {
  minY: number;
  pos: Float32Array; // x, y, z per vertex
  tris: Uint32Array;
}

const cache = new WeakMap<InstancedField, Mesh>();
function meshOf(f: InstancedField): Mesh {
  let c = cache.get(f);
  if (c) return c;
  const g = f.mesh.geometry;
  const p = g.getAttribute('position');
  const pos = new Float32Array(p.count * 3);
  let minY = Infinity;
  for (let i = 0; i < p.count; i++) {
    pos[i * 3] = p.getX(i);
    pos[i * 3 + 1] = p.getY(i);
    pos[i * 3 + 2] = p.getZ(i);
    minY = Math.min(minY, p.getY(i));
  }
  const idx = g.getIndex();
  const tris = new Uint32Array(idx ? idx.count : p.count);
  for (let i = 0; i < tris.length; i++) tris[i] = idx ? idx.getX(i) : i;
  c = { minY, pos, tris };
  cache.set(f, c);
  return c;
}

/** The widest the mesh is, per axis and around, where the plane at geometry height `gy` cuts it. */
function slice(m: Mesh, gy: number, sx: number, sz: number, out: number[]): boolean {
  let hit = false;
  const { pos, tris } = m;
  const take = (x: number, z: number) => {
    const ax = Math.abs(x) * sx;
    const az = Math.abs(z) * sz;
    out[0] = Math.max(out[0], ax);
    out[1] = Math.max(out[1], az);
    out[2] = Math.max(out[2], Math.hypot(ax, az));
    hit = true;
  };
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e] * 3;
      const b = tris[t + ((e + 1) % 3)] * 3;
      const ya = pos[a + 1] - gy;
      const yb = pos[b + 1] - gy;
      if (ya === 0) take(pos[a], pos[a + 2]);
      if (ya * yb < 0) {
        const k = ya / (ya - yb);
        take(pos[a] + (pos[b] - pos[a]) * k, pos[a + 2] + (pos[b + 2] - pos[a + 2]) * k);
      }
    }
  }
  return hit;
}

interface Finding {
  field: string;
  problem: string;
  detail: string;
}

function audit(world: World, found: Map<string, Finding>): void {
  const w = world as unknown as Record<string, unknown> & { solids: InstancedField[] };
  const ext = [0, 0, 0];
  for (const [name, f] of Object.entries(w)) {
    if (!(f instanceof InstancedField)) continue;
    const registered = w.solids.includes(f);
    const mesh = meshOf(f);
    for (let i = 0; i < f.top; i++) {
      if (!f.active[i] || !f.solid[i]) continue;
      const note = (problem: string, detail: string) => {
        const key = `${name}:${problem}`;
        if (!found.has(key)) found.set(key, { field: name, problem, detail });
      };
      if (!registered) note('solid but never tested', `hx ${f.hx[i].toFixed(2)} at d ${f.d[i].toFixed(0)}`);
      if (f.hx[i] <= 0 || f.hz[i] <= 0) note('solid with no hitbox', `hx ${f.hx[i]} hz ${f.hz[i]}`);
      // Resting height: a falling or pulsing instance rests at bx.
      const m = f.moving[i];
      const y = m === 3 || m === 4 ? f.bx[i] : f.y[i];
      const sy = f.sy[i];
      if (y + mesh.minY * sy > SHIP_TOP) note('solid but floating above the ship', `lowest point ${(y + mesh.minY * sy).toFixed(2)}`);
      // Widest the shape gets at the heights the ship occupies.
      ext[0] = ext[1] = ext[2] = 0;
      let any = false;
      for (const h of SLICES) any = slice(mesh, (h - y) / sy, f.sx[i], f.sz[i], ext) || any;
      if (!any) continue; // nothing at ship height: covered by the floating check
      const turned = Math.abs(f.sin[i]) > 1e-3 && Math.abs(f.cos[i]) > 1e-3;
      const dx = turned ? ext[2] : ext[0];
      const dz = turned ? ext[2] : ext[1];
      for (const h of FOOTPRINT.slice(SLICES.length)) slice(mesh, (h - y) / sy, f.sx[i], f.sz[i], ext);
      const fx = turned ? ext[2] : ext[0];
      const fz = turned ? ext[2] : ext[1];
      if (dx > f.hx[i] * TOO_SMALL + 0.05) note('drawn wider than its hitbox (x)', `drawn ${dx.toFixed(2)} hit ${f.hx[i].toFixed(2)} ratio ${(dx / f.hx[i]).toFixed(2)}`);
      if (dz > f.hz[i] * TOO_SMALL + 0.05) note('drawn deeper than its hitbox (z)', `drawn ${dz.toFixed(2)} hit ${f.hz[i].toFixed(2)} ratio ${(dz / f.hz[i]).toFixed(2)}`);
      if (f.hx[i] > fx * TOO_BIG + SLACK) note('hitbox wider than the shape (x)', `drawn ${fx.toFixed(2)} hit ${f.hx[i].toFixed(2)}`);
      if (f.hz[i] > fz * TOO_BIG + SLACK) note('hitbox deeper than the shape (z)', `drawn ${fz.toFixed(2)} hit ${f.hz[i].toFixed(2)}`);
    }
  }
}

/** Props are built with Math.random (their shapes are ragged): seed it so the audit reads the same every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sweep(): Finding[] {
  const found = new Map<string, Finding>();
  const random = Math.random;
  for (const level of LEVELS) {
    for (const seed of SEEDS) {
      Math.random = seeded(seed * 31 + level);
      const world = new World(new Scene(), new LivePalette());
      const startScore = Math.max(0, (level - 1) * CONFIG.score.levelLength - 60);
      world.reset(CONFIG.field.startClearance, true, startScore, seed);
      let score = startScore;
      for (let t = 0; t < SECONDS; t += DT) {
        const speed = speedAt(score);
        world.advance(DT, speed, 0);
        score += speed * DT * CONFIG.score.pointsPerUnit;
        if (Math.round(t / DT) % 20 === 0) audit(world, found);
      }
    }
  }
  Math.random = random;
  return [...found.values()];
}

describe('collision audit', () => {
  const findings = sweep();

  it('finds nothing to report', () => {
    const lines = findings.map((f) => `${f.field}: ${f.problem} (${f.detail})`);
    expect(lines).toEqual([]);
  });
});
