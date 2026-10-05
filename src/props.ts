import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Low-poly scenery and obstacles with shading baked into vertex colours, so
// they read as solid shapes without any lights. Hues are baked in; the
// material colour then acts as overall brightness (time of day).
//
// Sizes are in world units at scale 1. Every prop stands on y = 0.

const LIGHT = new Vector3(0.45, 0.8, 0.4).normalize();

/** One part of a prop: a geometry, where it goes, and its base colour. */
interface Part {
  geometry: BufferGeometry;
  matrix: Matrix4;
  color: string;
}

function part(geometry: BufferGeometry, color: string, ...ops: ((m: Matrix4) => Matrix4)[]): Part {
  const matrix = new Matrix4();
  for (const op of ops) matrix.premultiply(op(new Matrix4()));
  return { geometry, matrix, color };
}

const move = (x: number, y: number, z: number) => (m: Matrix4) => m.makeTranslation(x, y, z);
const scale = (x: number, y: number, z: number) => (m: Matrix4) => m.makeScale(x, y, z);
const tiltX = (a: number) => (m: Matrix4) => m.makeRotationX(a);
const tiltZ = (a: number) => (m: Matrix4) => m.makeRotationZ(a);

/** Bake per-face shading into vertex colours and merge the parts. */
function build(parts: Part[]): BufferGeometry {
  const baked: BufferGeometry[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const base = new Color();
  for (const p of parts) {
    const g = (p.geometry.index ? p.geometry.toNonIndexed() : p.geometry.clone()).applyMatrix4(p.matrix);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    base.set(p.color);
    const pos = g.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const n = b.sub(a).cross(c.sub(a)).normalize();
      const shade = 0.45 + 0.55 * Math.max(0, n.dot(LIGHT)) + (Math.random() - 0.5) * 0.05;
      for (let k = 0; k < 3; k++) colors.push(base.r * shade, base.g * shade, base.b * shade);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    baked.push(g);
  }
  const merged = mergeGeometries(baked);
  if (!merged) throw new Error('prop merge failed');
  return merged;
}

/** Alien mushroom tree: thin leaning trunk, wide faceted cap above head height, hanging pods. */
/** Power-up gem: white with baked shading, tinted per kind by instance colour. Centred. */
export function powerGem(size: number): BufferGeometry {
  return build([part(new IcosahedronGeometry(size, 0), '#ffffff')]);
}

export function mushroomTree(): BufferGeometry {
  const parts: Part[] = [
    part(new CylinderGeometry(0.1, 0.19, 3.1, 6), '#5d544c', move(0, 1.55, 0), tiltZ(0.06)),
    part(new CylinderGeometry(1.55, 1.45, 0.14, 9), '#4c6964', move(0.18, 3.08, 0)),
    part(new ConeGeometry(1.55, 0.75, 9), '#86a8a0', move(0.18, 3.52, 0)),
  ];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + 0.4;
    parts.push(
      part(new OctahedronGeometry(0.14, 0), '#d4bd86', scale(1, 1.6, 1), move(0.18 + Math.cos(ang) * 0.95, 2.78, Math.sin(ang) * 0.95)),
    );
  }
  return build(parts);
}

/** Alien spire tree: very thin trunk with stacked flat discs and a seed on top. */
export function spireTree(): BufferGeometry {
  const parts: Part[] = [part(new CylinderGeometry(0.07, 0.15, 4.2, 5), '#5a5048', move(0, 2.1, 0))];
  const tiers: [number, number, string][] = [
    [1.05, 2.1, '#6f8f84'],
    [0.8, 2.85, '#7d9c90'],
    [0.55, 3.5, '#8daa9d'],
  ];
  for (const [r, y, col] of tiers) parts.push(part(new ConeGeometry(r, 0.45, 7), col, move(0, y, 0)));
  parts.push(part(new IcosahedronGeometry(0.2, 0), '#d4bd86', move(0, 4.25, 0)));
  return build(parts);
}

/** Cluster of tall crystal shards in pale blue-grey and faded lilac. */
export function crystalCluster(): BufferGeometry {
  const shards: [number, number, number, number, number, string][] = [
    // x, z, height, tiltX, tiltZ, colour
    [0, 0, 2.6, 0.05, -0.08, '#a3b8c6'],
    [0.32, 0.12, 1.7, -0.1, 0.35, '#b9abc9'],
    [-0.28, -0.1, 1.4, 0.25, -0.3, '#93aabb'],
    [0.05, -0.3, 1.0, -0.35, 0.1, '#c2b6d1'],
  ];
  return build(
    shards.map(([x, z, h, tx, tz, col]) =>
      part(new OctahedronGeometry(0.3, 0), col, scale(1, h / 0.6, 1), move(0, h / 2 - 0.1, 0), tiltX(tx), tiltZ(tz), move(x, 0, z)),
    ),
  );
}

/**
 * Parked shuttle for the hangar: a low wedge hull with swept wings, a canopy
 * and an orange stripe. Nose points to -z. About 3.6 wide and 5 long.
 */
export function shuttle(): BufferGeometry {
  const lie = (m: Matrix4) => m.makeRotationX(-Math.PI / 2); // cone tip to -z
  const quarter = (m: Matrix4) => m.makeRotationY(Math.PI / 4); // square cone faces up
  return build([
    part(new ConeGeometry(1.1, 5, 4), '#b9b7b1', quarter, lie, scale(1, 0.45, 1), move(0, 0.75, 0)),
    part(new CylinderGeometry(0.9, 0.9, 0.12, 3), '#9d9b95', scale(2, 1, 1.4), move(0, 0.55, 0.9)),
    part(new ConeGeometry(0.35, 1.2, 4), '#4b5560', quarter, lie, scale(1, 0.6, 1), move(0, 1.05, -0.6)),
    part(new CylinderGeometry(0.06, 0.06, 2.8, 4), '#c98b4f', (m) => m.makeRotationZ(Math.PI / 2), move(0, 0.92, 0.6)),
    part(new CylinderGeometry(0.22, 0.28, 0.5, 6), '#5d6066', (m) => m.makeRotationX(Math.PI / 2), move(-0.5, 0.75, 2.45)),
    part(new CylinderGeometry(0.22, 0.28, 0.5, 6), '#5d6066', (m) => m.makeRotationX(Math.PI / 2), move(0.5, 0.75, 2.45)),
    part(new CylinderGeometry(0.08, 0.1, 0.55, 5), '#55585e', move(-0.9, 0.28, 0.8)),
    part(new CylinderGeometry(0.08, 0.1, 0.55, 5), '#55585e', move(0.9, 0.28, 0.8)),
    part(new CylinderGeometry(0.08, 0.1, 0.55, 5), '#55585e', move(0, 0.28, -1.6)),
  ]);
}

/**
 * Pipe segment: an 8-sided cylinder running along z, radius 1 and length 1,
 * centred. Shading only; instance colours give it copper, steel and so on.
 */
export function pipeSegment(): BufferGeometry {
  return build([part(new CylinderGeometry(1, 1, 1, 8, 1, true), '#ffffff', (m) => m.makeRotationX(Math.PI / 2))]);
}

/** Unit box standing on y = 0 with baked shading: panels, ducts, uprights, vents. */
export function greebleBox(): BufferGeometry {
  const box = new CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1);
  return build([part(box, '#ffffff', (m) => m.makeRotationY(Math.PI / 4), move(0, 0.5, 0))]);
}

/** Upright canister / barrel with darker bands and a lid. Tinted per instance. */
export function canister(): BufferGeometry {
  return build([
    part(new CylinderGeometry(0.35, 0.35, 1.05, 10), '#ffffff', move(0, 0.525, 0)),
    part(new CylinderGeometry(0.37, 0.37, 0.07, 10), '#5c5c5c', move(0, 0.22, 0)),
    part(new CylinderGeometry(0.37, 0.37, 0.07, 10), '#5c5c5c', move(0, 0.82, 0)),
    part(new CylinderGeometry(0.22, 0.25, 0.08, 8), '#8a8a8a', move(0, 1.09, 0)),
  ]);
}

/** Boulder: jittered icosahedron, shading only (the material gives it its colour). */
export function boulder(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const jitter = new Map<string, number>();
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let j = jitter.get(key);
    if (j === undefined) {
      j = 0.78 + Math.random() * 0.4;
      jitter.set(key, j);
    }
    pos.setXYZ(i, v.x * j, v.y * j * 0.9, v.z * j);
  }
  return build([part(g, '#ffffff', move(0, 0.6, 0))]); // sunk slightly into the ground
}

/** Height of the boulder geometry at scale 1. */
export const BOULDER_HEIGHT = 1.6;

// --- open ground: extra variety ---------------------------------------------------

/** Jittered icosahedron for rocky shapes (shared vertices move together, so it stays closed). */
function lump(radius: number, detail: number, rough: number): BufferGeometry {
  const g = new IcosahedronGeometry(radius, detail);
  const pos = g.getAttribute('position');
  const jitter = new Map<string, number>();
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let j = jitter.get(key);
    if (j === undefined) {
      j = 1 - rough / 2 + Math.random() * rough;
      jitter.set(key, j);
    }
    pos.setXYZ(i, v.x * j, v.y * j, v.z * j);
  }
  return g;
}

/** Low round shrub: a few faceted clumps in two greens. About 1.2 across. */
export function bush(): BufferGeometry {
  return build([
    part(lump(0.5, 0, 0.35), '#5f7d5c', scale(1, 0.75, 1), move(0, 0.35, 0)),
    part(lump(0.38, 0, 0.35), '#728f68', scale(1, 0.8, 1), move(0.42, 0.3, 0.1)),
    part(lump(0.34, 0, 0.35), '#56704f', scale(1, 0.8, 1), move(-0.38, 0.26, -0.12)),
    part(lump(0.26, 0, 0.3), '#86a37a', move(0.05, 0.62, 0.05)),
  ]);
}

/** Dead tree: a bare leaning trunk with a few crooked branches. About 3.4 tall. */
export function deadTree(): BufferGeometry {
  const branch = (len: number, r: number, x: number, y: number, z: number, tx: number, tz: number) =>
    part(new CylinderGeometry(r * 0.5, r, len, 5), '#4b4038', move(0, len / 2, 0), tiltX(tx), tiltZ(tz), move(x, y, z));
  return build([
    part(new CylinderGeometry(0.09, 0.2, 2.6, 6), '#463b33', move(0, 1.3, 0), tiltZ(0.08)),
    branch(1.2, 0.08, 0.1, 2.3, 0, 0.1, -0.9),
    branch(1.0, 0.07, 0.12, 2.0, 0, -0.3, 0.8),
    branch(0.8, 0.06, 0.15, 2.55, 0.05, 0.7, 0.3),
    branch(0.6, 0.05, 0.2, 1.5, 0, 0.2, -1.1),
  ]);
}

/** Tall standing rock: a narrow tapering stack of lumps. About 4 tall. */
export function rockSpire(): BufferGeometry {
  return build([
    part(lump(0.75, 0, 0.3), '#8f8478', scale(1, 1.1, 1), move(0, 0.7, 0)),
    part(lump(0.55, 0, 0.3), '#9d9184', scale(1, 1.4, 1), move(0.06, 1.85, 0.04)),
    part(lump(0.38, 0, 0.3), '#aa9e90', scale(1, 1.6, 1), move(-0.04, 3.0, 0)),
    part(new ConeGeometry(0.25, 0.8, 5), '#b3a799', move(0, 3.9, 0)),
  ]);
}

/** Tuft of grass blades. About 0.5 tall; tinted by the ground colour per biome. */
export function grassTuft(): BufferGeometry {
  const blades: Part[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const h = 0.32 + (i % 3) * 0.1;
    blades.push(
      part(new ConeGeometry(0.035, h, 3), i % 2 ? '#7f9466' : '#6c8358', move(0, h / 2, 0), tiltX(Math.sin(a) * 0.35), tiltZ(Math.cos(a) * 0.35), move(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08)),
    );
  }
  return build(blades);
}

/** Flat-topped mesa for the horizon: strata of wide jittered slabs. About 14 wide, 9 tall. */
export function mesa(): BufferGeometry {
  const strata: [number, number, number, string][] = [
    // radius, height, y, colour
    [7.2, 2.6, 1.3, '#a08772'],
    [6.4, 2.4, 3.8, '#b39a83'],
    [5.8, 2.2, 6.0, '#9b826d'],
    [5.2, 1.6, 7.9, '#bca48d'],
  ];
  return build(strata.map(([r, h, y, col]) => part(new CylinderGeometry(r * 0.92, r, h, 9), col, move(0, y, 0))));
}

/** Natural rock arch: two leaning pillars and a lumpy span, 8 wide inside, 7 tall. Centred on x = 0. */
export function rockArch(): BufferGeometry {
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    parts.push(part(lump(1.3, 1, 0.25), '#958675', scale(1, 2.4, 1), move(side * 5.2, 2.6, 0)));
    parts.push(part(lump(1.0, 1, 0.25), '#a29382', scale(1.1, 1.3, 1), move(side * 4.8, 5.6, 0)));
  }
  for (let i = -2; i <= 2; i++) parts.push(part(lump(1.15, 1, 0.3), i % 2 ? '#ab9c8a' : '#9c8d7b', scale(1.2, 0.8, 1), move(i * 2.1, 7.2 - Math.abs(i) * 0.35, 0)));
  return build(parts);
}

/** Inner half-width of rockArch's opening, and where its pillars stand. */
export const ARCH_PILLAR_X = 5.2;
