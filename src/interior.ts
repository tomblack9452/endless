import { CONFIG } from './config';
import { Liquid } from './fx';
import { rand } from './rng';

// Ship interior: room families and their looks, joined by short corridors.
//
// What's in a room comes from the hand-made pieces (src/pieces/): each family
// has a few, drawn as grids with fixed routes. A family here gives the rest:
// its name, lighting colour, height, whether it has a ceiling or windows, and
// its wall dressing (decor), plus the RoomAPI the world hands to pieces and
// decor to place things with. Plain corridors between rooms are built here too.

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
  | 'coolant'
  | 'vents'
  | 'foundry'
  | 'gantry'
  | 'breach'
  | 'dropShaft'
  | 'cargoLift'
  | 'flooded'
  | 'command'
  | 'fanRoom'
  | 'lab';

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
  Wood = 8,
  WoodDark = 9,
  Rope = 10,
  Glass = 11,
  Cliff = 12,
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
  start: number; // where the room begins and ends (distances)
  end: number;
  taper: number; // length of the room's tapers at each end
  stage: number; // free per-room counter for set pieces (0 at the start of each room)
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
  /** Liquid falling from the ceiling, `width` across (x), floor to ceiling. Solid ones are curtains. */
  pour(x: number, d: number, width: number, liquid: Liquid, solid: boolean): void;
  /** A pool of liquid on the floor (scenery). */
  pool(x: number, d: number, r: number, liquid: Liquid): void;
  /** A plume of steam rising from y (scenery). */
  steam(x: number, y: number, d: number, height: number): void;
  /** A small light that blinks at its own rate. */
  blinker(x: number, y: number, d: number, w: number, h: number, colour: Light): void;
  /** A hologram panel facing down the room. */
  holo(x: number, y: number, d: number, w: number, h: number): void;
  /** A spinning ceiling fan. */
  fan(x: number, d: number, size: number): void;
  /** A big fan turning at height y (down in a fan pit, say). */
  bigFan(x: number, y: number, d: number, size: number): void;
  /** Ease the floor (and everything on it) by `delta` between distances a and b. */
  step(a: number, b: number, delta: number): void;
  /** Water across the room at this row, `width` wide around x, its surface at y. */
  water(x: number, y: number, d: number, width: number): void;
  /** A glass tank of bubbling liquid (solid). */
  tank(x: number, d: number, r: number, h: number): void;
  /** A hook on a chain from the ceiling, swinging across; `arriveX` is where it is when the ship gets there. */
  hook(centre: number, amp: number, arriveX: number, d: number): void;
  /** An engine piston pumping up and down at x (scenery). */
  piston(x: number, d: number, top: number): void;
  /** Steam vent in the floor (a hazard). Vents on the lane are always down as you arrive. */
  vent(x: number, d: number, half: number, period: number): void;
  /** A panel that throws sparks. */
  sparks(x: number, y: number, d: number): void;
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
  /** The room makes its own ramps and drops (no random ones in it). */
  ownSteps?: boolean;
}

const R = CONFIG.themes.interior.rooms;

function range(r: readonly number[]): number {
  return r[0] + rand() * (r[1] - r[0]);
}

export const ROOMS: Record<RoomId, RoomDef> = {
  gantry: null as unknown as RoomDef, // filled in below (defined after the helpers they use)
  breach: null as unknown as RoomDef,
  dropShaft: null as unknown as RoomDef,
  cargoLift: null as unknown as RoomDef,
  flooded: null as unknown as RoomDef,
  command: null as unknown as RoomDef,
  fanRoom: null as unknown as RoomDef,
  lab: null as unknown as RoomDef,
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
  },

  // Coolant plant: curtains of coolant falling across the room, one gap on the lane.
  coolant: {
    name: 'coolant plant',
    extraWidth: () => R.coolant.extraWidth,
    height: R.coolant.height,
    ceiling: true,
    windows: false,
    light: Light.Teal,
    wander: 0.4,
    enclosure: 1,
  },

  // Steam vents: rows of floor vents firing on a rhythm. The lane's are always
  // down when you get there; read the rhythm to cut across the others.
  vents: {
    name: 'steam vents',
    extraWidth: () => R.vents.extraWidth,
    height: R.vents.height,
    ceiling: true,
    windows: false,
    light: Light.Amber,
    wander: 0.6,
    enclosure: 1,
  },

  // Foundry: molten metal pouring into troughs, curtains of it across the floor, sparks.
  foundry: {
    name: 'foundry',
    extraWidth: () => R.foundry.extraWidth,
    height: R.foundry.height,
    ceiling: true,
    windows: false,
    light: Light.Amber,
    wander: 0.4,
    enclosure: 1,
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
  },
};

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
  decor(api) {
    corridorDecor(api);
    // Broken pipe ends and debris against the walls.
    if (api.row % 5 === 0) {
      const s = h(api, api.row) < 0.5 ? -1 : 1;
      api.greeble(api.wall(s) - s * 0.5, 0, api.d, 0.6 + h(api, api.row + 1) * 0.6, 0.2 + h(api, api.row + 2) * 0.4, 0.8, Decor.Dark);
    }
  },
};

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
      for (let k = 0; k < 3; k++) api.blinker(api.wall(s) - s * 0.32, 0.85 + k * 0.1, api.d + 0.3, 0.05, 0.04, [Light.Red, Light.Green, Light.Amber][k]);
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
      api.blinker(api.wall(s) - s * 0.21, 0.7 + k * 0.42, api.d + (rand() - 0.5) * 1.8, 0.04, 0.05, colours[Math.floor(rand() * 4)]);
    }
    api.pipe(s, 0.22, 0.05, Decor.Dark);
    api.pipe(s, 0.32, 0.04, Decor.Dark);
    api.greeble(api.wall(s) - s * 0.5, api.H - 0.35, api.d, 1, 0.12, 2.32, Decor.Dark);
    // Holograms of data floating in front of the racks.
    if (api.row % 9 === (s > 0 ? 2 : 6)) api.holo(api.wall(s) - s * 0.9, 1.0, api.d, 0.9, 1.2);
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
    if (api.row % 12 === (s > 0 ? 3 : 9)) {
      api.pour(api.wall(s) - s * 1.2, api.d, 0.45, Liquid.Coolant, false);
      api.pool(api.wall(s) - s * 1.2, api.d, 0.9, Liquid.Coolant);
    }
  }
}

/** Coolant plant: big teal pipes, pools along the walls, pours feeding them, blinking gauges. */
function coolantDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, 0.9, 0.35, Decor.Teal);
    api.pipe(s, 2.3, 0.2, Decor.Steel);
    if (api.row % 7 === (s > 0 ? 2 : 5)) {
      api.pour(api.wall(s) - s * 1.0, api.d, 0.5, Liquid.Coolant, false);
      api.pool(api.wall(s) - s * 1.0, api.d, 1.0, Liquid.Coolant);
    }
    if (api.row % 5 === 0) api.blinker(api.wall(s) - s * 0.12, 1.6, api.d, 0.06, 0.06, Light.Teal);
    if (api.row % 11 === 6) api.steam(api.wall(s) - s * 0.5, 2.3, api.d, 1.4);
  }
}

/** Steam vents: low pipes that leak steam, hazard stripes, amber warning lights. */
function ventsDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, 0.4, 0.14, Decor.Copper);
    api.pipe(s, 0.7, 0.1, Decor.Copper);
    api.greeble(api.wall(s) - s * 0.06, 0, api.d, 0.12, 0.3, 2.32, api.row % 2 ? Decor.Yellow : Decor.Dark);
    if (api.row % 5 === (s > 0 ? 1 : 3)) api.steam(api.wall(s) - s * 0.35, 0.55, api.d, 1.6);
    if (api.row % 6 === 0) api.blinker(api.wall(s) - s * 0.05, 2.2, api.d, 0.08, 0.14, Light.Amber);
  }
}

/** Foundry: molten pours into troughs along the walls, sparks, glowing lights. */
function foundryDecor(api: RoomAPI): void {
  for (const s of [-1, 1]) {
    api.pipe(s, api.H - 0.8, 0.3, Decor.Dark);
    if (api.row % 6 === (s > 0 ? 1 : 4)) {
      api.pour(api.wall(s) - s * 1.1, api.d, 0.55, Liquid.Molten, false);
      api.pool(api.wall(s) - s * 1.1, api.d, 1.0, Liquid.Molten);
      api.greeble(api.wall(s) - s * 1.1, 0, api.d, 2.2, 0.25, 2.2, Decor.Dark);
    }
    if (api.row % 9 === (s > 0 ? 4 : 0)) api.sparks(api.wall(s) - s * 0.4, 1.5, api.d);
    if (api.row % 4 === 0) api.light(api.wall(s) - s * 0.03, 1.4, api.d, 0.05, 0.6, 0.8, Light.Red);
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
  // A leak: a thin trickle from the ceiling into a puddle by the wall.
  if (api.ceiling && !api.pit && r % 17 === 9 && h(api, r + 11) > 0.5) {
    api.pour(api.wall(s) - s * 0.55, api.d, 0.12, Liquid.Water, false);
    api.pool(api.wall(s) - s * 0.55, api.d, 0.45, Liquid.Water);
  }
  // A burst pipe venting steam.
  if (r % 13 === 2 && h(api, r + 12) > 0.45) {
    api.greeble(api.wall(-s) + s * 0.25, 1.15, api.d, 0.5, 0.18, 0.5, Decor.Copper);
    api.steam(api.wall(-s) + s * 0.3, 1.3, api.d, 1.3);
  }
  // A broken panel throwing sparks.
  if (r % 19 === 11 && h(api, r + 13) > 0.5) {
    api.greeble(api.wall(s) - s * 0.1, 1.2, api.d, 0.2, 0.7, 0.9, Decor.Dark);
    api.sparks(api.wall(s) - s * 0.25, 1.5, api.d);
  }
  // Ceiling fans in tall rooms.
  if (api.ceiling && api.H > 4.2 && r % 9 === 4 && api.hw > 2.5) {
    api.fan(api.cx - api.hw * 0.5, api.d, 0.8 + h(api, r + 14) * 0.4);
    api.fan(api.cx + api.hw * 0.5, api.d, 0.8 + h(api, r + 15) * 0.4);
  }
  // Big wall screen in a frame.
  if (r % 13 === 6 && api.H > 3.5 && h(api, r + 7) > 0.45) {
    api.greeble(api.wall(-s) + s * 0.06, 1.3, api.d, 0.12, 1.3, 2, Decor.Panel);
    api.light(api.wall(-s) + s * 0.13, 1.42, api.d, 0.02, 1.06, 1.7, h(api, r + 8) < 0.6 ? Light.Teal : Light.White);
  }
}
ROOMS.gantry = gantry;
ROOMS.breach = breach;
ROOMS.servers.decor = serversDecor;
ROOMS.cargo.decor = cargoDecor;
ROOMS.reactor.decor = reactorDecor;
ROOMS.pistons.decor = pistonsDecor;
ROOMS.hangar.decor = hangarDecor;
ROOMS.hydroponics.decor = hydroponicsDecor;
ROOMS.lasers.decor = lasersDecor;
ROOMS.coolant.decor = coolantDecor;
ROOMS.vents.decor = ventsDecor;
ROOMS.foundry.decor = foundryDecor;
ROOMS.deck.decor = deckDecor;
ROOMS.shaft.decor = (api) => corridorDecor(api, 5);


// --- landmark rooms ------------------------------------------------------------

/** Drop shaft: a catwalk over a deep shaft, red beacons, then the deck drops away to the level below. */
const dropShaft: RoomDef = {
  name: 'drop shaft',
  extraWidth: () => R.dropShaft.extraWidth,
  height: R.dropShaft.height,
  ceiling: true,
  windows: false,
  light: Light.Red,
  wander: 0.3,
  enclosure: 1,
  railings: true,
  ownSteps: true,
  decor(api) {
    corridorDecor(api);
    if (api.row % 6 === 0) for (const s of [-1, 1]) api.blinker(api.wall(s) - s * 0.08, api.H - 1, api.d, 0.1, 0.2, Light.Red);
  },
};

/** Cargo lift: the floor rises on a lift platform; hooks on chains swing across the bay. */
const cargoLift: RoomDef = {
  name: 'cargo lift',
  extraWidth: () => R.cargoLift.extraWidth,
  height: R.cargoLift.height,
  ceiling: true,
  windows: false,
  light: Light.Amber,
  wander: 0.2,
  enclosure: 1,
  ownSteps: true,
  decor(api) {
    corridorDecor(api, 1);
    // Gantry crane beam overhead.
    if (api.row % 9 === 0) api.greeble(api.cx, api.H - 0.7, api.d, api.hw * 2, 0.45, 0.6, Decor.Yellow);
  },
};

/** Flooded section: water over the deck, railed catwalks above it, drips from the ceiling. */
const flooded: RoomDef = {
  name: 'flooded section',
  extraWidth: () => R.flooded.extraWidth,
  height: R.flooded.height,
  ceiling: true,
  windows: false,
  light: Light.Teal,
  wander: 0.4,
  enclosure: 1,
  railings: true,
  decor(api) {
    corridorDecor(api);
    // Pipes half under the water.
    if (api.row % 2 === 0) for (const s of [-1, 1]) api.pipe(s, -0.4, 0.22, Decor.Teal);
  },
};

/** Command deck: tiers of consoles in rows under a big viewscreen; the floor is raised a step. */
const command: RoomDef = {
  name: 'command deck',
  extraWidth: () => R.command.extraWidth,
  height: R.command.height,
  ceiling: true,
  windows: true,
  light: Light.Teal,
  wander: 0,
  enclosure: R.command.enclosure,
  ownSteps: true,
  decor(api) {
    corridorDecor(api, 1);
  },
};

/** Ventilation: giant fans turn in pits under the deck; walkways between them. */
const fanRoom: RoomDef = {
  name: 'ventilation',
  extraWidth: () => R.fanRoom.extraWidth,
  height: R.fanRoom.height,
  ceiling: true,
  windows: false,
  light: Light.White,
  wander: 0.3,
  enclosure: 1,
  railings: true,
  decor(api) {
    corridorDecor(api);
    // Big duct openings high on the walls.
    if (api.row % 10 === 0) for (const s of [-1, 1]) api.greeble(api.wall(s) - s * 0.2, api.H - 2.2, api.d, 0.4, 1.6, 2.2, Decor.Dark);
  },
};

/** Lab: rows of glass tanks of glowing liquid, benches with holograms. */
const lab: RoomDef = {
  name: 'lab',
  extraWidth: () => R.lab.extraWidth,
  height: R.lab.height,
  ceiling: true,
  windows: false,
  light: Light.Green,
  wander: 0.3,
  enclosure: 1,
  decor(api) {
    corridorDecor(api, 1);
    if (api.row % 5 === 0) for (const s of [-1, 1]) api.blinker(api.wall(s) - s * 0.06, 1.4, api.d, 0.05, 0.08, Light.Green);
  },
};

ROOMS.dropShaft = dropShaft;
ROOMS.cargoLift = cargoLift;
ROOMS.flooded = flooded;
ROOMS.command = command;
ROOMS.fanRoom = fanRoom;
ROOMS.lab = lab;

// The reactor: a glowing gap around the core (keep off it), steam and sparks.

// The engine room (piston hall): pistons pumping up and down along the walls.
const pistonsDecorBase = ROOMS.pistons.decor!;
ROOMS.pistons.name = 'engine room';
ROOMS.pistons.decor = (api) => {
  pistonsDecorBase(api);
  if (api.row % 3 === 0) {
    for (const s of [-1, 1]) api.piston(api.wall(s) - s * 0.55, api.d, api.H);
  }
};

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
