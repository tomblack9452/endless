import { CONFIG } from './config';

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
  | 'hangar';

/** Strip light colours (index into the strip colour table). */
export enum Light {
  White = 0,
  Amber = 1,
  Teal = 2,
  Red = 3,
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
}

const R = CONFIG.themes.interior.rooms;
const LANE = CONFIG.themes.lane.halfWidth;

function range(r: readonly number[]): number {
  return r[0] + Math.random() * (r[1] - r[0]);
}

export const ROOMS: Record<RoomId, RoomDef> = {
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
        if (Math.random() > fill || !api.clearOf(x, 0.75)) continue;
        const tiers = 1 + Math.floor(Math.random() * 3);
        api.crate(x, api.d, 1.4, tiers * 0.9);
        if (Math.random() < 0.45) api.crate(x, api.d + 1.45, 1.4, (1 + Math.floor(Math.random() * 2)) * 0.9);
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
      const shift = Math.random() * pitch;
      const len = R.servers.rackLength;
      for (let x = api.cx - api.hw + 0.8 + shift; x < api.cx + api.hw - 0.6; x += pitch) {
        if (!api.clearOf(x, 0.45 + 0.1)) continue;
        api.box(x, 0, api.d, 0.9, api.H - 0.7, len, true, true);
        const colour = Math.random() < 0.7 ? Light.Teal : Light.Amber;
        api.light(x - 0.47, 1.1 + Math.random() * 0.8, api.d, 0.04, 0.06, len * 0.7, colour);
        api.light(x + 0.47, 0.9 + Math.random() * 0.8, api.d, 0.04, 0.06, len * 0.7, colour);
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
      const count = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const x = api.cx + (Math.random() * 2 - 1) * (api.hw - 1);
        if (Math.random() < 0.5) {
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
        const s = Math.random() < 0.5 ? -1 : 1;
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
        offset: Math.random() < 0.4 ? 0 : side,
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
        offset: Math.random() < 0.5 ? wide : narrow,
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
      const count = 1 + (Math.random() < 0.6 ? 1 : 0);
      for (let i = 0; i < count; i++) {
        const w = range(R.islands.width);
        const len = range(R.islands.islandLength);
        const x = api.cx + (Math.random() * 2 - 1) * (api.hw - w / 2 - 0.4);
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
      const shift = Math.random() * pitch;
      for (let x = api.cx - api.hw + 1.2 + shift; x < api.cx + api.hw - 1; x += pitch) {
        if (Math.random() > R.hydroponics.fill || !api.clearOf(x, 0.75)) continue;
        api.crate(x, api.d, 1.5, 0.35); // planter
        api.tree(x, api.d, 0.75 + Math.random() * 0.35);
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
      const gaps = api.sub === 2 && Math.random() < 0.5 ? 2 : 1;
      const extra = api.cx + (Math.random() * 2 - 1) * (api.hw - g - 0.5);
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
        const x = api.cx - api.side * (ch + 2.5 + Math.random() * (api.hw - ch - 3.2));
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
      const count = api.sub === 2 && Math.random() < 0.4 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = 1.6 + Math.random() * 0.6;
        const amp = api.hw - w / 2 - 0.1;
        const dd = api.d + i * 4;
        for (let t = 0; t < 6; t++) {
          const arrive = api.cx + (Math.random() * 2 - 1) * amp;
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
      // Dashed taxi line along the lane.
      if (Math.floor(api.d / 2.2) % 2 === 0) api.light(api.lane, 0.01, api.d, 0.12, 0.01, 1.3, Light.Amber);
      if (!api.due(R.hangar.rowSpacing)) return;
      const pitch = R.hangar.pitch;
      const shift = Math.random() * pitch;
      for (let x = api.cx - api.hw + 2 + shift; x < api.cx + api.hw - 1.8; x += pitch) {
        if (Math.random() > R.hangar.fill || !api.clearOf(x, R.hangar.shuttleHalfWidth)) continue;
        api.shuttle(x, api.d, Math.random() < 0.3);
      }
    },
  },
};

/** Crates scattered in the branches of a split room, off the lane and clear of dividers. */
function branchCrates(api: RoomAPI, scale: number): void {
  const n = api.perRow(scale);
  const tries = Math.ceil(n * 2);
  for (let i = 0; i < tries; i++) {
    if (Math.random() > n / tries) continue;
    const x = api.cx + (Math.random() * 2 - 1) * (api.hw - 0.6);
    if (!api.clearOf(x, 0.55)) continue;
    let nearDivider = false;
    if (api.plan) for (const dv of api.plan.dividers) if (Math.abs(x - (api.cx + dv)) < api.plan.dividerHalf + 0.6) nearDivider = true;
    if (nearDivider) continue;
    api.crate(x, api.d, 1, 0.5 + Math.random() * 0.7);
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

export const ROOM_IDS = Object.keys(ROOMS) as RoomId[];

/** Pick the next room for this level of the theme, avoiding an immediate repeat. */
export function pickRoom(sub: number, last: RoomId): RoomId {
  let total = 0;
  for (const id of ROOM_IDS) total += weight(id, sub, last);
  let r = Math.random() * total;
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
