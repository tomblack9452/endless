import { CONFIG } from './config';
import { rand } from './rng';

// Ship interior: a sequence of reusable rooms joined by short corridors.
//
// Each room is a template: its size, height, lighting colour, how much the
// centre line winds, and a build() that places obstacles row by row through
// the RoomAPI. The world handles the shell (walls, ceiling, floor, lights,
// door frames), the width tapers between rooms and the safe lane. Rooms
// only ever place obstacles where api.clearOf() says the lane is clear, so
// every room is passable by construction.

export type RoomId =
  | 'corridor'
  | 'cargo'
  | 'servers'
  | 'deck'
  | 'shaft'
  | 'junction'
  | 'fork'
  | 'uneven'
  | 'islands'
  | 'chicane'
  | 'hydroponics'
  | 'lasers'
  | 'reactor'
  | 'pistons'
  | 'hangar'
  | 'collapse'
  | 'gantry'
  | 'breach';

/** Strip light colours (index into the strip colour table). */
export enum Light {
  White = 0,
  Amber = 1,
  Teal = 2,
  Red = 3,
  Dark = 4,
  Green = 5,
}

/** Wall dressing colours (index into the decor colour table). */
export enum Decor {
  Steel = 0,
  Copper = 1,
  Teal = 2,
  Red = 3,
  Dark = 4,
  Yellow = 5,
  Panel = 6,
  Green = 7,
}

/** What a room's build() can see and do. One object, reused every row. */
export interface RoomAPI {
  d: number; // row distance
  score: number;
  sub: number; // level within the theme, 0..2
  jitter: number; // allowance for things placed half a row off d
  cx: number; // world x of the room's centre line
  hw: number; // current half-width
  H: number; // current wall height
  lane: number; // world x of the safe lane
  side: number; // -1/1, which side of centre the lane favours in this room
  progress: number; // 0..1 through the room body
  maxSlope: number; // fastest the lane may move sideways per unit forward
  plan: RoomPlan | null; // split layout, already mirrored to this room's side
  memo: number; // free per-room state, reset to 0 at the start of each room
  memoAt: number;
  memo2: number;
  seed: number; // 0..1, fixed for the room: decor choices stay consistent along it
  row: number; // row counter, for repeating patterns
  /** Inner face of the wall on `side` (-1 left, 1 right), world x. */
  wall(side: number): number;
  /** Pipe running along the wall on `side` at height y (centre). */
  pipe(side: number, y: number, r: number, colour: Decor): void;
  /** Pipe along the run at any x (railings, cables). */
  run(x: number, y: number, d: number, r: number, colour: Decor): void;
  /** Flat-coloured box standing at y: panels, ducts, uprights, debris. Never solid. */
  greeble(x: number, y: number, d: number, w: number, h: number, depth: number, colour: Decor): void;
  pit: boolean; // this row has holes in the floor
  ceiling: boolean; // this room has a ceiling
  /** Upright canister at x (world) against a wall, scenery only. */
  canister(x: number, d: number, colour: Decor, size: number): void;
  /** Start a custom floor for this row (anything not covered is a pit). */
  floorBegin(): void;
  /** Add a floor segment from x0 to x1 (world x). */
  floor(x0: number, x1: number): void;
  /** True (and re-armed) when the room's next feature is due. */
  due(spacing: readonly number[]): boolean;
  /** True if something of half-width `half` at x keeps the lane clear. */
  clearOf(x: number, half: number): boolean;
  /** Expected obstacle count this row for the room width, scaled. */
  perRow(scale: number): number;
  crate(x: number, d: number, w: number, h: number): void;
  box(x: number, y: number, d: number, w: number, h: number, depth: number, solid: boolean, scores: boolean): void;
  /** Hull box sliding across the room; `arriveX` is where it is when the ship reaches it. */
  slider(centre: number, amp: number, arriveX: number, d: number, w: number, h: number, depth: number): void;
  light(x: number, y: number, d: number, w: number, h: number, depth: number, colour: Light, solid?: boolean): void;
  shuttle(x: number, d: number, flip: boolean): void;
  /** Blast door across the room at d, closing as you approach to leave a gap at `gapX`. */
  door(d: number, gapX: number, gapHalf: number): void;
  /** Solid debris that falls from the ceiling, landing `landAhead` before you reach it. */
  debris(x: number, d: number, w: number, h: number, depth: number, landAhead: number): void;
  /** Alien tree (trunk collides) for the hydroponics bay. */
  tree(x: number, d: number, size: number): void;
}

/**
 * Split layout, as offsets from the room centre for the + side; the world
 * mirrors it at random. Dividers are drawn by the world; the lane runs down
 * the branch at `offset`.
 */
export interface RoomPlan {
  halfWidth: number;
  dividers: number[];
  dividerHalf: number;
  branches: number[]; // branch centres, for ceiling lights
  offset: number; // lane branch centre
}

export interface RoomDef {
  name: string; // shown as you enter ('' = no label)
  extraWidth(base: number): number; // added to the corridor half-width
  height: number;
  ceiling: boolean;
  windows: boolean; // low wall and window frames instead of full walls
  light: Light;
  wander: number; // how much the centre line winds (0 = straight)
  enclosure: number; // 1 = sealed; lower lets the sky and time of day in
  /** Fixed lane offset from centre for the whole room (e.g. around a core), or null to wander. */
  laneOffset?(base: number): number | null;
  /** Split rooms: divider layout (overrides extraWidth and laneOffset). */
  plan?(base: number): RoomPlan;
  /** Lane offset that changes through the room (chicane), or null to wander. */
  laneTarget?(api: RoomAPI): number | null;
  /** Randomise width and height per room (default true). */
  vary?: boolean;
  build?(api: RoomAPI): void;
  /** Wall dressing, every row (default: corridor pipes and ducts). */
  decor?(api: RoomAPI): void;
  /** Custom floor with pits, body rows only (default: solid floor). */
  floor?(api: RoomAPI): void;
  /** Railings along custom floor edges (gantry) instead of hazard lights. */
  railings?: boolean;
}

const R = CONFIG.themes.interior.rooms;
const LANE = CONFIG.themes.lane.halfWidth;

function range(r: readonly number[]): number {
  return r[0] + rand() * (r[1] - r[0]);
}

export const ROOMS: Record<RoomId, RoomDef> = {
  gantry: null as unknown as RoomDef, // filled in below (defined after the helpers they use)
  breach: null as unknown as RoomDef,
  corridor: {
    name: '',
    extraWidth: () => 0,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.White,
    wander: 1,
    enclosure: 1,
  },

  // Wide hall of crate stacks on a grid: the aisles line up, so the way through reads.
  cargo: {
    name: 'cargo bay',
    extraWidth: () => R.cargo.extraWidth,
    height: R.cargo.height,
    ceiling: true,
    windows: false,
    light: Light.White,
    wander: 0.3,
    enclosure: 1,
    build(api) {
      if (!api.due(R.cargo.rowSpacing)) return;
      const pitch = R.cargo.pitch;
      const fill = Math.min(0.85, R.cargo.fill + api.score / R.cargo.fillRampPoints);
      for (let x = api.cx - api.hw + 1; x < api.cx + api.hw - 0.8; x += pitch) {
        if (rand() > fill || !api.clearOf(x, 0.75)) continue;
        const tiers = 1 + Math.floor(rand() * 3);
        api.crate(x, api.d, 1.4, tiers * 0.9);
        if (rand() < 0.45) api.crate(x, api.d + 1.45, 1.4, (1 + Math.floor(rand() * 2)) * 0.9);
      }
    },
  },

  // Server racks running along the room in columns; each row of racks jogs sideways.
  servers: {
    name: 'server hall',
    extraWidth: () => R.servers.extraWidth,
    height: R.servers.height,
    ceiling: true,
    windows: false,
    light: Light.Teal,
    wander: 0,
    enclosure: 1,
    build(api) {
      if (!api.due(R.servers.rowSpacing)) return;
      const pitch = R.servers.pitch;
      const shift = rand() * pitch;
      const len = R.servers.rackLength;
      for (let x = api.cx - api.hw + 0.8 + shift; x < api.cx + api.hw - 0.6; x += pitch) {
        if (!api.clearOf(x, 0.45 + 0.1)) continue;
        api.box(x, 0, api.d, 0.9, api.H - 0.7, len, true, true);
        const colour = rand() < 0.7 ? Light.Teal : Light.Amber;
        api.light(x - 0.47, 1.1 + rand() * 0.8, api.d, 0.04, 0.06, len * 0.7, colour);
        api.light(x + 0.47, 0.9 + rand() * 0.8, api.d, 0.04, 0.06, len * 0.7, colour);
      }
    },
  },

  // Open to the sky: window frames instead of walls, support pillars and consoles.
  deck: {
    name: 'observation deck',
    extraWidth: () => R.deck.extraWidth,
    height: R.deck.height,
    ceiling: false,
    windows: true,
    light: Light.White,
    wander: 0.6,
    enclosure: R.deck.enclosure,
    build(api) {
      if (!api.due(R.deck.featureSpacing)) return;
      const count = rand() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const x = api.cx + (rand() * 2 - 1) * (api.hw - 1);
        if (rand() < 0.5) {
          if (api.clearOf(x, 0.4)) api.box(x, 0, api.d + i * 3, 0.7, api.H, 0.7, true, true);
        } else if (api.clearOf(x, 0.85)) {
          api.crate(x, api.d + i * 3, 1.6, 0.8); // console
          api.light(x, 0.81, api.d + i * 3, 1.2, 0.02, 0.5, Light.Teal);
        }
      }
    },
  },

  // Tight, low and winding with pipes and red lights on the walls. No obstacles: the walls are enough.
  shaft: {
    name: 'maintenance shaft',
    extraWidth: (base) => Math.max(R.shaft.minHalfWidth - base, R.shaft.extraWidth),
    height: R.shaft.height,
    ceiling: true,
    windows: false,
    light: Light.Red,
    wander: 1,
    enclosure: 1,
    build(api) {
      for (const s of [-1, 1]) {
        api.box(api.cx + s * (api.hw + 0.05), 0.5 + (s > 0 ? 0.3 : 0), api.d, 0.2, 0.2, 2.4, false, false);
        api.box(api.cx + s * (api.hw + 0.05), 1.5, api.d, 0.14, 0.14, 2.4, false, false);
      }
      if (api.due(R.shaft.lightSpacing)) {
        const s = rand() < 0.5 ? -1 : 1;
        api.light(api.cx + s * (api.hw - 0.02), 1.9, api.d, 0.06, 0.18, 0.35, Light.Red);
      }
    },
  },

  // Two branches around a divider; the lane takes one, the other has crates.
  junction: {
    name: 'junction',
    extraWidth: () => 0,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.White,
    wander: 0,
    enclosure: 1,
    plan(base) {
      const dh = R.junction.dividerHalf;
      const b = base;
      return { halfWidth: 2 * b + dh, dividers: [0], dividerHalf: dh, branches: [-(b + dh), b + dh], offset: b + dh };
    },
    build: (api) => branchCrates(api, R.junction.crates),
  },

  // Three branches; the lane takes any one of them.
  fork: {
    name: 'three-way fork',
    extraWidth: () => 0,
    height: R.fork.height,
    ceiling: true,
    windows: false,
    light: Light.Teal,
    wander: 0,
    enclosure: 1,
    plan(base) {
      const dh = R.fork.dividerHalf;
      const b = base * R.fork.branchScale;
      const side = 2 * b + 2 * dh;
      return {
        halfWidth: 3 * b + 2 * dh,
        dividers: [-(b + dh), b + dh],
        dividerHalf: dh,
        branches: [-side, 0, side],
        offset: rand() < 0.4 ? 0 : side,
      };
    },
    build: (api) => branchCrates(api, R.fork.crates),
  },

  // A tight, clean branch beside a wide one full of crates. Either can be the way.
  uneven: {
    name: 'split',
    extraWidth: () => 0,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.Amber,
    wander: 0,
    enclosure: 1,
    plan(base) {
      const dh = R.uneven.dividerHalf;
      const n = LANE + R.uneven.narrowExtra; // narrow branch half-width
      const w = base + R.uneven.wideExtra; // wide branch half-width
      const wide = -(dh + n);
      const narrow = w + dh;
      return {
        halfWidth: w + dh + n,
        dividers: [w - n],
        dividerHalf: dh,
        branches: [wide, narrow],
        offset: rand() < 0.5 ? wide : narrow,
      };
    },
    build: (api) => branchCrates(api, R.uneven.crates),
  },

  // Wall islands scattered across a wide hall: routes split and rejoin.
  islands: {
    name: 'bulkhead maze',
    extraWidth: () => R.islands.extraWidth,
    height: R.islands.height,
    ceiling: true,
    windows: false,
    light: Light.White,
    wander: 0.3,
    enclosure: 1,
    build(api) {
      if (!api.due(R.islands.spacing)) return;
      const count = 1 + (rand() < 0.6 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const w = range(R.islands.width);
        const len = range(R.islands.islandLength);
        const x = api.cx + (rand() * 2 - 1) * (api.hw - w / 2 - 0.4);
        // The island runs `len` ahead; the lane may drift that far, so clear it generously.
        if (!api.clearOf(x, w / 2 + api.maxSlope * len + 0.2)) continue;
        api.box(x, 0, api.d + len / 2, w, api.H, len, true, true);
        api.light(x, api.H - 0.4, api.d + len / 2, w + 0.04, 0.1, len * 0.9, Light.Amber);
      }
    },
  },

  // Baffle walls from alternating sides: a slalom. The lane swings side to side.
  chicane: {
    name: 'chicane',
    extraWidth: () => R.chicane.extraWidth,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.Red,
    wander: 0,
    enclosure: 1,
    laneTarget(api) {
      if (api.memo === 0) return null; // first segment: wander until the first swing
      return api.memo * (api.hw - LANE - 0.6) * R.chicane.swing;
    },
    build(api) {
      const swing = (api.hw - LANE - 0.6) * R.chicane.swing;
      const seg = Math.max(R.chicane.segment, (2 * swing) / (api.maxSlope * 0.8));
      if (api.d >= api.memoAt) {
        api.memo = api.memo > 0 ? -1 : 1;
        api.memoAt = api.d + seg;
        // A baffle from the far wall up to the lane's gap, half a segment
        // later when the lane has crossed over.
        api.memo2 = api.d + seg * 0.55;
      }
      if (api.memo2 > 0 && api.d >= api.memo2) {
        api.memo2 = 0;
        const from = -api.memo; // baffle comes from the side the lane is leaving
        const wall = api.cx + from * api.hw;
        const edge = api.lane + from * (LANE + 0.35 + api.jitter);
        const w = (wall - edge) * from; // > 0 only if the wall is further out than the gap edge
        if (w > 0.4) {
          api.box((wall + edge) / 2, 0, api.d, w, api.H, 0.8, true, true);
          api.light((wall + edge) / 2, 0.01, api.d - 0.6, w, 0.01, 0.2, Light.Red);
        }
      }
    },
  },

  // Hydroponics: alien trees in planter rows, lit green-teal, with a high ceiling.
  hydroponics: {
    name: 'hydroponics',
    extraWidth: () => R.hydroponics.extraWidth,
    height: R.hydroponics.height,
    ceiling: true,
    windows: false,
    light: Light.Teal,
    wander: 0.5,
    enclosure: 1,
    build(api) {
      if (!api.due(R.hydroponics.rowSpacing)) return;
      const pitch = R.hydroponics.pitch;
      const shift = rand() * pitch;
      for (let x = api.cx - api.hw + 1.2 + shift; x < api.cx + api.hw - 1; x += pitch) {
        if (rand() > R.hydroponics.fill || !api.clearOf(x, 0.75)) continue;
        api.crate(x, api.d, 1.5, 0.35); // planter
        api.tree(x, api.d, 0.75 + rand() * 0.35);
      }
    },
  },
  // Security fences: bright beams across the floor between posts, with a gap at the lane.
  lasers: {
    name: 'laser gates',
    extraWidth: () => R.lasers.extraWidth,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.Amber,
    wander: 0.4,
    enclosure: 1,
    build(api) {
      if (!api.due(R.lasers.gateSpacing)) return;
      const g = R.lasers.gapWidth / 2 + api.jitter;
      const gaps = api.sub === 2 && rand() < 0.5 ? 2 : 1;
      const extra = api.cx + (rand() * 2 - 1) * (api.hw - g - 0.5);
      const left = api.cx - api.hw;
      const right = api.cx + api.hw;
      // Cut the beam line at the gap(s) and draw the remaining spans with posts at each end.
      const cuts = gaps === 2 ? [api.lane, extra].sort((a, b) => a - b) : [api.lane];
      let from = left;
      for (const c of cuts) {
        if (c - g > from) beam(api, from, c - g);
        from = Math.max(from, c + g);
      }
      if (right > from) beam(api, from, right);
    },
  },

  // A big chamber around a reactor core with light rings. The lane passes on one side.
  reactor: {
    name: 'reactor',
    extraWidth: () => R.reactor.extraWidth,
    height: R.reactor.height,
    ceiling: true,
    windows: false,
    light: Light.Teal,
    wander: 0,
    enclosure: 1,
    laneOffset: () => R.reactor.coreHalf + LANE + 1.2,
    build(api) {
      const ch = R.reactor.coreHalf;
      if (api.progress > 0.15 && api.progress < 0.85) {
        api.box(api.cx, 0, api.d, ch * 2, api.H - 0.4, 2.32, true, false);
        if (Math.floor(api.d / 2.2) % 2 === 0) api.light(api.cx, 1.2, api.d, ch * 2 + 0.06, 0.16, 0.4, Light.Teal);
      }
      // Pylons on the far side from the lane.
      if (api.due(R.reactor.pylonSpacing)) {
        const x = api.cx - api.side * (ch + 2.5 + rand() * (api.hw - ch - 3.2));
        if (api.clearOf(x, 0.5)) api.box(x, 0, api.d, 0.8, api.H, 0.8, true, true);
      }
    },
  },

  // Blocks sliding across on floor rails. Where each one is when you arrive is chosen off the lane.
  pistons: {
    name: 'piston hall',
    extraWidth: () => R.pistons.extraWidth,
    height: CONFIG.themes.interior.wallHeight,
    ceiling: true,
    windows: false,
    light: Light.Amber,
    wander: 0,
    enclosure: 1,
    build(api) {
      if (!api.due(R.pistons.spacing)) return;
      const count = api.sub === 2 && rand() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = 1.6 + rand() * 0.6;
        const amp = api.hw - w / 2 - 0.1;
        const dd = api.d + i * 4;
        for (let t = 0; t < 6; t++) {
          const arrive = api.cx + (rand() * 2 - 1) * amp;
          // Extra margin covers the little it moves while level with the ship.
          if (!api.clearOf(arrive, w / 2 + R.pistons.motionMargin)) continue;
          api.slider(api.cx, amp, arrive, dd, w, 1.6, 1.2);
          api.light(api.cx, 0.01, dd - 0.75, api.hw * 2, 0.02, 0.1, Light.Amber);
          api.light(api.cx, 0.01, dd + 0.75, api.hw * 2, 0.02, 0.1, Light.Amber);
          break;
        }
      }
    },
  },

  // Huge, tall hangar with rows of parked shuttles and a painted taxi line.
  hangar: {
    name: 'hangar',
    extraWidth: () => R.hangar.extraWidth,
    height: R.hangar.height,
    ceiling: true,
    windows: false,
    light: Light.White,
    wander: 0.2,
    enclosure: 1,
    build(api) {
      // Set piece: blast doors near the end close down to the lane as you arrive.
      if (api.progress > R.hangar.doorAt && api.memo2 === 0) {
        api.memo2 = 1;
        api.door(api.d, api.lane, LANE + R.hangar.doorGap);
        return;
      }
      // Dashed taxi line along the lane.
      if (Math.floor(api.d / 2.2) % 2 === 0) api.light(api.lane, 0.01, api.d, 0.12, 0.01, 1.3, Light.Amber);
      if (!api.due(R.hangar.rowSpacing)) return;
      const pitch = R.hangar.pitch;
      const shift = rand() * pitch;
      for (let x = api.cx - api.hw + 2 + shift; x < api.cx + api.hw - 1.8; x += pitch) {
        if (rand() > R.hangar.fill || !api.clearOf(x, R.hangar.shuttleHalfWidth)) continue;
        api.shuttle(x, api.d, rand() < 0.3);
      }
    },
  },

  // Set piece: the reactor is coming apart. Debris crashes down off the lane as
  // you approach and the core lights run red. The lane stays clear throughout.
  collapse: {
    name: 'reactor collapse',
    extraWidth: () => R.collapse.extraWidth,
    height: R.reactor.height,
    ceiling: true,
    windows: false,
    light: Light.Red,
    wander: 0,
    enclosure: 1,
    laneOffset: () => R.reactor.coreHalf + LANE + 1.2,
    build(api) {
      const ch = R.reactor.coreHalf;
      if (api.progress > 0.12 && api.progress < 0.88) {
        api.box(api.cx, 0, api.d, ch * 2, api.H - 0.4, 2.32, true, false);
        if (Math.floor(api.d / 2.2) % 2 === 0) api.light(api.cx, 1.2, api.d, ch * 2 + 0.06, 0.16, 0.4, Light.Red);
      }
      if (!api.due(R.collapse.spacing)) return;
      // A chunk or two, anywhere clear of the lane (including the lane's side of the core).
      const n = api.sub === 2 && rand() < 0.5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        for (let t = 0; t < 6; t++) {
          const w = 0.9 + rand() * 1.1;
          const x = api.cx + (rand() * 2 - 1) * (api.hw - w / 2 - 0.2);
          if (Math.abs(x - api.cx) < ch + w / 2 || !api.clearOf(x, w / 2)) continue;
          api.debris(x, api.d + i * 3, w, 0.6 + rand() * 0.8, 0.9 + rand() * 0.8, R.collapse.landAhead[0] + rand() * (R.collapse.landAhead[1] - R.collapse.landAhead[0]));
          break;
        }
      }
    },
  },
};

/** Crates scattered in the branches of a split room, off the lane and clear of dividers. */
function branchCrates(api: RoomAPI, scale: number): void {
  const n = api.perRow(scale);
  const tries = Math.ceil(n * 2);
  for (let i = 0; i < tries; i++) {
    if (rand() > n / tries) continue;
    const x = api.cx + (rand() * 2 - 1) * (api.hw - 0.6);
    if (!api.clearOf(x, 0.55)) continue;
    let nearDivider = false;
    if (api.plan) for (const dv of api.plan.dividers) if (Math.abs(x - (api.cx + dv)) < api.plan.dividerHalf + 0.6) nearDivider = true;
    if (nearDivider) continue;
    api.crate(x, api.d, 1, 0.5 + rand() * 0.7);
  }
}

// --- pit rooms ---------------------------------------------------------------

/** Maintenance gantry: the floor drops away; railed catwalks, one always on the lane. */
const gantry: RoomDef = {
  name: 'maintenance gantry',
  extraWidth: () => R.gantry.extraWidth,
  height: R.gantry.height,
  ceiling: true,
  windows: false,
  light: Light.Amber,
  wander: 0.5,
  enclosure: 1,
  railings: true,
  floor(api) {
    const ch = R.gantry.catwalkHalf;
    api.floorBegin();
    api.floor(api.lane - ch, api.lane + ch);
    // Side walkway: runs parallel for a while, joined to the main one by bridges at both ends.
    if (api.memoAt <= api.d && api.due(R.gantry.sideWalks)) {
      const room = api.hw - 1.4;
      const off = (rand() < 0.5 ? -1 : 1) * (ch * 2 + 1 + rand() * Math.max(0, room - ch * 2 - 1.5));
      api.memo = Math.max(-room, Math.min(room, api.lane - api.cx + off)); // offset from cx
      api.memoAt = api.d + range(R.gantry.sideLength);
      api.memo2 = api.d; // start, for the first bridge
    }
    if (api.memoAt > api.d) {
      const x = api.cx + api.memo;
      api.floor(x - 1, x + 1);
      // Bridges at the two ends.
      if (api.d - api.memo2 < 2.3 || api.memoAt - api.d < 2.3) api.floor(Math.min(x, api.lane), Math.max(x, api.lane));
    }
  },
  decor(api) {
    corridorDecor(api);
  },
};

/** Hull breach: damaged deck with holes torn in the floor, sparks and broken pipes. */
const breach: RoomDef = {
  name: 'hull breach',
  extraWidth: () => R.breach.extraWidth,
  height: R.breach.height,
  ceiling: true,
  windows: false,
  light: Light.Red,
  wander: 0.6,
  enclosure: 1,
  floor(api) {
    wallHoles(api, R.breach.holeSpacing, R.breach.holeLength, R.breach.bothChance);
    // Sparks where the floor tore.
    if (rand() < 0.15) {
      const s = rand() < 0.5 ? -1 : 1;
      api.light(api.wall(s) - s * 0.3, 0.1 + rand() * 0.4, api.d, 0.05, 0.05, 0.05, rand() < 0.5 ? Light.Amber : Light.Red);
    }
  },  decor(api) {
    corridorDecor(api);
    // Broken pipe ends and debris against the walls.
    if (api.row % 5 === 0) {
      const s = h(api, api.row) < 0.5 ? -1 : 1;
      api.greeble(api.wall(s) - s * 0.5, 0, api.d, 0.6 + h(api, api.row + 1) * 0.6, 0.2 + h(api, api.row + 2) * 0.4, 0.8, Decor.Dark);
    }
  },
};

/**
 * Big holes in the floor flush against the walls (left, right or both),
 * reaching in as far as the safe lane allows, and following the walls' curve.
 * Each row the hole edge is placed from the lane at that row, so the lane
 * always keeps floor under it.
 */
function wallHoles(api: RoomAPI, spacing: readonly number[], length: readonly number[], bothChance: number, chance = 1): void {
  if (api.memoAt <= api.d) {
    if (!api.due(spacing) || rand() > chance) return;
    const r = rand();
    api.memo = r < bothChance ? 3 : r < bothChance + (1 - bothChance) / 2 ? 1 : 2; // 1 left, 2 right, 3 both
    api.memoAt = api.d + range(length);
  }
  if (api.memoAt <= api.d) return;
  const clear = LANE + api.jitter + 0.25;
  const left = api.wall(-1);
  const right = api.wall(1);
  const edgeL = api.memo !== 2 ? api.lane - clear : left;
  const edgeR = api.memo !== 1 ? api.lane + clear : right;
  const holeL = edgeL - left > 0.9;
  const holeR = right - edgeR > 0.9;
  if (!holeL && !holeR) return;
  api.floorBegin();
  api.floor(holeL ? edgeL : left, holeR ? edgeR : right);
}
// --- wall dressing (the asset pack) ---------------------------------------------

/** Seeded 0..1 per room, so a pipe run keeps its height and colour along the room. */
function h(api: RoomAPI, n: number): number {
  const v = Math.sin((api.seed * 1000 + n) * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}

const PIPE_COLOURS = [Decor.Steel, Decor.Copper, Decor.Teal, Decor.Red, Decor.Steel];

/** Corridors: pipe runs, ceiling ducts, wall ribs and small lights. */
function corridorDecor(api: RoomAPI, runs = 1 + Math.floor(h(api, 1) * 3)): void {
  for (const s of [-1, 1]) {
    for (let i = 0; i < runs; i++) {
      const k = i * 7 + (s > 0 ? 3 : 0);
      api.pipe(s, 0.45 + h(api, 10 + k) * 2.1, 0.06 + h(api, 20 + k) * 0.14, PIPE_COLOURS[Math.floor(h(api, 30 + k) * 5)]);
    }
    if (h(api, 40) > 0.35) api.greeble(api.wall(s) - s * 0.35, api.H - 0.55, api.d, 0.7, 0.5, 2.32, Decor.Panel);
    if (api.row % 4 === 0) api.greeble(api.wall(s) - s * 0.1, 0, api.d, 0.2, api.H, 0.25, Decor.Dark);
    if (api.row % 8 === (s > 0 ? 4 : 0)) api.light(api.wall(s) - s * 0.03, 2.2, api.d, 0.05, 0.12, 0.6, Light.White);
    // Now and then a control panel: a dark box with a lit screen.
    if (api.row % 11 === (s > 0 ? 3 : 8) && h(api, 50 + api.row) > 0.4) {
      api.greeble(api.wall(s) - s * 0.15, 0.7, api.d, 0.3, 0.9, 1.2, Decor.Panel);
      api.light(api.wall(s) - s * 0.31, 1.15, api.d, 0.02, 0.32, 0.8, h(api, 60 + api.row) < 0.5 ? Light.Teal : Light.Amber);
    }
  }
}

/** Server hall: computers covering the walls, indicator lights, cable bundles and trays. */
function serversDecor(api: RoomAPI): void {
  const colours = [Light.Teal, Light.Amber, Light.White, Light.Green];
  for (const s of [-1, 1]) {
    api.greeble(api.wall(s) - s * 0.1, 0.45, api.d, 0.2, api.H - 1.1, 2.32, Decor.Dark);
    for (let k = 0; k < 5; k++) {
      if (rand() > 0.55) continue;
      api.light(api.wall(s) - s * 0.21, 0.7 + k * 0.42, api.d + (rand() - 0.5) * 1.8, 0.03, 0.05, 0.12, colours[Math.floor(rand() * 4)]);
    }
    api.pipe(s, 0.22, 0.05, Decor.Dark);
    api.pipe(s, 0.32, 0.04, Decor.Dark);
    api.greeble(api.wall(s) - s * 0.5, api.H - 0.35, api.d, 1, 0.12, 2.32, Decor.Dark);
  }
}

/** Cargo bay: hazard stripes along the base, shelving uprights, one high pipe run. */
function cargoDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.greeble(api.wall(s) - s * 0.06, 0, api.d, 0.12, 0.45, 2.32, api.row % 2 ? Decor.Yellow : Decor.Dark);
    if (api.row % 3 === 0) api.greeble(api.wall(s) - s * 0.15, 0, api.d, 0.3, api.H, 0.3, Decor.Panel);
    api.pipe(s, api.H - 0.6, 0.12, Decor.Steel);
  }
}

/** Reactor: huge coolant pipes and ribs. */
function reactorDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, 1.1, 0.45, Decor.Teal);
    api.pipe(s, 2.5, 0.3, Decor.Teal);
    api.pipe(s, 3.6, 0.15, Decor.Steel);
    if (api.row % 3 === 0) api.greeble(api.wall(s) - s * 0.5, 0, api.d, 1, api.H, 0.35, Decor.Panel);
  }
}

/** Piston hall: hydraulic lines, hazard stripes, red lights. */
function pistonsDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, 0.55, 0.09, Decor.Yellow);
    api.pipe(s, 0.75, 0.09, Decor.Yellow);
    api.greeble(api.wall(s) - s * 0.06, 0, api.d, 0.12, 0.35, 2.32, api.row % 2 ? Decor.Yellow : Decor.Dark);
    if (api.row % 6 === 0) api.light(api.wall(s) - s * 0.03, 2.4, api.d, 0.05, 0.15, 0.4, Light.Red);
  }
}

/** Hangar: tall uprights, a high walkway with a rail. */
function hangarDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    if (api.row % 5 === 0) api.greeble(api.wall(s) - s * 0.3, 0, api.d, 0.6, api.H, 0.6, Decor.Panel);
    api.greeble(api.wall(s) - s * 0.6, api.H - 1.8, api.d, 1.2, 0.12, 2.32, Decor.Dark);
    api.run(api.wall(s) - s * 1.15, api.H - 0.9, api.d, 0.04, Decor.Steel);
  }
}

/** Hydroponics: irrigation pipes and grow lights. */
function hydroponicsDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, 0.4, 0.08, Decor.Teal);
    api.pipe(s, 1.2, 0.05, Decor.Green);
    api.light(api.wall(s) - s * 0.05, api.H - 1, api.d, 0.06, 0.06, 1.8, Light.Green);
    if (api.row % 4 === 0) api.greeble(api.wall(s) - s * 0.4, 0, api.d, 0.8, 0.6, 1.6, Decor.Green);
  }
}

/** Laser gates: emitter panels on the walls. */
function lasersDecor(api: RoomAPI): void {
  corridorDecor(api, 1);
  if (api.row % 6 === 0) {
    for (const s of [-1, 1]) {
      api.greeble(api.wall(s) - s * 0.12, 0.15, api.d, 0.24, 0.8, 0.6, Decor.Dark);
      api.light(api.wall(s) - s * 0.25, 0.5, api.d, 0.02, 0.1, 0.3, Light.Red);
    }
  }
}

/** Observation deck: a railing along the low wall. */
function deckDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) api.run(api.wall(s) - s * 0.08, 0.95, api.d, 0.04, Decor.Steel);
}

export function decorate(id: RoomId, api: RoomAPI): void {
  const def = ROOMS[id];
  if (def.decor) def.decor(api);
  else corridorDecor(api);
  if (id !== 'deck') ambientProps(api);
}

const CANISTER_COLOURS = [Decor.Yellow, Decor.Red, Decor.Steel, Decor.Teal, Decor.Yellow];

/**
 * Props every room shares on top of its own dressing: ceiling cross-beams,
 * canister clusters, hanging cables, wall vents, big wall screens.
 * Everything stays against the walls or overhead, clear of the path.
 */
function ambientProps(api: RoomAPI): void {
  const r = api.row;
  if (api.ceiling && r % 6 === 0) {
    api.greeble(api.cx, api.H - 0.45, api.d, api.hw * 2, 0.4, 0.35, Decor.Panel);
    if (h(api, r) < 0.4) api.light(api.cx, api.H - 0.47, api.d, 0.9, 0.03, 0.2, Light.White);
  }
  const s = h(api, r + 0.5) < 0.5 ? -1 : 1;
  // Canisters huddled against a wall (not where the floor's gone).
  if (!api.pit && r % 9 === 3 && h(api, r + 1) > 0.45) {
    const n = 2 + Math.floor(h(api, r + 2) * 3);
    for (let k = 0; k < n; k++) {
      // One row tight against the wall, so the path never runs through them.
      const x = api.wall(s) - s * 0.38;
      api.canister(x, api.d + (k - n / 2) * 0.72, CANISTER_COLOURS[Math.floor(h(api, r + 3 + k) * 5)], 0.8 + h(api, r + 9 + k) * 0.15);
    }
  }
  // Cables hanging from the ceiling near a wall.
  if (api.ceiling && r % 7 === 2 && h(api, r + 4) > 0.5) {
    const len = 0.6 + h(api, r + 5) * 0.8;
    api.greeble(api.wall(-s) + s * (0.5 + h(api, r + 6) * 0.6), api.H - len, api.d, 0.05, len, 0.05, Decor.Dark);
    api.greeble(api.wall(-s) + s * (0.62 + h(api, r + 6) * 0.6), api.H - len * 0.7, api.d + 0.3, 0.04, len * 0.7, 0.04, Decor.Dark);
  }
  // Wall vent: dark slats.
  if (r % 10 === 5) {
    for (let k = 0; k < 4; k++) api.greeble(api.wall(s) - s * 0.05, 0.35 + k * 0.16, api.d, 0.1, 0.08, 1.2, k % 2 ? Decor.Panel : Decor.Dark);
  }
  // Big wall screen in a frame.
  if (r % 13 === 6 && api.H > 3.5 && h(api, r + 7) > 0.45) {
    api.greeble(api.wall(-s) + s * 0.06, 1.3, api.d, 0.12, 1.3, 2, Decor.Panel);
    api.light(api.wall(-s) + s * 0.13, 1.42, api.d, 0.02, 1.06, 1.7, h(api, r + 8) < 0.6 ? Light.Teal : Light.White);
  }
}
function beam(api: RoomAPI, from: number, to: number): void {
  const w = to - from;
  const mid = (from + to) / 2;
  api.light(mid, 0.28, api.d, w, 0.07, 0.12, Light.Amber, true);
  api.light(mid, 0.62, api.d, w, 0.05, 0.1, Light.Amber, true);
  api.box(from + 0.12, 0, api.d, 0.24, 1.1, 0.3, true, true);
  api.box(to - 0.12, 0, api.d, 0.24, 1.1, 0.3, true, true);
}

ROOMS.gantry = gantry;
ROOMS.corridor.floor = (api) => {
  const ch = R.corridorHoles;
  if (api.sub >= ch.minSub) wallHoles(api, ch.spacing, ch.length, ch.bothChance, ch.chance);
};
ROOMS.breach = breach;
ROOMS.servers.decor = serversDecor;
ROOMS.cargo.decor = cargoDecor;
ROOMS.reactor.decor = reactorDecor;
ROOMS.pistons.decor = pistonsDecor;
ROOMS.hangar.decor = hangarDecor;
ROOMS.hydroponics.decor = hydroponicsDecor;
ROOMS.lasers.decor = lasersDecor;
ROOMS.deck.decor = deckDecor;
ROOMS.shaft.decor = (api) => corridorDecor(api, 5);

export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];

/** Pick the next room for this level of the theme, avoiding an immediate repeat. */
export function pickRoom(sub: number, last: RoomId): RoomId {
  let total = 0;
  for (const id of ROOM_IDS) total += weight(id, sub, last);
  let r = rand() * total;
  for (const id of ROOM_IDS) {
    r -= weight(id, sub, last);
    if (r <= 0) return id;
  }
  return 'cargo';
}

function weight(id: RoomId, sub: number, last: RoomId): number {
  if (id === 'corridor' || id === last) return 0;
  const cfg = R[id];
  return sub >= cfg.minSub ? cfg.weight : 0;
}

export function roomLength(id: RoomId): number {
  return id === 'corridor' ? range(CONFIG.themes.interior.connectorLength) : range(R[id].length);
}
