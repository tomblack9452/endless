import { CONFIG } from '../config';
import type { RoomId } from '../interior';

// Pieces: hand-made stretches of course, drawn as text grids. Each has a fixed
// layout, fixed routes and an opening at each end, so it looks the same every
// time and its routes are proven once by the tests (tests/pieces.test.ts).
// Randomness only picks which piece comes next; it never places anything solid.
//
// The grid: one character = 1 unit across, one line = one row along the run
// (CONFIG.field.rowSpacing). The first line is the near end. The middle column
// is the piece's centre line (x = 0). '#' is the outer wall on each side and
// must be symmetric (each row has the same width either side of the centre);
// everything between the walls is floor unless the legend says otherwise.

export const STEP = CONFIG.field.rowSpacing;
/** Half-width the safe lane keeps clear (as in the generator). */
export const LANE = CONFIG.themes.lane.halfWidth;

/** What a character is. Solid ones collide; runs of the same one merge into one block. */
export type Part =
  | 'floor'
  | 'pit' // no floor: a fall
  | 'catwalk' // floor with railings at its edges
  | 'wall' // outer wall (shape only: drawn by the shell)
  | 'divider' // full-height wall inside the room
  | 'crate' // steel crate, waist high
  | 'stack' // crates stacked high
  | 'rack' // server rack
  | 'tank'
  | 'console'
  | 'pillar'
  | 'water' // flooded: no floor (a fall), water across
  | 'tree' // planter with an alien tree (the trunk collides)
  | 'laser' // a security beam (posts at its ends)
  | 'core' // reactor core
  | 'shuttle' // a parked shuttle, drawn once in the middle of its block
  | 'vent' // a steam vent firing on a rhythm
  | 'coolant' // a curtain of falling coolant
  | 'molten' // a curtain of molten metal
  | 'debris'; // wreckage on the floor

const SOLID: Record<Part, boolean> = {
  floor: false,
  pit: false,
  catwalk: false,
  wall: true,
  divider: true,
  crate: true,
  stack: true,
  rack: true,
  tank: true,
  console: true,
  pillar: true,
  water: false,
  tree: true,
  laser: true,
  core: true,
  shuttle: true,
  vent: true,
  coolant: true,
  molten: true,
  debris: true,
};

/** The shared ship legend. Pieces can add their own characters. */
export const SHIP_LEGEND: Record<string, Part> = {
  '.': 'floor',
  ' ': 'pit',
  '=': 'catwalk',
  '#': 'wall',
  '|': 'divider',
  c: 'crate',
  C: 'stack',
  S: 'rack',
  T: 'tank',
  K: 'console',
  P: 'pillar',
  '~': 'water',
  H: 'tree',
  L: 'laser',
  o: 'core',
  s: 'shuttle',
  v: 'vent',
  w: 'coolant',
  m: 'molten',
  x: 'debris',
};

export function isSolid(p: Part): boolean {
  return SOLID[p];
}

/** An opening at one end of a piece: where a route crosses it (x from the centre line). */
export interface Port {
  x: number;
}

export type RouteTag = 'main' | 'alt' | 'risky';

/** A way through: [row, x] points from the near end to the far end. */
export interface Route {
  tag: RouteTag;
  points: [number, number][];
  /** Alt and risky routes can carry a reward along them. */
  reward?: 'pickups';
}

/** Things a grid can't show. `at` is the row. */
export type Overlay =
  /** A hook on a chain swinging across between x[0] and x[1]; `arrive` is where it is when you get there. */
  | { at: number; kind: 'hook'; x: [number, number]; arrive: number }
  /** A block sliding across on rails, the same way. */
  | { at: number; kind: 'slider'; x: [number, number]; arrive: number; w: number; h: number; depth: number }
  /** The floor (and everything on it) rises or falls by `rise` over `rows` rows. */
  | { at: number; kind: 'step'; rise: number; rows: number }
  /** A hologram panel facing down the room. */
  | { at: number; kind: 'holo'; x: number; y: number; w: number; h: number }
  /** A thin pour of liquid from the ceiling (scenery). */
  | { at: number; kind: 'drip'; x: number }
  /** Blast doors closing across the room as you come, leaving a gap at x (half-width `half`). */
  | { at: number; kind: 'door'; x: number; half: number }
  /** Wreckage falling from the ceiling to land at x (solid once down). */
  | { at: number; kind: 'debris'; x: number; w: number }
  /** A big fan turning at height y (in a pit, say). */
  | { at: number; kind: 'fan'; x: number; y: number; size: number }
  /** A plume of steam (scenery). */
  | { at: number; kind: 'steam'; x: number; y: number; h: number }
  /** A panel throwing sparks (scenery). */
  | { at: number; kind: 'sparks'; x: number; y: number };

export interface Piece {
  id: string;
  /** The room family: its name, lights, wall dressing and look come from ROOMS[family]. */
  family: RoomId;
  /** Shown on entry ('' = none; undefined = the family's name). */
  name?: string;
  /** Ship levels it can appear at: 0, 1, 2 = levels 7, 8, 9 of a loop (and the loops after). */
  tiers: [number, number];
  weight: number;
  height: number;
  grid: string;
  legend?: Record<string, Part>;
  overlays?: Overlay[];
  routes: Route[];
}

/** A merged solid block: from x0 to x1 across, rows r0 to r1 (inclusive) along. */
export interface Block {
  part: Part;
  x0: number;
  x1: number;
  r0: number;
  r1: number;
}

export interface ParsedRow {
  /** Half-width between the walls. */
  hw: number;
  /** Floor segments (x0, x1), or null when the whole width is floor. */
  floor: [number, number][] | null;
  /** True if the floor here has catwalk edges (railings). */
  catwalk: boolean;
  /** True if there's water under the gaps in the floor. */
  water: boolean;
}

export interface Parsed {
  piece: Piece;
  rows: ParsedRow[];
  blocks: Block[];
  /** Where each route's ends are (the ports). */
  entries: Port[];
  exits: Port[];
}

const cache = new Map<string, Parsed>();

/** Parse (once) a piece's grid into rows, merged blocks and ports. Throws on a malformed grid. */
export function parse(piece: Piece): Parsed {
  const hit = cache.get(piece.id);
  if (hit) return hit;
  const legend = { ...SHIP_LEGEND, ...(piece.legend ?? {}) };
  const lines = piece.grid
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0)
    .map((l) => l.trim());
  const width = Math.max(...lines.map((l) => l.length));
  if (width % 2 === 0) throw new Error(`${piece.id}: grid width ${width} must be odd (a middle column)`);
  const mid = (width - 1) / 2;
  const rows: ParsedRow[] = [];
  // Solid runs per row, then merged down the rows where identical.
  const open: Block[] = [];
  const blocks: Block[] = [];
  lines.forEach((raw, r) => {
    // Centre each line (narrower rows are drawn centred).
    const pad = (width - raw.length) / 2;
    if (pad % 1 !== 0) throw new Error(`${piece.id}: row ${r} can't be centred (width ${raw.length})`);
    const line = ' '.repeat(pad) + raw + ' '.repeat(pad);
    const first = line.indexOf('#');
    const last = line.lastIndexOf('#');
    if (first < 0 || first === last) throw new Error(`${piece.id}: row ${r} needs a wall each side`);
    if (first !== width - 1 - last) throw new Error(`${piece.id}: row ${r} walls aren't symmetric`);
    // Inner faces: the walls' inner edges.
    const hw = mid - first - 0.5;
    const floor: [number, number][] = [];
    let pits = false;
    let catwalk = false;
    let water = false;
    let runStart = -1;
    const runs: Block[] = [];
    let runPart: Part | null = null;
    for (let j = first + 1; j < last; j++) {
      const ch = line[j];
      const part = legend[ch];
      if (!part) throw new Error(`${piece.id}: row ${r} has '${ch}', which isn't in the legend`);
      const x = j - mid;
      const isFloor = part !== 'pit' && part !== 'water';
      if (part === 'catwalk') catwalk = true;
      if (part === 'water') water = true;
      if (!isFloor) pits = true;
      // Floor segments.
      if (isFloor && runStart < 0) runStart = j;
      if (!isFloor && runStart >= 0) {
        floor.push([runStart - mid - 0.5, x - 0.5]);
        runStart = -1;
      }
      // Solid runs.
      const solid = isSolid(part) ? part : null;
      if (solid !== runPart) {
        if (runPart) runs[runs.length - 1].x1 = x - 0.5;
        if (solid) runs.push({ part: solid, x0: x - 0.5, x1: x + 0.5, r0: r, r1: r });
        runPart = solid;
      }
    }
    if (runPart) runs[runs.length - 1].x1 = last - mid - 0.5;
    if (runStart >= 0) floor.push([runStart - mid - 0.5, last - mid - 0.5]);
    rows.push({ hw, floor: pits ? floor : null, catwalk, water });
    // Merge with the block above when it's the same part over the same span.
    for (const run of runs) {
      const above = open.find((b) => b.r1 === r - 1 && b.part === run.part && b.x0 === run.x0 && b.x1 === run.x1);
      if (above) above.r1 = r;
      else open.push(run);
    }
    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].r1 < r) blocks.push(...open.splice(i, 1));
    }
  });
  blocks.push(...open);
  const parsed: Parsed = {
    piece,
    rows,
    blocks,
    entries: piece.routes.map((rt) => ({ x: rt.points[0][1] })),
    exits: piece.routes.map((rt) => ({ x: rt.points[rt.points.length - 1][1] })),
  };
  cache.set(piece.id, parsed);
  return parsed;
}

/** A route's x at (fractional) row r: straight lines between its points. */
export function routeX(route: Route, r: number): number {
  const p = route.points;
  if (r <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (r <= p[i][0]) {
      const [r0, x0] = p[i - 1];
      const [r1, x1] = p[i];
      return x0 + ((x1 - x0) * (r - r0)) / Math.max(1e-6, r1 - r0);
    }
  }
  return p[p.length - 1][1];
}

/** Steepest the safe lane may run sideways, per unit forward, at top speed. */
export function maxRouteSlope(): number {
  const S = CONFIG.steering;
  const top = CONFIG.speed.max;
  const lateral = S.maxLateralSpeed * Math.pow(top / CONFIG.speed.base, S.lateralSpeedExponent);
  return (CONFIG.themes.lane.slopeFraction * lateral) / top;
}

/**
 * Static checks for one piece (used by the tests): every route stays on
 * floor, clear of every solid by the lane margin, within the steering limit,
 * and starts and ends inside the piece. Returns a list of problems ('' = ok).
 */
export function check(piece: Piece): string[] {
  const out: string[] = [];
  const p = parse(piece);
  const last = p.rows.length - 1;
  const slope = maxRouteSlope();
  const margin = LANE + 0.1;
  for (const [k, rt] of piece.routes.entries()) {
    const name = `${piece.id} route ${k} (${rt.tag})`;
    if (rt.points[0][0] !== 0) out.push(`${name} doesn't start on row 0`);
    if (rt.points[rt.points.length - 1][0] !== last) out.push(`${name} doesn't end on the last row (${last})`);
    for (let i = 1; i < rt.points.length; i++) {
      const [r0, x0] = rt.points[i - 1];
      const [r1, x1] = rt.points[i];
      if (r1 <= r0) out.push(`${name}: points must go forward (row ${r1})`);
      else if (Math.abs(x1 - x0) / ((r1 - r0) * STEP) > slope + 1e-6) {
        out.push(`${name}: rows ${r0}-${r1} move sideways too fast (${(Math.abs(x1 - x0) / ((r1 - r0) * STEP)).toFixed(3)} > ${slope.toFixed(3)} per unit)`);
      }
    }
    // Sample every half row: walls, floor and solids.
    for (let r = 0; r <= last; r += 0.5) {
      const x = routeX(rt, r);
      for (const rr of new Set([Math.floor(r), Math.ceil(r)])) {
        const row = p.rows[rr];
        if (Math.abs(x) > row.hw - margin) out.push(`${name}: row ${rr} too close to the wall (x ${x.toFixed(2)}, half-width ${row.hw})`);
        if (row.floor && !row.floor.some(([a, b]) => x - 0.5 >= a && x + 0.5 <= b)) out.push(`${name}: row ${rr} isn't over floor (x ${x.toFixed(2)})`);
        for (const b of p.blocks) {
          if (rr < b.r0 || rr > b.r1 || b.part === 'wall') continue;
          const gap = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : -1;
          if (gap < margin) out.push(`${name}: row ${rr} hits a ${b.part} at ${b.x0}..${b.x1} (x ${x.toFixed(2)})`);
        }
      }
    }
    // Moving parts, where they are when you arrive.
    for (const o of piece.overlays ?? []) {
      if (o.kind === 'door') {
        const x = routeX(rt, o.at);
        if (Math.abs(x - o.x) > o.half - margin) out.push(`${name}: the door at row ${o.at} closes on the route (x ${x.toFixed(2)})`);
        continue;
      }
      if (o.kind === 'debris') {
        for (let r = o.at - 1; r <= o.at + 1; r++) {
          const x = routeX(rt, r);
          if (Math.abs(x - o.x) < margin + o.w / 2) out.push(`${name}: debris at row ${o.at} lands on the route`);
        }
        continue;
      }
      if (o.kind !== 'hook' && o.kind !== 'slider') continue;
      const half = o.kind === 'hook' ? 0.35 : o.w / 2;
      const x = routeX(rt, o.at);
      if (Math.abs(o.arrive - x) < margin + half + 0.45) out.push(`${name}: the ${o.kind} at row ${o.at} arrives on the route`);
    }
  }
  if (!piece.routes.some((r) => r.tag === 'main')) out.push(`${piece.id} has no main route`);
  // Every route starts and ends where the main one does: the lead-in and lead-out
  // around a piece only keep room for one way in and one way out.
  const main = piece.routes.find((r) => r.tag === 'main');
  if (main) {
    for (const [k, rt] of piece.routes.entries()) {
      if (rt.points[0][1] !== main.points[0][1]) out.push(`${piece.id} route ${k} doesn't start where the main route does`);
      if (rt.points[rt.points.length - 1][1] !== main.points[main.points.length - 1][1]) out.push(`${piece.id} route ${k} doesn't end where the main route does`);
    }
  }
  return [...new Set(out)];
}
