import { BoxGeometry, Color, CylinderGeometry, MeshBasicMaterial, PlaneGeometry, OctahedronGeometry, Scene, type Texture } from 'three';
import { patchBlockMaterial } from './blockTextures';
import { CONFIG } from './config';
import { rand, seed as seedRandom } from './rng';
import { densityAt, lateralSpeedAt, speedAt } from './difficulty';
import { InstancedField, wrap } from './field';
import type { LivePalette } from './palette';
import { type Biome, BIOME_NAMES } from './biomes';
import { terrain } from './terrain';
import type { Course, Environment, Section } from './courses';

/** A stretch of a course in one theme (and, for groups, one biome). */
interface Span {
  theme: ThemeId;
  biome: Biome;
  start: number; // offsets from the run start
  end: number;
}

const DEFAULT_BIOME: Record<ThemeId, Biome> = { land: 'alien', canyon: 'canyon', interior: 'interior' };
import { Decor, decorate, Light, pickRoom, ROOM_IDS, ROOMS, roomLength, type RoomAPI, type RoomId, type RoomPlan } from './interior';
import { fxMaterial, LIQUID_COLOURS, Sparks } from './fx';
import { type Block, type Parsed, parse, type Piece, routeX } from './pieces/format';
import { FAMILIES, pickPiece, pieceById } from './pieces';
import { ceilingFan } from './props';
import { alienCactus, ARCH_PILLAR_X, bush, deadTree, grassTuft, mesa, rockArch, rockSpire, tumbleweed } from './props';
import { BOULDER_HEIGHT, boulder, canister, crystalCluster, greebleBox, mushroomTree, pipeSegment, powerGem, shuttle, spireTree } from './props';

// The world ahead of the ship: obstacle pools plus the generator that lays
// out each theme row by row.
//
// Coordinates: the generator works in world x (`lane`, `cx`); instances are
// stored relative to the ship, so world x is converted with `- shipX` at spawn.
//
// Survivability: every row keeps a clear "safe lane" around `lane`. The lane
// moves no faster than lane.slopeFraction of what the ship can steer at that
// row's speed, and obstacles never overlap it, so there is always a way through.

export type ThemeId = 'land' | 'canyon' | 'interior';

/** Power-up kinds: 0 shield, 1 magnet, 2 slow-mo. */
export type PowerKind = 0 | 1 | 2;
const THEMES: ThemeId[] = ['land', 'canyon', 'interior'];

/** Ramps and drops for a theme (CONFIG.themes.*.elevation). */
interface ElevationConfig {
  spacing: readonly number[];
  rise: readonly number[];
  riseLength: readonly number[];
  drop: readonly number[];
  dropLength: readonly number[];
  dropChance: number;
  min: number;
  max: number;
  returnSlope: number;
}

const F = CONFIG.field;
const TH = CONFIG.themes;
const LPT = TH.levelsPerTheme;
const STEP = F.rowSpacing;
const W = F.halfWidth;
const SPAN = W * 2;
const LANE = TH.lane.halfWidth;
const FLOOR_ROWS = 512; // rows of floor history kept for fall checks
const PIT_LIP = 0.3;
const CHASM_INSET = 1.4; // the drop starts this far in from the bridge ends
const BRIDGE_JUMP = 0.8; // a bridge edge moving more than this in a row has jumped, not bent // pit sides: a thin steel lip, then black

/** Open-ground prop kinds. */
const enum Prop {
  Mushroom,
  Spire,
  Rock,
  Crystal,
  Bush,
  DeadTree,
  RockSpire,
  Cactus,
}

/** Collision radius per unit of size, by prop kind (trees collide at the trunk only). */
const PROP_HIT: Record<Prop, number> = {
  [Prop.Mushroom]: 0.2,
  [Prop.Spire]: 0.16,
  [Prop.Rock]: 0.8,
  [Prop.Crystal]: 0.45,
  [Prop.Bush]: 0.45,
  [Prop.DeadTree]: 0.16,
  [Prop.RockSpire]: 0.6,
  [Prop.Cactus]: 0.24,
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Smoothstep of t clamped to 0..1. */
function ease(t: number): number {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function range(r: readonly [number, number] | readonly number[]): number {
  return r[0] + rand() * (r[1] - r[0]);
}

export function themeForLevel(level: number): ThemeId {
  return THEMES[Math.floor((level - 1) / LPT) % THEMES.length];
}

const GROUND_BIOMES: Biome[] = ['alien', 'ice', 'volcanic'];
const SECOND_BIOMES: Biome[] = ['canyon', 'asteroids', 'canyon'];

/** The biome at `level`: the outdoor themes change look each loop (see biomes.ts). */
export function biomeForLevel(level: number): Biome {
  const theme = themeForLevel(level);
  if (theme === 'interior') return 'interior';
  const loop = Math.floor((level - 1) / (LPT * THEMES.length)) % 3;
  return theme === 'land' ? GROUND_BIOMES[loop] : SECOND_BIOMES[loop];
}

export function themeName(level: number): string {
  return BIOME_NAMES[biomeForLevel(level)];
}

export class World {
  distance = 0;
  canyonMix = 0; // 0..1, how much the canyon look applies at the ship
  interiorMix = 0;
  deckMix = 0; // 0..1, open to space on the observation deck
  biome: Biome = 'alien'; // at the ship
  biomeMix = 0; // 0..1, how much the biome look applies at the ship
  asteroidMix = 0; // 0..1, in the asteroid belt (no ground, open to space)
  private genBiome: Biome = 'alien'; // at the row being generated
  /** Assist mode: mark the safe line on the ground (rows generated from now on). */
  assist = false;
  /** Ship upgrades (solo): pickup reach and power-up frequency multipliers. */
  collectScale = 1;
  powerRate = 1;
  insideMix = 0; // 0..1, inside the ship at all (ignores how open the room is)

  private generatedTo = 0;
  private lastDx = 0; // sideways movement this frame, for swept collision
  // Inner edges of the previous row's walls (world x), so each wall segment can
  // reach back over any step and leave no gap between rows.
  private prevWallL = NaN;
  private prevWallR = NaN;
  private shipX = 0; // ship's world lateral position

  /** The ship's sideways position in the world (ground patterns follow it). */
  get lateral(): number {
    return this.shipX;
  }
  private runStart: number | null = null; // null on the title screen

  private readonly blocks: InstancedField; // steel crates (interior)
  private readonly hull: InstancedField;
  private readonly rocks: InstancedField; // canyon walls
  private readonly obstacleRocks: InstancedField; // dark boulders and pillars
  private readonly mushrooms: InstancedField;
  private readonly spires: InstancedField;
  private readonly crystals: InstancedField;
  private readonly bushes: InstancedField;
  private readonly deadTrees: InstancedField;
  private readonly rockSpires: InstancedField;
  private readonly cacti: InstancedField;
  private readonly tumbleweeds: InstancedField; // scenery rolling across
  private readonly tufts: InstancedField; // grass, scenery
  // Interior animation (fx.ts).
  private readonly pours: InstancedField; // liquid falling from the ceiling (curtains are solid)
  private readonly pools: InstancedField;
  private readonly steamPlumes: InstancedField;
  private readonly blinkers: InstancedField;
  private readonly holos: InstancedField;
  private readonly fans: InstancedField;
  private readonly vents: InstancedField; // steam vent columns (a hazard)
  readonly sparks: Sparks;
  private fanSpin = 0;
  private readonly mesas: InstancedField; // horizon scenery
  private readonly arches: InstancedField; // rock arches over the path (pillars collide via rocks)
  private nextRockFaceAt = 0;
  // Canyon split (see canyon()).
  private splitAt = Infinity; // when the next split starts widening
  private splitStart = Infinity; // island start
  private splitEnd = -Infinity; // island end
  private splitHalf = 0; // island half-width
  private splitSide = 1; // which branch the lane takes
  private altLane = 0; // the other branch's own clear line (world x)
  private altTarget = 0;
  private altPickupsLeft = 0;
  private nextBridgeAt = 0;
  // Elevation (see elevate()): ramps, platforms and drops in the canyon and the ship.
  private nextStepAt = Infinity;
  private themeLevel = 0; // terrain level when this theme began: it's back there by the end
  private levelReturned = false;
  private liftPending = false; // a split's upper/lower routes wait for the island
  // Chasms (see planChasm()): the canyon floor falls away and bridges span it.
  private chasmAt = Infinity;
  private chasmStart = Infinity;
  private chasmEnd = -Infinity;
  private chasmKind = 0; // 0 rope bridge, 1 wide bridge with planks missing, 2 bridge that forks
  private chasmSide = 1; // fork: the side the second bridge swings out to
  private chasmOff = 0; // fork: how far it swings out
  private chasmPickups = 0;
  private readonly railPrev = new Float32Array(4); // last row's deck edges (two decks), for the rails
  private railPrevD = -Infinity;
  private railPrevN = 0;
  private chasmWallL = 0; // last row's wall lines, for the chasm's sides
  private chasmWallR = 0;
  private holeAt = 0; // wide bridge: where the next missing stretch starts
  private holeUntil = -Infinity;
  private holeSide = 1;
  /** Another way through at the row just built (world x), if there is one: tests fly it. */
  altNow: number | null = null;
  /** Alternative routes generated so far (tests check they happen). */
  altRoutes = 0;
  private rockFaceUntil = -Infinity;
  private rockFaceSide = 1;
  private nextArchAt = 0;
  private readonly strips: InstancedField; // lights, and laser beams (solid ones)
  private readonly shuttles: InstancedField;
  private readonly pipes: InstancedField; // wall dressing
  private readonly greebles: InstancedField;
  private readonly voids: InstancedField; // pit bottoms
  private readonly waters: InstancedField; // flooded rooms
  private readonly tanks: InstancedField; // lab tanks (solid)
  private readonly canisters: InstancedField;
  private readonly decorMat: MeshBasicMaterial;
  // Custom floor of the row being built (world x pairs) and the history of past rows.
  private floorN = -1;
  private readonly floorSegs = new Float32Array(12);
  private readonly floorD = new Float64Array(FLOOR_ROWS).fill(-Infinity);
  private readonly floorCount = new Int8Array(FLOOR_ROWS).fill(-1);
  private readonly floorRows = new Float32Array(FLOOR_ROWS * 12);
  private readonly pickups: InstancedField;
  private readonly powers: InstancedField; // colour index = PowerKind
  private readonly fields: InstancedField[];
  private readonly solids: InstancedField[]; // everything that can be hit
  private readonly obstacleMat: MeshBasicMaterial;
  private readonly propMat: MeshBasicMaterial;
  private readonly pickupMat: MeshBasicMaterial;
  private pickupSpin = 0;
  private readonly matLight: MeshBasicMaterial;
  private readonly matMid: MeshBasicMaterial;
  private readonly matDark: MeshBasicMaterial;
  private readonly matHullTop: MeshBasicMaterial; // floors and ceilings: darker, larger plates
  private readonly rockMat: MeshBasicMaterial;
  private readonly stripMat: MeshBasicMaterial;
  private readonly textured: boolean;

  // Chosen by pickProp(), consumed by placeProp().
  private propKind = Prop.Rock;
  private propSize = 1;
  private propHit = 0.5;

  // --- generator state (world x) ---
  private theme: ThemeId = 'land';
  private themeStart = -Infinity;
  private themeEnd = Infinity;
  private lane = 0;
  private laneTarget = 0; // world x on land, offset from cx elsewhere
  private laneRetargetAt = 0;
  private cx = 0; // path centre in canyon/interior
  private cxSlope = 0;
  private cxTargetSlope = 0;
  private cxRetargetAt = 0;
  private nextFeatureAt = 0;
  private entrancePending = false;

  // --- interior rooms ---
  /** Dev: force this room every time (null = random). */
  devRoom: RoomId | null = null;
  /** The set course being followed (see courses.ts), or null for the endless plan. */
  private course: Course | null = null;
  /** Solo: stay in one environment forever (it still gets harder), or null. */
  private environment: Environment | null = null;
  private sectionStarts: number[] = []; // offsets from the run start
  private themeRuns: Span[] = []; // contiguous sections in one theme
  private biomeGroups: Span[] = []; // ...and in one biome
  private roomQueue: string[] = []; // piece ids or room families
  private roomScript: string[] = []; // the course's rooms for this stretch, repeated if it runs long
  private nextOverlayAt = 0;
  private overlaySide = 1;
  /** Name of the room the ship is in ('' for corridors and outside). */
  roomName = '';
  private room: RoomId = 'corridor';
  private lastRoom: RoomId = 'corridor';
  private roomStart = 0;
  private roomEnd = -Infinity;
  private roomTaper = 0;
  private roomHw = 0;
  private roomSide = 1;
  private roomOffset: number | null = null;
  private roomH = 0;
  private roomShift = 0; // sideways shift of the centre line through this room
  private shiftLen = 0;
  private shiftDone = 0;
  private plan: RoomPlan | null = null; // split layout, mirrored to this room's side
  // A hand-made piece being built (see pieces/), or null when it's a room template.
  private piece: Parsed | null = null;
  private pieceStart = 0; // distance of its first row
  private pieceEnd = 0; // ...and of its last
  /**
   * Dev and tests: build these pieces in turn, each in the next slot of its kind
   * (room pieces in room slots, corridor pieces in corridor slots).
   */
  devPieces: string[] = [];
  /** Dev: draw each section's routes on the floor. */
  showRoutes = false;
  private devPieceNext = 0;
  /** Each of the current piece's routes, world x, at the row just built (tests fly them). */
  routesNow: number[] = [];
  private framePending = false;
  private enclosure = 1; // eased towards the current room's enclosure
  private readonly roomLogD = new Float64Array(16).fill(-Infinity);
  private readonly roomLogId = new Int8Array(16);
  private roomLogHead = 0;
  private readonly api: RoomAPI = this.makeApi();
  private nextPickupAt = Infinity;
  private nextPowerAt = Infinity;

  constructor(scene: Scene, private readonly palette: LivePalette, textures?: { side: Texture; top: Texture }) {
    const s = F.cubeSize;
    const box = new BoxGeometry(s, s, s).translate(0, s / 2, 0);
    this.matLight = new MeshBasicMaterial({ map: textures?.top ?? null });
    this.matMid = new MeshBasicMaterial({ map: textures?.side ?? null });
    this.matDark = new MeshBasicMaterial({ map: textures?.side ?? null });
    this.matHullTop = new MeshBasicMaterial({ map: textures?.top ?? null });
    if (textures) {
      patchBlockMaterial(this.matHullTop, true, 0.5);
      patchBlockMaterial(this.matLight, true);
      patchBlockMaterial(this.matMid, false);
      patchBlockMaterial(this.matDark, false);
    }
    this.textured = !!textures;
    // BoxGeometry groups: +x, -x, +y, -y, +z, -z
    const mats = [this.matDark, this.matDark, this.matLight, this.matLight, this.matMid, this.matMid];
    this.blocks = new InstancedField(scene, box, mats, F.maxBlocks);
    const hullMats = [this.matDark, this.matDark, this.matHullTop, this.matHullTop, this.matMid, this.matMid];
    this.hull = new InstancedField(scene, box, hullMats, F.maxHull);
    this.rockMat = new MeshBasicMaterial({ vertexColors: true });
    const rock = boulder();
    this.rocks = new InstancedField(scene, rock, this.rockMat, F.maxRocks);
    this.obstacleMat = new MeshBasicMaterial({ vertexColors: true });
    this.obstacleRocks = new InstancedField(scene, rock, this.obstacleMat, F.maxObstacleRocks);
    this.propMat = new MeshBasicMaterial({ vertexColors: true });
    this.mushrooms = new InstancedField(scene, mushroomTree(), this.propMat, F.maxMushrooms);
    this.spires = new InstancedField(scene, spireTree(), this.propMat, F.maxSpires);
    this.crystals = new InstancedField(scene, crystalCluster(), this.propMat, F.maxCrystals);
    this.bushes = new InstancedField(scene, bush(), this.propMat, F.maxBushes);
    this.deadTrees = new InstancedField(scene, deadTree(), this.propMat, F.maxDeadTrees);
    this.rockSpires = new InstancedField(scene, rockSpire(), this.propMat, F.maxRockSpires);
    this.tufts = new InstancedField(scene, grassTuft(), this.propMat, F.maxTufts);
    this.mesas = new InstancedField(scene, mesa(), this.propMat, F.maxMesas);
    this.cacti = new InstancedField(scene, alienCactus(), this.propMat, F.maxCacti);
    this.tumbleweeds = new InstancedField(scene, tumbleweed(), this.propMat, F.maxTumbleweeds);
    this.tumbleweeds.rollRadius = 0.5;
    this.arches = new InstancedField(scene, rockArch(), this.propMat, F.maxArches);
    this.stripMat = new MeshBasicMaterial();
    this.strips = new InstancedField(scene, box, this.stripMat, F.maxStrips);
    const L = TH.interior.lights;
    this.strips.setColorTable([new Color(1, 1, 1), new Color(L.amber), new Color(L.teal), new Color(L.red), new Color(L.dark), new Color(L.green)]);
    // Wall dressing: shaded geometry tinted per instance from the decor table (Decor order).
    const D = TH.interior.decor;
    const decorTable = [D.steel, D.copper, D.teal, D.red, D.dark, D.yellow, D.panel, D.green, D.wood, D.woodDark, D.rope, D.glass, D.cliff].map((h) => new Color(h));
    this.decorMat = new MeshBasicMaterial({ vertexColors: true });
    this.decorMat.color.setScalar(0.95);
    this.pipes = new InstancedField(scene, pipeSegment(), this.decorMat, F.maxPipes);
    this.pipes.setColorTable(decorTable);
    this.greebles = new InstancedField(scene, greebleBox(), this.decorMat, F.maxGreebles);
    this.greebles.setColorTable(decorTable);
    this.canisters = new InstancedField(scene, canister(), this.decorMat, F.maxCanisters);
    this.canisters.setColorTable(decorTable);
    const unitBox = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.pours = new InstancedField(scene, unitBox, fxMaterial('pour', { opacity: 0.85 }), F.maxPours);
    this.pours.setColorTable(LIQUID_COLOURS);
    this.pools = new InstancedField(scene, new CylinderGeometry(1, 1, 0.04, 18), fxMaterial('pool'), F.maxPools);
    this.pools.setColorTable(LIQUID_COLOURS);
    this.steamPlumes = new InstancedField(scene, new CylinderGeometry(0.5, 0.18, 1, 10, 1, true).translate(0, 0.5, 0), fxMaterial('steam', { opacity: 0.55 }), F.maxSteam);
    this.blinkers = new InstancedField(scene, box, fxMaterial('blink'), F.maxBlinkers);
    this.blinkers.setColorTable([new Color(1, 1, 1), new Color(L.amber), new Color(L.teal), new Color(L.red), new Color(L.dark), new Color(L.green)]);
    this.holos = new InstancedField(scene, new PlaneGeometry(1, 1).translate(0, 0.5, 0), fxMaterial('holo', { additive: true }), F.maxHolos);
    this.holos.setColorTable([LIQUID_COLOURS[4]]);
    this.fans = new InstancedField(scene, ceilingFan(), this.decorMat, F.maxFans);
    // A flared plume, open at both ends.
    this.vents = new InstancedField(scene, new CylinderGeometry(0.75, 0.5, 1, 12, 1, true).translate(0, 0.5, 0), fxMaterial('vent', { opacity: 0.6 }), F.maxVents);
    this.vents.setColorTable([LIQUID_COLOURS[3]]);
    this.sparks = new Sparks(scene);
    this.waters = new InstancedField(scene, unitBox, fxMaterial('water'), F.maxWaters);
    this.waters.setColorTable([LIQUID_COLOURS[1]]);
    this.tanks = new InstancedField(scene, new CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0), fxMaterial('tank', { opacity: 0.8 }), F.maxTanks);
    this.tanks.setColorTable([LIQUID_COLOURS[0], LIQUID_COLOURS[4], LIQUID_COLOURS[1]]);
    this.voids = new InstancedField(scene, box, new MeshBasicMaterial({ color: TH.interior.void, fog: false }), F.maxVoids);
    this.shuttles = new InstancedField(scene, shuttle(), this.propMat, F.maxShuttles);
    this.pickupMat = new MeshBasicMaterial();
    const p = CONFIG.boost.pickup;
    this.pickups = new InstancedField(scene, new OctahedronGeometry(p.size, 0), this.pickupMat, F.maxPickups);
    const pw = CONFIG.powers;
    this.powers = new InstancedField(scene, powerGem(pw.size), new MeshBasicMaterial({ vertexColors: true }), F.maxPowers);
    this.powers.setColorTable([pw.shield.color, pw.magnet.color, pw.slow.color].map((c) => new Color(c)));
    this.solids = [
      this.blocks,
      this.hull,
      this.rocks,
      this.obstacleRocks,
      this.mushrooms,
      this.spires,
      this.crystals,
      this.bushes,
      this.deadTrees,
      this.rockSpires,
      this.cacti,
      this.shuttles,
      this.strips,
      this.pours,
      this.vents,
      this.tanks,
    ];
    this.fields = [...this.solids, this.pools, this.steamPlumes, this.blinkers, this.holos, this.fans, this.tufts, this.mesas, this.arches, this.pickups, this.powers, this.pipes, this.greebles, this.voids, this.canisters, this.waters, this.tumbleweeds];
    this.applyPalette();
  }

  // --- palette -------------------------------------------------------------

  applyPalette(): void {
    this.faceColor(this.matLight.color, this.palette.cubeLight);
    this.faceColor(this.matMid.color, this.palette.cubeMid);
    this.faceColor(this.matDark.color, this.palette.cubeDark);
    this.faceColor(this.matHullTop.color, this.palette.cubeDark);
    this.matHullTop.color.multiplyScalar(TH.interior.floorShade);
    this.rockMat.color.copy(this.palette.rock);
    this.obstacleMat.color.copy(this.palette.obstacle);
    this.propMat.color.copy(this.palette.light);
    this.stripMat.color.copy(this.palette.strip);
    this.pickupMat.color.copy(this.palette.pickup);
    this.decorMat.color.setScalar(0.95);
    const alert = this.palette.alert;
    for (const m of [this.matLight, this.matMid, this.matDark, this.matHullTop, this.decorMat, this.propMat]) m.color.multiply(alert);
  }
  /** Flat blocks take the palette colour; textured ones read as steel at its brightness. */
  private faceColor(out: Color, src: Color): void {
    if (!this.textured) {
      out.copy(src);
      return;
    }
    const b = CONFIG.blocks;
    const l = 0.2126 * src.r + 0.7152 * src.g + 0.0722 * src.b;
    out.setRGB(l, l, l).lerp(src, b.tint).multiplyScalar(b.brightness);
    out.r = Math.min(1, out.r);
    out.g = Math.min(1, out.g);
    out.b = Math.min(1, out.b);
  }

  // --- run lifecycle -------------------------------------------------------

  /**
   * Regenerate everything. `run` starts a scored run (themes progress);
   * otherwise it's the title screen (open ground forever).
   */
  /** `seed` makes the layout reproducible (same seed, same course). */
  reset(clearance: number, run: boolean, startScore = 0, seed?: number): void {
    if (seed !== undefined) seedRandom(seed);
    // Start from a clean slate so a seed always rebuilds the same course: every
    // piece is cleared below, so distance and sideways position can restart too.
    this.distance = 0;
    this.shipX = 0;
    this.cx = 0;
    this.cxSlope = this.cxTargetSlope = 0;
    this.cxRetargetAt = 0;
    this.laneTarget = 0;
    this.api.row = 0;
    for (const f of this.fields) f.clear();
    // Forget rooms generated ahead in the previous run.
    this.roomLogD.fill(-Infinity);
    this.room = this.lastRoom = 'corridor';
    this.roomEnd = -Infinity;
    this.enclosure = 1;
    this.plan = null;
    this.piece = null;
    this.routesNow = [];
    this.devPieceNext = 0;
    this.roomShift = 0;
    this.prevWallL = this.prevWallR = NaN;
    this.floorD.fill(-Infinity);
    this.wallD.fill(-Infinity);
    this.laneRingD.fill(-Infinity);
    this.laneLogD = -Infinity;
    this.sparks.clear();
    // Forget the last run's look too: the title applies it straight after a reset.
    this.canyonMix = this.interiorMix = this.insideMix = this.deckMix = this.biomeMix = this.asteroidMix = 0;
    this.roomName = '';
    // startScore > 0 (dev skip) places the run part-way along.
    this.runStart = run ? this.distance - startScore / CONFIG.score.pointsPerUnit : null;
    this.theme = 'land';
    this.themeStart = -Infinity;
    terrain.flatten();
    this.chasmAt = this.nextStepAt = Infinity;
    this.chasmStart = Infinity;
    this.chasmEnd = -Infinity;
    this.liftPending = false;
    this.altNow = null;
    this.altRoutes = 0;
    const level = this.levelAt(this.distance);
    this.themeEnd = run ? this.levelStart(level - ((level - 1) % LPT) + LPT) : Infinity;
    if (run && this.course) {
      const first = this.themeRuns[0];
      this.themeEnd = this.distance + first.end;
      // Not starting on open ground: row() will start the right theme.
      if (first.theme !== 'land') this.theme = first.theme === 'canyon' ? 'interior' : 'canyon';
    } else if (run && this.environment) {
      this.themeEnd = Infinity;
      if (this.environment.theme !== 'land') this.theme = this.environment.theme === 'canyon' ? 'interior' : 'canyon';
    }
    // A run that starts on open ground never calls startTheme for it, so set its hills here.
    const firstTheme = run && this.course ? this.themeRuns[0].theme : run && this.environment ? this.environment.theme : themeForLevel(level);
    if (run && firstTheme === 'land') this.setHills(this.distance + clearance, this.themeEnd);
    this.nextRockFaceAt = this.distance + clearance + range(TH.land.rockFaceSpacing) * 0.5;
    this.rockFaceUntil = -Infinity;
    this.nextArchAt = this.distance + clearance + range(TH.land.archSpacing) * 0.5;
    this.lane = this.laneTarget = this.shipX;
    this.laneRetargetAt = this.distance + clearance + 20;
    this.nextFeatureAt = this.distance + clearance;
    this.nextPickupAt = this.distance + clearance + 40;
    this.nextPowerAt = this.distance + CONFIG.powers.firstAfter + (range(CONFIG.powers.spacing) * 0.5) / this.powerRate;
    this.generatedTo = this.distance + clearance;
    this.fill();
  }

  advance(dt: number, speed: number, lateral: number): void {
    this.distance += speed * dt;
    const dx = lateral * dt;
    this.lastDx = dx;
    this.shipX += dx;
    const behind = this.distance - F.recycleBehind;
    for (const f of this.fields) f.advance(dx, behind);
    this.fill();
    this.hull.animate(this.distance); // pistons
    this.vents.animate(this.distance); // steam vents
    this.tumbleweeds.animate(this.distance); // rolling across
    this.greebles.animate(this.distance); // hook chains, engine pistons
    this.updateMix(dt);
  }

  hitTest(prevDistance: number): boolean {
    for (const f of this.solids) if (f.hitTest(prevDistance, this.distance, this.lastDx)) return true;
    return false;
  }

  /**
   * Keep the ship inside the walls (canyon and ship interior), `margin` from
   * their inner faces. Used while shielded: a shield lets you through what you
   * hit, but never out of the course. Returns true if the ship was pushed back.
   */
  clampToWalls(margin: number): boolean {
    const slot = (((Math.round(this.distance / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    if (Math.abs(this.wallD[slot] - this.distance) > STEP * 0.6) return false;
    const lo = this.wallL[slot] + margin;
    const hi = this.wallR[slot] - margin;
    let dx = 0;
    if (this.shipX < lo) dx = lo - this.shipX;
    else if (this.shipX > hi) dx = hi - this.shipX;
    if (dx === 0) return false;
    this.shipX += dx;
    for (const f of this.fields) f.advance(dx, -Infinity);
    this.lastDx = 0;
    return true;
  }

  /** Remember a row's inner wall faces (world x) for clampToWalls. */
  private recordWalls(d: number, left: number, right: number): void {
    const slot = (((Math.round(d / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    this.wallD[slot] = d;
    this.wallL[slot] = left;
    this.wallR[slot] = right;
  }

  // Obstacles that just passed the ship closely (walls excluded), for scoring and sound.
  readonly passSide = new Float32Array(32);
  readonly passGap = new Float32Array(32);

  /** Fills passSide/passGap with obstacles that passed within `range`; returns the count. */
  passes(prevDistance: number, range: number): number {
    let n = 0;
    for (const f of this.solids) n = f.passes(prevDistance, this.distance, range, this.passSide, this.passGap, n);
    return n;
  }
  /** Collects pickups the ship passed through; returns how many. */
  collect(prevDistance: number): number {
    const p = this.pickups;
    const r = CONFIG.boost.pickup.collectRadius * this.collectScale;
    let n = 0;
    for (let i = 0; i < p.max; i++) {
      if (!p.active[i]) continue;
      const x = p.x[i];
      if (x > r || x < -r) continue;
      const zPrev = prevDistance - p.d[i];
      const zNow = this.distance - p.d[i];
      if (zNow >= -r && zPrev <= r) {
        p.d[i] = -Infinity; // recycled on the next advance
        p.y[i] = -100;
        n++;
      }
    }
    return n;
  }

  /** Collects a power-up the ship passed through; returns its kind, or -1. */
  collectPower(prevDistance: number): PowerKind | -1 {
    const p = this.powers;
    const r = CONFIG.boost.pickup.collectRadius * this.collectScale;
    for (let i = 0; i < p.max; i++) {
      if (!p.active[i]) continue;
      const x = p.x[i];
      if (x > r || x < -r) continue;
      const zPrev = prevDistance - p.d[i];
      const zNow = this.distance - p.d[i];
      if (zNow >= -r && zPrev <= r) {
        p.d[i] = -Infinity;
        p.y[i] = -100;
        return p.colorIdx[i] as PowerKind;
      }
    }
    return -1;
  }

  /** Magnet: boost pickups within `reach` ahead slide towards the ship. */
  attractPickups(dt: number): void {
    const m = CONFIG.powers.magnet;
    const p = this.pickups;
    const k = 1 - Math.exp(-m.pull * dt);
    for (let i = 0; i < p.max; i++) {
      if (!p.active[i]) continue;
      const ahead = p.d[i] - this.distance;
      if (ahead < -1 || ahead > m.reach) continue;
      p.x[i] -= p.x[i] * k;
    }
  }

  /** Turn the pickups (cosmetic). */
  /** Turn the ceiling fans (cosmetic). */
  spinFans(dt: number): void {
    this.fanSpin += dt * 5;
    this.fans.cos.fill(Math.cos(this.fanSpin));
    this.fans.sin.fill(Math.sin(this.fanSpin));
  }

  spinPickups(dt: number): void {
    this.pickupSpin += CONFIG.boost.pickup.spinSpeed * dt;
    const c = Math.cos(this.pickupSpin);
    const s = Math.sin(this.pickupSpin);
    this.pickups.cos.fill(c);
    this.pickups.sin.fill(s);
    const p = CONFIG.boost.pickup;
    const y = p.height + Math.sin(this.pickupSpin * 0.8) * p.bob; // octahedron is centred
    const ys = this.pickups.y;
    for (let i = 0; i < ys.length; i++) if (ys[i] > -50) ys[i] = y; // collected ones stay hidden
    this.powers.cos.fill(Math.cos(-this.pickupSpin * 0.7));
    this.powers.sin.fill(Math.sin(-this.pickupSpin * 0.7));
    const py = this.powers.y;
    for (let i = 0; i < py.length; i++) if (py[i] > -50) py[i] = y;
  }

  sync(): void {
    terrain.fold(this.distance - 80);
    for (const f of this.fields) f.sync(this.distance, this.shipX);
  }

  // --- set courses -----------------------------------------------------------

  /** Solo: keep the next run in one environment (null: the endless plan). */
  setEnvironment(env: Environment | null): void {
    this.environment = env;
  }

  /** Follow `course` on the next reset (null: back to the endless plan). */
  setCourse(course: Course | null): void {
    this.course = course;
    this.sectionStarts = [];
    this.themeRuns = [];
    this.biomeGroups = [];
    if (!course) return;
    let at = 0;
    for (const s of course.sections) {
      this.sectionStarts.push(at);
      const biome = s.biome ?? DEFAULT_BIOME[s.theme];
      const run = this.themeRuns[this.themeRuns.length - 1];
      if (run && run.theme === s.theme) run.end = at + s.length;
      else this.themeRuns.push({ theme: s.theme, biome, start: at, end: at + s.length });
      const group = this.biomeGroups[this.biomeGroups.length - 1];
      if (group && group.theme === s.theme && group.biome === biome) group.end = at + s.length;
      else this.biomeGroups.push({ theme: s.theme, biome, start: at, end: at + s.length });
      at += s.length;
    }
  }

  /** Where the finish line is (Infinity outside a course). */
  get finishAt(): number {
    if (!this.course || this.runStart === null) return Infinity;
    return this.runStart + this.sectionStarts[this.sectionStarts.length - 1] + this.course.sections[this.course.sections.length - 1].length;
  }

  /** Index of the course section at distance `d` (the last one past the finish). */
  sectionIndexAt(d: number): number {
    const off = d - (this.runStart ?? 0);
    let i = 0;
    while (i + 1 < this.sectionStarts.length && off >= this.sectionStarts[i + 1]) i++;
    return i;
  }

  sectionAt(d: number): Section | null {
    return this.course ? this.course.sections[this.sectionIndexAt(d)] : null;
  }

  private spanAt(spans: Span[], d: number): Span {
    const off = d - (this.runStart ?? 0);
    for (const s of spans) if (off < s.end) return s;
    return spans[spans.length - 1];
  }

  /** A course's set piece laid over the generator's own work, clear of the lane. */
  private overlay(d: number, kind: Section['overlay'], maxSlope: number): void {
    if (!kind || this.quiet(d) || d < this.nextOverlayAt || this.inChasm(d)) return;
    const jitter = maxSlope * STEP * 0.5;
    const land = this.theme === 'land';
    switch (kind) {
      case 'pickups':
        // A trail of boost pickups down the lane.
        this.nextOverlayAt = d + STEP * 3;
        this.pickups.spawn(this.lane - this.shipX, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, land, 0, 0);
        break;
      case 'arches':
        this.nextOverlayAt = d + 110 + rand() * 50;
        this.placeArch(d, this.lane - this.shipX);
        break;
      case 'slalom': {
        // Tall pillars just off the lane, side to side: weave between them.
        this.nextOverlayAt = d + 13 + rand() * 4;
        this.overlaySide = -this.overlaySide;
        const r = 0.55 + rand() * 0.25;
        const x = this.lane + this.overlaySide * (LANE + r + jitter + 0.5);
        if (land) this.rockSpires.spawn(wrap(x - this.shipX), 0, d, r / 0.6, (r / 0.6) * 1.2, r / 0.6, rand() * 6.28, true, true, r, r);
        else this.obstacle(x, d, r, 4 + rand() * 3);
        break;
      }
      case 'gates': {
        // A wall of rock across the way with one gap on the lane.
        this.nextOverlayAt = d + 22 + rand() * 8;
        const gap = 1.6 + jitter;
        const span = land ? 9 : 30;
        for (let x = this.lane - span; x <= this.lane + span; x += 1.5) {
          const r = 0.6 + rand() * 0.3;
          if (Math.abs(x - this.lane) < gap + r * 0.8) continue;
          this.obstacle(x, d + (rand() - 0.5) * 0.6, r, 0.9 + rand() * 1.4, land);
        }
        break;
      }
    }
  }

  // --- levels ----------------------------------------------------------------

  private scoreAt(d: number): number {
    return this.runStart === null ? 0 : Math.max(0, d - this.runStart) * CONFIG.score.pointsPerUnit;
  }

  private levelAt(d: number): number {
    return Math.floor(this.scoreAt(d) / CONFIG.score.levelLength) + 1;
  }

  /** Distance at which `level` begins. */
  private levelStart(level: number): number {
    const start = this.runStart ?? 0;
    return start + ((level - 1) * CONFIG.score.levelLength) / CONFIG.score.pointsPerUnit;
  }

  private updateMix(dt: number): void {
    this.canyonMix = this.interiorMix = this.insideMix = this.biomeMix = this.asteroidMix = 0;
    this.roomName = '';
    let theme: ThemeId;
    let k: number;
    if (this.course && this.runStart !== null) {
      // A course: the look follows its sections, fading at each change of area.
      const run = this.spanAt(this.themeRuns, this.distance);
      const group = this.spanAt(this.biomeGroups, this.distance);
      const off = this.distance - this.runStart;
      theme = run.theme;
      this.biome = group.biome;
      k = ease((off - run.start) / TH.fadeIn) * ease((run.end - off) / TH.fadeOut);
      if (group.biome !== run.biome || this.biomeGroups.length !== this.themeRuns.length) {
        // A change of biome inside one area: dip through the plain look between them.
        k *= ease((off - group.start) / TH.fadeIn) * ease((group.end - off) / TH.fadeOut);
      }
    } else if (this.environment && this.runStart !== null) {
      // One environment for the whole run: fades in at the start and stays.
      theme = this.environment.theme;
      this.biome = this.environment.biome;
      k = ease((this.distance - this.runStart) / TH.fadeIn);
    } else {
      if (themeForLevel(this.levelAt(this.distance)) !== 'interior') this.deckMix = 0;
      if (this.runStart === null) return;
      const level = this.levelAt(this.distance);
      const first = level - ((level - 1) % LPT);
      k = ease((this.distance - this.levelStart(first)) / TH.fadeIn) * ease((this.levelStart(first + LPT) - this.distance) / TH.fadeOut);
      theme = themeForLevel(level);
      this.biome = biomeForLevel(level);
    }
    if (theme !== 'interior') this.deckMix = 0;
    this.biomeMix = k;
    if (this.biome === 'asteroids') this.asteroidMix = k;
    if (theme === 'canyon') this.canyonMix = k;
    else if (theme === 'interior') {
      const room = this.roomAtShip();
      this.roomName = room ? ROOMS[room].name : '';
      const target = room ? ROOMS[room].enclosure : 1;
      this.enclosure += (target - this.enclosure) * Math.min(1, dt * 1.5);
      this.insideMix = k;
      this.interiorMix = k * this.enclosure;
      const deck = room === 'deck' ? 1 : 0;
      this.deckMix += (deck * k - this.deckMix) * Math.min(1, dt * 1.2);
    }
  }

  // --- generation ------------------------------------------------------------

  private fill(): void {
    const target = this.distance + F.spawnDepth;
    while (this.generatedTo < target) {
      this.generatedTo += STEP;
      this.row(this.generatedTo);
    }
  }

  private row(d: number): void {
    this.rowLane(d);
    const level = this.levelAt(d);
    let theme = themeForLevel(level);
    let sub = (level - 1) % LPT;
    let score = this.scoreAt(d);
    const section = this.runStart !== null ? this.sectionAt(d) : null;
    if (section) {
      // Following a course: its section decides the area, flavour and difficulty.
      theme = section.theme;
      sub = section.sub;
      score = section.difficulty;
      this.genBiome = this.spanAt(this.biomeGroups, d).biome;
      if (theme !== this.theme) this.startTheme(theme, d, level, (this.runStart ?? 0) + this.spanAt(this.themeRuns, d).end);
    } else if (this.environment && this.runStart !== null) {
      // Solo: one environment forever; the theme's three flavours still cycle with the levels.
      theme = this.environment.theme;
      this.genBiome = this.environment.biome;
      if (theme !== this.theme) this.startTheme(theme, d, level, Infinity);
    } else {
      this.genBiome = this.runStart === null ? 'alien' : biomeForLevel(level);
      if (theme !== this.theme) this.startTheme(theme, d, level);
    }
    const speed = speedAt(score);
    // Fastest the lane may drift sideways per unit of forward travel.
    const maxSlope = (TH.lane.slopeFraction * lateralSpeedAt(speed)) / speed;
    if (theme === 'land') this.land(d, sub, score, maxSlope);
    else if (theme === 'canyon') this.canyon(d, sub, score, maxSlope);
    else this.interior(d, sub, score, maxSlope);
    if (section) this.overlay(d, section.overlay, maxSlope);

    if (this.assist && this.runStart !== null && Math.round(d / STEP) % CONFIG.assist.markerEvery === 0) {
      this.light(this.lane, 0.012, d, 0.1, 0.01, 0.9, Light.Teal, false);
    }

    // Boost pickups sit on the safe lane, so they also hint at the way through.
    if (this.runStart !== null && d >= this.nextPickupAt && !this.quiet(d)) {
      this.nextPickupAt = d + range(CONFIG.boost.pickup.spacing);
      const x = this.lane - this.shipX;
      if (d >= this.nextPowerAt) {
        // Now and then a power-up takes the boost pickup's place.
        this.nextPowerAt = d + range(CONFIG.powers.spacing) / this.powerRate;
        this.powers.nextColor = Math.floor(rand() * 3);
        this.powers.spawn(x, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, this.theme === 'land', 0, 0);
      } else {
        this.pickups.spawn(x, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, this.theme === 'land', 0, 0);
      }
    }
  }

  /** True near a theme change, where every theme keeps the path clear. */
  private quiet(d: number): boolean {
    return d < this.themeStart + TH.lane.afterChange || this.themeEnd - d < TH.lane.beforeChange;
  }

  /** `end` overrides where the theme ends (courses); otherwise it's the end of its three levels. */
  private startTheme(theme: ThemeId, d: number, level: number, end?: number): void {
    const first = level - ((level - 1) % LPT);
    this.theme = theme;
    this.themeStart = d;
    this.themeEnd = end ?? this.levelStart(first + LPT);
    this.nextOverlayAt = d + 30;
    this.nextFeatureAt = d + 25;
    this.cxSlope = this.cxTargetSlope = 0;
    this.cxRetargetAt = d + 30;
    this.laneRetargetAt = d;
    if (theme === 'canyon') {
      // Centre the mouth on the ship, not the lane: on open ground the player can
      // roam far from the lane. The lane carries on from where it was (the mouth is
      // wide) and drifts in from there, so following it never needs a sudden swerve.
      this.cx = this.shipX;
      const m = TH.canyon.mouthHalfWidth - LANE - 0.4;
      this.lane = clamp(this.lane, this.cx - m, this.cx + m);
      this.splitAt = d + range(TH.canyon.splitSpacing);
      this.splitStart = Infinity;
      this.splitEnd = -Infinity;
      this.nextBridgeAt = d + range(TH.canyon.bridgeSpacing) * 0.6;
      this.chasmAt = d + TH.canyon.mouth + range(TH.canyon.chasm.firstAfter);
      this.chasmStart = Infinity;
      this.chasmEnd = -Infinity;
      this.liftPending = false;
      this.themeLevel = terrain.level;
      this.levelReturned = false;
      this.nextStepAt = d + TH.canyon.mouth + range(TH.canyon.elevation.spacing) * 0.5;
    } else if (theme === 'interior') {
      // The door goes where the path is (open ground doesn't keep a centre line like the canyon).
      this.cx = this.lane;
      this.entrancePending = true;
      this.room = this.lastRoom = 'corridor';
      // A course's rooms, in order, for this stretch of ship.
      this.roomQueue = [];
      this.roomScript = [];
      if (this.course && this.runStart !== null) {
        const off = d - this.runStart;
        this.course.sections.forEach((s, i) => {
          const start = this.sectionStarts[i];
          if (s.theme === 'interior' && start + s.length > off && start < this.themeEnd - this.runStart!) this.roomQueue.push(...(s.rooms ?? []));
        });
        this.roomScript = [...this.roomQueue];
      }
      this.prevWallL = this.prevWallR = NaN;
      this.themeLevel = terrain.level;
      this.levelReturned = false;
      this.nextStepAt = d + 60 + range(TH.interior.elevation.spacing) * 0.5;
    } else {
      this.laneTarget = this.lane;
      if (this.runStart !== null) this.setHills(d, this.themeEnd);
    }
  }

  // --- land ------------------------------------------------------------------

  /** Rolling hills for an open-ground theme, with a few big hill sections. */
  private setHills(start: number, end: number): void {
    const lt = TH.land;
    const p = rand() * 6.28;
    const q = rand() * 6.28;
    const n = Math.round(range(lt.bigHills));
    const bumps: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      // Spread along the theme, away from its ends (where the hills fade out anyway).
      const c = start + (end - start) * ((i + 0.3 + rand() * 0.4) / n);
      bumps.push([c, range(lt.bigHillWidth), range(lt.bigHillHeight) * (rand() < 0.3 ? -0.6 : 1)]);
    }
    terrain.setWindow(start, end, p, q, bumps);
  }

  /**
   * Open-ground dressing: grass, mesas on the horizon, rock faces alongside
   * the path and the odd arch over it. All clear of the lane.
   */
  private landDressing(d: number, laneRel: number, jitter: number): void {
    const lt = TH.land;
    const biome = this.genBiome;
    // Grass tufts (alien ground only): scenery, so anywhere.
    if (biome === 'alien') {
      for (let i = 0; i < lt.tuftsPerRow; i++) {
        const s = 0.6 + rand() * 0.6;
        this.tufts.spawn((rand() * 2 - 1) * W, 0, d + (rand() - 0.5) * STEP, s, s * (0.8 + rand() * 0.5), s, rand() * 6.28, false, true, 0, 0, false);
      }
    }
    // Tumbleweeds rolling across (not on the ice).
    if (biome !== 'ice' && this.runStart !== null && rand() < lt.tumbleweedChance) this.rollTumbleweed(d, laneRel + this.shipX, 14, true);
    // Mesas on the horizon.
    if (rand() < lt.mesaChance) {
      const side = rand() < 0.5 ? -1 : 1;
      const s = 0.8 + rand() * 1.0;
      this.mesas.spawn(wrap(laneRel + side * (30 + rand() * 40)), 0, d, s, s * (0.7 + rand() * 0.6), s, rand() * 6.28, false, true, 0, 0, false);
    }
    if (this.runStart === null) return; // the title keeps to scenery
    // Rock faces: a wall of tall rock alongside the path for a stretch.
    if (d >= this.nextRockFaceAt && d > this.rockFaceUntil) {
      this.rockFaceSide = rand() < 0.5 ? -1 : 1;
      this.rockFaceUntil = d + range(lt.rockFaceLength);
      this.nextRockFaceAt = this.rockFaceUntil + range(lt.rockFaceSpacing);
    }
    if (d <= this.rockFaceUntil) {
      for (let k = 0; k < 2; k++) {
        const r = 1.4 + rand() * 1.8;
        const height = 4 + rand() * 6;
        const x = laneRel + this.rockFaceSide * (range(lt.rockFaceGap) + jitter + r + k * r * 1.2);
        const hit = r * 0.85;
        if (Math.abs(wrap(x - laneRel)) - hit < LANE + jitter + 1) continue;
        this.rocks.spawn(wrap(x), 0, d + (rand() - 0.5) * STEP, r, height / BOULDER_HEIGHT, r, rand() * Math.PI * 2, true, true, hit, hit, false);
      }
    }
    // A natural arch over the path, pillars well clear of the lane.
    if (d >= this.nextArchAt && biome !== 'ice') {
      this.nextArchAt = d + range(lt.archSpacing);
      this.placeArch(d, laneRel);
    }
  }

  /** A rock arch over the lane (ship-relative x), its pillars solid. */
  private placeArch(d: number, laneRel: number): void {
    const s = 1 + rand() * 0.25;
    this.arches.spawn(wrap(laneRel), 0, d, s, s, s, 0, false, true, 0, 0, false);
    for (const side of [-1, 1]) {
      const px = laneRel + side * ARCH_PILLAR_X * s;
      this.rocks.spawn(wrap(px), 0, d, 1.2 * s, (5.5 * s) / BOULDER_HEIGHT, 1.2 * s, 0, true, true, 1.1 * s, 1.1 * s, false);
    }
  }

  private land(d: number, sub: number, score: number, maxSlope: number): void {
    const lt = TH.land;
    if (this.runStart === null) {
      // Title screen: keep the lane on the ship so a run can start from here.
      this.laneTarget = this.shipX;
    } else if (d >= this.laneRetargetAt) {
      const wander = sub === 2 ? lt.pathWander : TH.lane.landWander;
      this.laneTarget = this.lane + (rand() * 2 - 1) * wander;
      this.laneRetargetAt = d + range([TH.lane.retargetMin, TH.lane.retargetMax]);
    }
    this.lane += clamp(this.laneTarget - this.lane, -maxSlope * STEP, maxSlope * STEP);
    if (this.quiet(d)) return; // clear runway out of the interior and into the canyon

    const laneRel = this.lane - this.shipX;
    // Props are jittered half a row forwards/back, where the lane may have moved.
    const jitter = maxSlope * STEP * 0.5;
    this.landDressing(d, laneRel, jitter);

    if (sub === 2) {
      // Forest path: dense alien forest either side of a clear winding path
      // that follows the lane. The way through is visible from far off.
      const pathHalf = (lt.pathHalfStart - lt.pathHalfMin) * Math.exp(-score / lt.pathRampPoints) + lt.pathHalfMin;
      this.scatter(d, densityAt(score) * lt.forestDensity, laneRel, pathHalf + jitter);
      // Line both edges so the path reads as a path.
      for (let side = -1; side <= 1; side += 2) {
        if (rand() > lt.edgeChance) continue;
        this.pickProp();
        const x = laneRel + side * (pathHalf + jitter + this.propHit + rand() * 0.5);
        this.placeProp(x, d + (rand() - 0.5) * STEP, true);
      }
      return;
    }

    this.scatter(d, densityAt(score) * (sub === 1 ? lt.denseFactor : 1), laneRel, LANE + jitter);
    if (this.genBiome === 'volcanic') this.lavaCrack(d, laneRel, jitter);

    // Level 2: rock clusters, well clear of the lane.
    if (sub === 1 && d >= this.nextFeatureAt) {
      this.nextFeatureAt = d + range(lt.clusterSpacing);
      const centre = (rand() * 2 - 1) * W;
      const size = Math.round(range(lt.clusterSize));
      for (let i = 0; i < size; i++) {
        const r = 0.5 + rand() * 0.6;
        const x = centre + (rand() - 0.5) * 4;
        // Cluster rocks spread ±2 units along the run, where the lane may have moved.
        if (Math.abs(wrap(x - laneRel)) < LANE + maxSlope * 2 + r * 0.8) continue;
        this.obstacle(x + this.shipX, d + (rand() - 0.5) * 4, r, 0.6 + rand() * 1.2, true);
      }
    }
  }

  /** Random open-ground props at `density`, none closer than `clear` (+ their size) to the lane. */
  private scatter(d: number, density: number, laneRel: number, clear: number): void {
    const expected = (density / 100) * SPAN * STEP;
    const tries = Math.ceil(expected * 2);
    const p = tries > 0 ? expected / tries : 0;
    for (let i = 0; i < tries; i++) {
      if (rand() >= p) continue;
      this.pickProp();
      const x = (rand() * 2 - 1) * W;
      if (Math.abs(wrap(x - laneRel)) < clear + this.propHit) continue;
      this.placeProp(x, d + (rand() - 0.5) * STEP, true);
    }
  }

  /** Volcanic plain: a glowing crack in the ground now and then, off the lane (scenery). */
  private lavaCrack(d: number, laneRel: number, jitter: number): void {
    if (rand() > CONFIG.biomes.lavaChance) return;
    const x = (rand() * 2 - 1) * W;
    if (Math.abs(x - laneRel) < LANE + jitter + 0.5) return;
    const len = 1.5 + rand() * 4;
    this.light(x + this.shipX, 0.01, d, 0.15 + rand() * 0.25, 0.01, len, Light.Red, false);
    if (rand() < 0.5) this.light(x + this.shipX + (rand() - 0.5) * 0.8, 0.01, d + len * 0.6, 0.12, 0.01, len * 0.5, Light.Amber, false);
  }

  /** Choose the next open-ground prop's kind and size (sets propKind/propSize/propHit). */
  private pickProp(): void {
    const b = this.genBiome;
    const m = CONFIG.biomes.mix[b === 'ice' || b === 'volcanic' ? b : 'alien'];
    const weights: [Prop, number, number, number][] = [
      // kind, weight, size min, size range
      [Prop.Mushroom, m.mushroom, 0.8, 0.45],
      [Prop.Spire, m.spire, 0.8, 0.4],
      [Prop.Rock, m.rock, 0.5, 0.6],
      [Prop.Crystal, m.crystal, 0.8, 0.5],
      [Prop.Bush, m.bush, 0.8, 0.6],
      [Prop.DeadTree, m.deadTree, 0.8, 0.5],
      [Prop.RockSpire, m.rockSpire, 0.7, 0.6],
      [Prop.Cactus, m.cactus, 0.8, 0.5],
    ];
    let total = 0;
    for (const w of weights) total += w[1];
    let r = rand() * total;
    for (const [kind, w, min, span] of weights) {
      r -= w;
      if (r > 0) continue;
      this.propKind = kind;
      this.propSize = min + rand() * span;
      this.propHit = PROP_HIT[kind] * this.propSize;
      return;
    }
  }

  /** Place the prop chosen by pickProp() at ship-relative `x`. Trees collide at the trunk only. */
  private placeProp(x: number, d: number, wraps: boolean): void {
    const s = this.propSize;
    const h = this.propHit;
    const rot = rand() * Math.PI * 2;
    if (this.propKind === Prop.Rock) {
      this.obstacleRocks.spawn(x, 0, d, s, (0.6 + rand()) / BOULDER_HEIGHT, s, rot, true, wraps, h, h);
    } else {
      const field = this.propField(this.propKind);
      field.spawn(x, 0, d, s, s * (0.85 + rand() * 0.3), s, rot, true, wraps, h, h);
    }
  }
  private propField(kind: Prop): InstancedField {
    switch (kind) {
      case Prop.Mushroom:
        return this.mushrooms;
      case Prop.Spire:
        return this.spires;
      case Prop.Bush:
        return this.bushes;
      case Prop.DeadTree:
        return this.deadTrees;
      case Prop.RockSpire:
        return this.rockSpires;
      case Prop.Cactus:
        return this.cacti;
      default:
        return this.crystals;
    }
  }
  // --- shared path steering --------------------------------------------------

  /** Wind the path centre; slope changes gradually so turns are smooth. */
  private steerCentre(d: number, maxSlope: number): void {
    if (d >= this.cxRetargetAt) {
      this.cxTargetSlope = (rand() * 2 - 1) * maxSlope;
      this.cxRetargetAt = d + 25 + rand() * 35;
    }
    const target = clamp(this.cxTargetSlope, -maxSlope, maxSlope);
    const turn = 0.012 * STEP;
    this.cxSlope += clamp(target - this.cxSlope, -turn, turn);
    this.cx += this.cxSlope * STEP;
  }

  /** Drift towards cx + offset, staying within ±maxOffset of the centre. */
  private moveLane(maxSlope: number, offset: number, maxOffset: number): void {
    // Total movement (riding the centre plus drifting to the target) is capped,
    // so a winding path can't push the lane past the steering budget.
    const target = this.cx + offset;
    const step = maxSlope * STEP;
    this.lane += clamp(target - this.lane, -step, step);
    const m = Math.max(0, maxOffset);
    this.lane = clamp(this.lane, this.cx - m, this.cx + m);
  }

  private retargetOffset(d: number, maxOffset: number): void {
    if (d >= this.laneRetargetAt) {
      this.laneTarget = (rand() * 2 - 1) * Math.max(0, maxOffset) * 0.8;
      this.laneRetargetAt = d + range([TH.lane.retargetMin, TH.lane.retargetMax]);
    }
  }

  // --- canyon ----------------------------------------------------------------

  private canyon(d: number, sub: number, score: number, maxSlope: number): void {
    const c = TH.canyon;
    // A planned split holds the centre line straight, so its upper and lower
    // routes rise and fall about one line.
    this.steerCentre(d, this.splitStart !== Infinity ? 0 : maxSlope * c.centreSlopeFraction);
    this.altNow = null;
    this.floorN = -1;
    let hw = (c.halfWidthStart - c.halfWidthMin) * Math.exp(-score / c.widthRampPoints) + c.halfWidthMin;
    const left = this.themeEnd - d;
    hw = lerp(c.mouthHalfWidth, hw, ease((d - this.themeStart) / c.mouth));
    // The lane may still be far out (it carries on from open ground). The walls
    // never close in past it: they wait while it heads for the middle, rather than
    // shoving it sideways faster than it can move.
    const inMouth = d - this.themeStart < c.mouth;
    hw = Math.max(hw, Math.abs(this.lane - this.cx) + LANE + 0.8);
    hw = lerp(this.interiorHalfWidth(score) + TH.interior.doorExtra, hw, ease(left / c.exit));

    // Split paths: plan one when due (not in the mouth or near the exit).
    const split = this.planSplit(d, hw, maxSlope, left);
    // The walls widen by the island's width either side of it, so each branch
    // keeps the canyon's normal width.
    const widen = split.wall;
    const hwAll = hw + widen;
    const maxOffset = hwAll - (LANE + 0.4);
    const chasm = this.planChasm(d, hw, maxSlope, left, sub);
    if (split.active) {
      // Ride down the middle of our branch.
      this.laneTarget = this.splitSide * (this.splitHalf + hw / 2);
    } else if (left < c.exit + 60) this.laneTarget = 0; // line up with the interior door
    else if (inMouth || Math.abs(this.lane - this.cx) > hw - LANE - 1) this.laneTarget = 0; // head for the middle as the walls close in
    else if (chasm && this.chasmKind === 2) this.laneTarget = -this.chasmSide * Math.min(1.5, maxOffset); // leave room for the fork
    else this.retargetOffset(d, maxOffset);
    this.moveLane(maxSlope, this.laneTarget, maxOffset);
    hw = hwAll;
    this.recordWalls(d, this.cx - hw, this.cx + hw);
    this.elevate(d, left, c.elevation, c.exit + 130, !chasm);
    // Upper and lower routes: once the island is up, one branch climbs and the other dips.
    if (this.liftPending && d >= this.splitStart) {
      this.liftPending = false;
      const L = c.lift;
      let a1 = this.splitStart + 4 + L.ease;
      let b0 = this.splitEnd - 2 - L.ease;
      if (b0 < a1) a1 = b0 = (a1 + b0) / 2;
      terrain.setLift(this.splitStart + 4, a1, b0, this.splitEnd - 2, this.cx, this.splitHalf, L.up, L.down, -this.splitSide);
    }


    // Walls: two staggered inner rocks per side so there are no gaps to slip
    // through, plus tall outer rocks for the canyon sides.
    for (let side = -1; side <= 1; side += 2) {
      for (let k = 0; k < 2; k++) {
        const r = 0.9 + rand() * 0.8;
        this.rock(this.cx + side * (hw + r * 0.65), d + k * STEP * 0.5, r, 1.6 + rand() * 2.6);
      }
      for (let k = 0; k < 2; k++) {
        const r = 1.5 + rand() * 2.2;
        const off = hw + 2 + k * 6 + rand() * 6;
        this.rock(this.cx + side * off, d + (rand() - 0.5) * STEP, r, 4 + rand() * 7);
      }
      // Now and then a huge rock towers over the wall.
      if (rand() < c.cliffChance) {
        const r = 4 + rand() * 3.5;
        this.rock(this.cx + side * (hw + 3 + r), d, r, 12 + rand() * 12);
      }
      // Crystals growing out of the canyon sides (scenery: behind the wall rocks, never hit).
      if (rand() < c.wallCrystals) {
        const s = 1.1 + rand() * 1.1;
        const x = this.cx + side * (hw + 1.4 + rand() * 4) - this.shipX;
        this.crystals.spawn(x, 0, d, s, s * (0.8 + rand() * 0.6), s, rand() * 6.28, false, false, 0, 0, false);
      }
    }

    if (chasm) {
      this.chasmRow(d, hw, maxSlope);
      this.recordFloor(d);
      return; // the chasm is the feature: no floor, so no pebbles or rocks either
    }
    this.recordFloor(d);

    // Alien cacti by the walls (not in the asteroid belt), and tumbleweeds across the floor.
    if (this.genBiome !== 'asteroids') {
      for (const s of [-1, 1]) {
        if (this.splitStart !== Infinity || chasm) break;
        if (rand() >= c.wallCacti) continue;
        const size = 0.8 + rand() * 0.4;
        const x = this.cx + s * (hw - 0.4 - rand() * 0.6);
        const hit = PROP_HIT[Prop.Cactus] * size;
        if (Math.abs(x - this.lane) < LANE + hit + maxSlope * STEP * 0.5 + 0.3) continue;
        this.cacti.spawn(x - this.shipX, 0, d, size, size * (0.85 + rand() * 0.3), size, rand() * 6.28, true, false, hit, hit);
      }
      if (this.runStart !== null && rand() < c.tumbleweedChance) this.rollTumbleweed(d, this.cx, hw, false);
    }

    // Pebbles on the floor: scenery.
    for (let i = 0; i < c.pebblesPerRow; i++) {
      const r = 0.05 + rand() * 0.1; // small and flat: never mistaken for an obstacle
      const x = this.cx + (rand() * 2 - 1) * (hw - 0.3) - this.shipX;
      this.rocks.spawn(x, 0, d + (rand() - 0.5) * STEP, r * 1.4, (r * 0.5) / BOULDER_HEIGHT, r, rand() * 6.28, false, false, 0, 0, false);
    }
    // A natural bridge spanning the canyon overhead (its feet are in the walls).
    if (d >= this.nextBridgeAt && !this.quiet(d)) {
      this.nextBridgeAt = d + range(c.bridgeSpacing);
      const sx = (hw + 1.2) / ARCH_PILLAR_X;
      const sy = 1.3 + rand() * 0.5;
      this.arches.spawn(this.cx - this.shipX, 0, d, sx, sy, 1 + rand() * 0.4, 0, false, false, 0, 0, false);
    }

    if (this.quiet(d)) return;
    if (split.active) {
      this.splitRow(d, hw, split.island, maxSlope);
      return; // the split is the feature
    }

    // Obstacles: dark rocks, laid out so the way through reads from a distance.
    if (d < this.nextFeatureAt) return;
    const jitter = maxSlope * STEP * 0.5;
    if (sub === 0) {
      // Lone boulders.
      this.nextFeatureAt = d + range(c.loneBoulderSpacing);
      const r = 0.9 + rand() * 0.5;
      const x = this.offLane(hw - r, LANE + r * 0.8 + jitter);
      if (x !== null) this.obstacle(x, d, r, 1.2 + rand() * 0.8);
    } else if (sub === 1 || rand() < 0.3) {
      // Rockfall band across the path with one wide gap on the lane.
      this.nextFeatureAt = d + range(c.bandSpacing) * (sub === 2 ? 1.6 : 1);
      this.band(d, hw, c.bandGapWidth / 2 + jitter);
    } else {
      // Pillar slalom: one or two tall pillars off the lane.
      this.nextFeatureAt = d + range(c.pillarSpacing);
      const count = rand() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const r = 0.7 + rand() * 0.3;
        const x = this.offLane(hw - r, LANE + r * 0.8 + jitter + 0.3);
        if (x === null) continue;
        if (rand() < 0.5) {
          this.obstacle(x, d + i * 3, r, 5 + rand() * 4);
        } else {
          // Crystal spire instead of a rock pillar.
          const s = r * 1.5;
          this.crystals.spawn(x - this.shipX, 0, d + i * 3, s, s * 1.4, s, rand() * 6.28, true, false, r * 0.8, r * 0.8);
        }
      }
    }
  }

  /** A row of boulders across the canyon, leaving a gap of half-width `gapHalf` on the lane. */
  private band(d: number, hw: number, gapHalf: number): void {
    let x = this.cx - hw + 0.6;
    while (x < this.cx + hw - 0.4) {
      // Mixed sizes: mostly mid boulders, some small, the odd big one.
      const roll = rand();
      const r = roll < 0.25 ? 0.45 + rand() * 0.2 : roll < 0.85 ? 0.7 + rand() * 0.3 : 1.1 + rand() * 0.4;
      const cxr = x + r;
      if (Math.abs(cxr - this.lane) >= gapHalf + r * 0.8) this.obstacle(cxr, d + (rand() - 0.5) * 0.8, r, r * (1 + rand() * 1.6));
      x += r * 2 + 0.15 + rand() * 0.4;
    }
  }

  /**
   * Split paths. Timeline from splitAt: the walls widen, the lane moves into
   * the middle of its branch, the island rises between the branches for its
   * length, then everything closes up again.
   */
  private planSplit(d: number, hw: number, maxSlope: number, left: number): { active: boolean; wall: number; island: number } {
    const c = TH.canyon;
    if (d >= this.splitAt && this.splitStart === Infinity && this.runStart !== null) {
      const room = left - c.exit - 120;
      const sinceStart = d - this.themeStart;
      if (room > 0 && sinceStart > c.mouth + 30 && hw >= 5.5) {
        this.splitHalf = range(c.splitIsland);
        this.splitSide = this.lane >= this.cx ? 1 : -1;
        // Long enough for the lane to cross to its branch centre at the steering budget.
        const travel = Math.abs(this.splitSide * (this.splitHalf + hw / 2) - (this.lane - this.cx)) + this.splitHalf;
        const lead = Math.max(c.splitWiden, travel / (maxSlope * 0.7)) + 6;
        this.splitStart = d + lead;
        this.splitEnd = this.splitStart + Math.min(range(c.splitLength), room - lead);
        this.altLane = this.cx - this.splitSide * (this.splitHalf + hw / 2);
        this.altTarget = 0;
        this.altPickupsLeft = c.splitAltPickups;
        this.liftPending = true;
        this.altRoutes++;
        // No chasm until well after it.
        this.chasmAt = Math.max(this.chasmAt, this.splitEnd + c.splitWiden + c.splitRejoin + 60);
      } else {
        this.splitAt = d + 40; // try again a bit later
      }
    }
    if (this.splitStart === Infinity) return { active: false, wall: 0, island: 0 };
    const open = this.splitStart - c.splitWiden - 6;
    // After the island, a clear stretch long enough to cross back from the other branch.
    const close = this.splitEnd + c.splitWiden + c.splitRejoin;
    if (d > close + c.splitWiden) {
      // Done: plan the next one.
      this.splitStart = Infinity;
      this.splitEnd = -Infinity;
      this.splitAt = d + range(c.splitSpacing);
      this.nextFeatureAt = Math.max(this.nextFeatureAt, d + 15);
      return { active: false, wall: 0, island: 0 };
    }
    const wall = (this.splitHalf + 0.6) * ease((d - open) / c.splitWiden) * ease((close + c.splitWiden - d) / c.splitWiden);
    const island = this.splitHalf * ease((d - this.splitStart) / 8) * ease((this.splitEnd - d) / 8);
    // From planning to rejoining it's a clear stretch: the lane heads for its branch and nothing
    // else is placed, so crossing to the other branch (and back) is always possible.
    return { active: d <= close, wall, island };
  }

  /** One row of a split: the island, and rocks (and pickups) in the other branch. */
  private splitRow(d: number, hw: number, island: number, maxSlope: number): void {
    const c = TH.canyon;
    const jitter = maxSlope * STEP * 0.5;
    if (island > 0.2) {
      // Island: rock wall rocks across its width. Kept clear of our lane, whatever happens.
      for (let x = -island; x <= island; x += 1.4) {
        const r = Math.min(island, 0.9 + rand() * 0.9);
        const wx = this.cx + x;
        if (Math.abs(wx - this.lane) < LANE + r * 0.8 + jitter) continue;
        // Low, so the other branch (and its pickups) can be seen over it.
        this.rock(wx, d + (rand() - 0.5) * STEP, r, 1.1 + rand() * 1.6);
      }
      // Crystals along the island's spine mark it out as a fork, not a wall.
      if (island > this.splitHalf * 0.6 && rand() < 0.35) {
        const s = 0.9 + rand() * 0.8;
        const wx = this.cx + (rand() - 0.5) * island;
        if (Math.abs(wx - this.lane) > LANE + s + jitter) this.crystals.spawn(wx - this.shipX, 0, d, s, s * (1 + rand() * 0.6), s, rand() * 6.28, true, false, s * 0.45, s * 0.45);
      }
    }
    // The other branch: its own line wanders a little, and rocks stay off it.
    const branchCentre = this.cx - this.splitSide * (this.splitHalf + (hw - this.splitHalf - 0.6) / 2);
    if (rand() < 0.08) this.altTarget = (rand() * 2 - 1) * 1.2;
    this.altLane += clamp(branchCentre + this.altTarget - this.altLane, -maxSlope * STEP * 0.6, maxSlope * STEP * 0.6);
    if (d >= this.splitStart && d <= this.splitEnd) this.altNow = this.altLane;
    if (d < this.splitStart || d > this.splitEnd) return;
    if (rand() < c.splitAltRocks) {
      const r = 0.55 + rand() * 0.45;
      const lo = this.cx - this.splitSide * (island + 0.4);
      const hi = this.cx - this.splitSide * (hw - 0.4);
      const x = lo + (hi - lo) * rand();
      if (Math.abs(x - this.altLane) >= LANE + r * 0.8 + jitter && Math.abs(x - this.lane) >= LANE + r * 0.8 + jitter) {
        this.obstacle(x, d, r, 0.9 + rand() * 1.2);
      }
    }
    // Bonus pickups down the other branch's line: the reward for taking it.
    const mid = (this.splitStart + this.splitEnd) / 2;
    if (this.altPickupsLeft > 0 && d >= mid - this.altPickupsLeft * 6) {
      this.altPickupsLeft--;
      this.pickups.spawn(this.altLane - this.shipX, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, false, 0, 0);
    }
  }

  // --- elevation -------------------------------------------------------------

  /**
   * Ramps, platforms and drops: every so often the floor climbs, holds, then
   * drops back or ramps down, between `min` and `max` of where this theme
   * began. `returnBefore` units from the end it heads back there, so the next
   * theme starts level. Heights are looks only (see terrain.ts).
   */
  private elevate(d: number, left: number, E: ElevationConfig, returnBefore: number, allowed: boolean): void {
    if (this.runStart === null) return;
    if (left < returnBefore) {
      if (this.levelReturned) return;
      this.levelReturned = true;
      const back = this.themeLevel - terrain.level;
      if (Math.abs(back) > 0.01) terrain.addStep(d, d + Math.max(16, Math.abs(back) * E.returnSlope), back);
      return;
    }
    if (d < this.nextStepAt || !allowed) return;
    const lvl = terrain.level - this.themeLevel;
    const up = lvl < E.min + 1 ? true : lvl > E.max - 1.5 ? false : rand() < 0.5;
    let delta: number;
    let len: number;
    if (up) {
      delta = Math.min(range(E.rise), E.max - lvl);
      len = range(E.riseLength);
    } else if (rand() < E.dropChance) {
      // A drop: short and steep.
      delta = -Math.min(range(E.drop), lvl - E.min);
      len = range(E.dropLength);
    } else {
      delta = -Math.min(range(E.rise), lvl - E.min);
      len = range(E.riseLength);
    }
    if (Math.abs(delta) > 0.3) terrain.addStep(d, d + len, delta);
    this.nextStepAt = d + len + range(E.spacing); // the platform between
  }

  // --- chasms -----------------------------------------------------------------

  private inChasm(d: number): boolean {
    return d >= this.chasmStart && d <= this.chasmEnd;
  }

  /**
   * Chasms: the canyon floor falls away and a bridge carries the lane across.
   * Kinds: a railed rope bridge; a wide bridge with stretches of planks gone
   * (off the lane, so it weaves); a bridge that forks, the second branch
   * swinging out and back with pickups on it. Some climb or dip as they go.
   * Off the planks you fall. Returns true for rows inside one.
   */
  private planChasm(d: number, hw: number, maxSlope: number, left: number, sub: number): boolean {
    const c = TH.canyon;
    const C = c.chasm;
    if (this.chasmEnd !== -Infinity && d > this.chasmEnd + 10) {
      this.chasmStart = Infinity;
      this.chasmEnd = -Infinity;
      this.chasmAt = d + range(C.spacing);
    }
    if (d >= this.chasmAt && this.chasmStart === Infinity && this.runStart !== null) {
      const ok = this.splitStart === Infinity && left > c.exit + 200 && d - this.themeStart > c.mouth + 40 && hw >= 4.5;
      if (!ok) {
        this.chasmAt = d + 30; // try again a bit later
        return false;
      }
      const r = rand();
      let kind = sub === 0 ? 0 : sub === 1 ? (r < 0.5 ? 1 : 0) : r < 0.4 ? 2 : r < 0.75 ? 1 : 0;
      // The fork needs room for both bridges.
      const avail = hw - C.bridgeHalf - 0.8;
      if (kind === 2 && avail < C.splitOffset * 0.7) kind = 1;
      this.chasmKind = kind;
      let len = range(C.length);
      if (kind === 2) {
        this.chasmSide = this.lane >= this.cx ? -1 : 1;
        this.chasmOff = Math.min(C.splitOffset, avail + 1.5);
        // Long enough that swinging out and back is well within steering.
        len = Math.max(range(C.splitLength), (this.chasmOff * Math.PI) / (maxSlope * 1.4));
        this.chasmPickups = C.altPickups;
        this.altRoutes++;
      }
      this.chasmStart = d + 12;
      this.chasmEnd = this.chasmStart + len;
      this.holeAt = this.chasmStart + 4;
      this.holeUntil = -Infinity;
      // The ground drops away a little inside the first and last planks, so the bridge
      // rests on solid ground at each end instead of hovering over the start of the drop.
      terrain.addPit(this.chasmStart + CHASM_INSET, this.chasmEnd - CHASM_INSET);
      // Some bridges climb or dip on their way across.
      if (kind !== 2 && rand() < C.riseChance) {
        const lvl = terrain.level - this.themeLevel;
        const E = c.elevation;
        const delta = (lvl < E.max - 3 && rand() < 0.6 ? 1 : -1) * (1.5 + rand() * 1.5);
        terrain.addStep(this.chasmStart + 4, this.chasmEnd - 4, delta);
      }
      this.nextStepAt = Math.max(this.nextStepAt, this.chasmEnd + 25);
      this.splitAt = Math.max(this.splitAt, this.chasmEnd + 90);
    }
    return this.inChasm(d);
  }

  /** One row of a chasm: the bridge decks (the only floor), rails, posts and supports. */
  private chasmRow(d: number, hw: number, maxSlope: number): void {
    const C = TH.canyon.chasm;
    const P = CONFIG.terrain.pitDepth;
    const bh = C.bridgeHalf;
    const jitter = maxSlope * STEP * 0.5;
    const wallL = this.cx - hw + 0.3;
    const wallR = this.cx + hw - 0.3;
    const row = Math.round(d / STEP);
    const t = (d - this.chasmStart) / (this.chasmEnd - this.chasmStart);
    const segs: [number, number, boolean, boolean][] = []; // x0, x1, rail on the left, rail on the right
    if (this.chasmKind === 1) {
      // Wide planks with stretches missing on one side, never across the lane.
      let x0 = Math.max(wallL, this.lane - C.wideHalf);
      let x1 = Math.min(wallR, this.lane + C.wideHalf);
      if (d >= this.holeAt && d > this.holeUntil) {
        this.holeUntil = d + range(C.holeLength);
        this.holeAt = this.holeUntil + range(C.holeGap);
        this.holeSide = rand() < 0.5 ? -1 : 1;
      }
      const broken = d <= this.holeUntil && rand() < 0.92;
      const clear = LANE + jitter + 0.35;
      if (broken && this.holeSide < 0) x0 = Math.max(x0, this.lane - clear);
      if (broken && this.holeSide > 0) x1 = Math.min(x1, this.lane + clear);
      segs.push([x0, x1, !(broken && this.holeSide < 0), !(broken && this.holeSide > 0)]);
    } else {
      segs.push([this.lane - bh, this.lane + bh, true, true]);
      if (this.chasmKind === 2) {
        const alt = clamp(this.lane + this.chasmSide * this.chasmOff * Math.sin(Math.PI * t), wallL + bh, wallR - bh);
        this.altNow = alt;
        if (Math.abs(alt - this.lane) < bh * 2 + 0.2) {
          // Still joined: one wide deck.
          segs[0] = [Math.min(alt, this.lane) - bh, Math.max(alt, this.lane) + bh, true, true];
        } else {
          segs.push([alt - bh, alt + bh, true, true]);
        }
        // The fork's reward: pickups out on the far branch.
        if (this.chasmPickups > 0 && t > 0.35 && row % 3 === 0) {
          this.chasmPickups--;
          this.pickups.spawn(alt - this.shipX, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, false, 0, 0);
        }
      }
    }
    this.floorBeginRow();
    // Where each deck's edges were last row, so planks and rails turn to follow the bridge.
    const joined = Math.abs(this.railPrevD - (d - STEP)) < 0.5;
    segs.forEach(([x0, x1, railL, railR], si) => {
      this.floorSeg(x0, x1);
      const prev = joined && si < this.railPrevN ? [this.railPrev[si * 2], this.railPrev[si * 2 + 1]] : [x0, x1];
      // The bridge's drift this row: from the edges that moved smoothly. An edge that
      // jumps (planks missing from here on, or back again) isn't a bend.
      const moves = [x0 - prev[0], x1 - prev[1]].filter((v) => Math.abs(v) < BRIDGE_JUMP);
      const drift = moves.length ? moves.reduce((t, v) => t + v, 0) / moves.length : 0;
      const turn = Math.atan2(-drift, STEP);
      // Planks butted together (alternating shades show the boards), square to the bridge.
      this.greebles.nextColor = row % 2 === 0 ? Decor.Wood : Decor.WoodDark;
      this.greebles.nextTilt = true;
      this.greebles.spawn((x0 + x1) / 2 - this.shipX, -0.12, d, x1 - x0, 0.12, STEP + 0.04, turn, false, false, 0, 0, false);
      for (const [x, s, rail, prevX] of [[x0, -1, railL, prev[0]], [x1, 1, railR, prev[1]]] as const) {
        // Where the edge jumped, its rail starts afresh rather than angling across.
        const px = Math.abs(x - prevX) < BRIDGE_JUMP ? prevX : x;
        if (rail) {
          // Each rail piece runs from last row's rail point to this row's, leaning with
          // the slope, so the rope is one unbroken line however the bridge winds.
          const len = Math.hypot(x - px, STEP);
          this.pipes.nextColor = Decor.Rope;
          this.pipes.nextTilt = true;
          this.pipes.spawn((x + px) / 2 - this.shipX, C.railHeight, d - STEP / 2, 0.05, 0.05, len + 0.08, Math.atan2(-(x - px), STEP), false, false, 0, 0, false);
          if (row % 3 === 0) {
            this.greebles.nextColor = Decor.WoodDark;
            this.greebles.spawn(x - s * 0.05 - this.shipX, 0, d, 0.12, C.railHeight + 0.15, 0.12, 0, false, false, 0, 0, false);
          }
        }
        // Supports down into the dark.
        if (row % 6 === 0) {
          this.greebles.nextColor = Decor.WoodDark;
          this.greebles.spawn(x - s * 0.2 - this.shipX, -P, d, 0.25, P - 0.2, 0.25, 0, false, false, 0, 0, false);
        }
      }
      if (si < this.railPrev.length / 2) {
        this.railPrev[si * 2] = x0;
        this.railPrev[si * 2 + 1] = x1;
      }
    });
    this.railPrevD = d;
    this.railPrevN = Math.min(segs.length, this.railPrev.length / 2);
    // The chasm's sides under the canyon walls. Each row's slab starts at this row's
    // wall line and reaches back over the last row's, so a winding wall leaves no gaps.
    const first = d - this.chasmStart < STEP;
    for (const s of [-1, 1]) {
      const inner = this.cx + s * hw;
      const prev = s < 0 ? this.chasmWallL : this.chasmWallR;
      const thick = 3 + (first ? 0 : Math.abs(inner - prev));
      this.greebles.nextColor = Decor.Cliff;
      this.greebles.spawn(inner + (s * thick) / 2 - this.shipX, -P, d, thick, P, STEP + 0.12, 0, false, false, 0, 0, false);
      if (s < 0) this.chasmWallL = inner;
      else this.chasmWallR = inner;
    }
    // A lip of rock along each rim, either side of the bridge.
    if (first || this.chasmEnd - d < STEP) {
      const edge = first ? this.chasmStart + CHASM_INSET - 0.25 : this.chasmEnd - CHASM_INSET + 0.25;
      const lip = (x0: number, x1: number) => {
        this.greebles.nextColor = Decor.Cliff;
        this.greebles.spawn((x0 + x1) / 2 - this.shipX, -0.6, edge, x1 - x0, 0.62, 0.5, 0, false, false, 0, 0, false);
      };
      let from = wallL - 0.5;
      for (const [x0, x1] of [...segs].sort((a, b) => a[0] - b[0])) {
        if (x0 - from > 0.2) lip(from, x0);
        from = Math.max(from, x1);
      }
      if (wallR + 0.5 - from > 0.2) lip(from, wallR + 0.5);
    }
    if (d - this.chasmStart < STEP || this.chasmEnd - d < STEP) {
      for (let x = wallL; x <= wallR; x += 1.1) {
        if (segs.some(([x0, x1]) => x > x0 - 0.4 && x < x1 + 0.4)) continue;
        const r = 0.3 + rand() * 0.35;
        this.rocks.spawn(x - this.shipX, -0.1, d, r * 1.6, (r * 0.6) / BOULDER_HEIGHT, r, rand() * 6.28, false, false, 0, 0, false);
      }
    }
  }

  /** Start this row's floor list (anything not covered is a drop). */
  private floorBeginRow(): void {
    this.floorN = 0;
  }

  private floorSeg(x0: number, x1: number): void {
    if (this.floorN >= 6 || x1 <= x0) return;
    this.floorSegs[this.floorN * 2] = x0;
    this.floorSegs[this.floorN * 2 + 1] = x1;
    this.floorN++;
  }

  /** A tumbleweed that rolls across ahead of you, `half` either side of world x `centre`. Scenery. */
  private rollTumbleweed(d: number, centre: number, half: number, wraps: boolean): void {
    const T = CONFIG.tumbleweed;
    const dir = rand() < 0.5 ? -1 : 1;
    const s = range(T.size);
    // It starts off to one side and has rolled across by the time you reach it,
    // staying between the walls (half: how far either side of centre it may go).
    const travel = Math.min(range(T.travel), Math.max(0, 2 * (half - s * 0.6)));
    const from = centre - (dir * travel) / 2;
    this.tumbleweeds.setNextRamp(dir * travel, range(T.over), 0, false);
    this.tumbleweeds.spawn(from - this.shipX, 0.5 * s, d, s, s, s, 0, false, wraps, 0, 0, false);
  }

  /** Remember the lane after each row (for the dev autopilot). */
  private rowLane(d: number): void {
    // Called at the start of the next row, so it stores the previous row's lane.
    const slot = (((Math.round(this.laneLogD / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    if (this.laneLogD !== -Infinity) {
      this.laneRingD[slot] = this.laneLogD;
      this.laneRing[slot] = this.lane;
    }
    this.laneLogD = d;
  }

  /** Dev: the safe lane at distance `d` (world x), or null if it isn't known. */
  laneAt(d: number): number | null {
    const slot = (((Math.round(d / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    return Math.abs(this.laneRingD[slot] - d) <= STEP ? this.laneRing[slot] : null;
  }

  private laneLogD = -Infinity;
  private readonly laneRingD = new Float64Array(FLOOR_ROWS).fill(-Infinity);
  private readonly laneRing = new Float32Array(FLOOR_ROWS);

  /** Random x within cx ± halfRange at least `clear` from the lane, or null. */
  private offLane(halfRange: number, clear: number): number | null {
    for (let t = 0; t < 6; t++) {
      const x = this.cx + (rand() * 2 - 1) * halfRange;
      if (Math.abs(x - this.lane) >= clear) return x;
    }
    return null;
  }
  // --- interior --------------------------------------------------------------
  // A chain of rooms (interior.ts) joined by corridors. The world draws the
  // shell, tapers the width between rooms, and steers the lane; each room's
  // build() places its obstacles through this.api.

  private interiorHalfWidth(score: number): number {
    const it = TH.interior;
    return (it.halfWidthStart - it.halfWidthMin) * Math.exp(-score / it.widthRampPoints) + it.halfWidthMin;
  }

  /** The piece for the next room (or corridor) slot, or null to use the room template. */
  private choosePiece(next: RoomId, sub: number): Piece | null {
    if (this.devPieces.length) {
      const p = pieceById(this.devPieces[this.devPieceNext % this.devPieces.length]);
      if (!p || (p.family === 'corridor') !== (next === 'corridor')) return null;
      this.devPieceNext++;
      return p;
    }
    if (next === 'corridor') return this.runStart !== null && rand() < TH.interior.corridorPieceChance ? pickPiece('corridor', sub) : null;
    return FAMILIES.has(next) ? pickPiece(next, sub) : null;
  }

  /**
   * Start a hand-made piece at d: a lead-in that narrows or widens from the
   * corridor and steers the lane onto the piece's entry, the piece itself row
   * by row, and a lead-out back to the corridor. The centre line holds
   * straight throughout, so the grid stays lined up. Returns false (and does
   * nothing) if it doesn't fit before the theme ends.
   */
  private startPiece(piece: Piece, d: number, base: number, maxSlope: number): boolean {
    const it = TH.interior;
    const parsed = parse(piece);
    const main = piece.routes.find((r) => r.tag === 'main')!;
    const entry = main.points[0][1];
    const exit = main.points[main.points.length - 1][1];
    const rows = parsed.rows;
    const reach = maxSlope * 0.6;
    const lead = Math.max(it.taperMin, Math.abs(this.lane - (this.cx + entry)) / reach + 4, Math.abs(rows[0].hw - base) * 2);
    const leadRows = Math.ceil(lead / STEP);
    const start = d + leadRows * STEP;
    const end = start + (rows.length - 1) * STEP;
    const out = Math.max(it.taperMin, Math.abs(exit) / reach + 4, Math.abs(rows[rows.length - 1].hw - base) * 2);
    if (end + out > this.themeEnd - TH.lane.beforeChange - 10) return false;
    this.piece = parsed;
    this.pieceStart = start;
    this.pieceEnd = end;
    this.room = piece.family;
    this.roomStart = d;
    this.roomEnd = end + out;
    this.roomTaper = 0;
    this.roomHw = rows[0].hw;
    this.roomH = piece.height;
    this.roomSide = 1;
    this.roomShift = 0;
    this.shiftLen = 0;
    this.shiftDone = 1;
    this.plan = null;
    this.roomOffset = null;
    this.cxSlope = this.cxTargetSlope = 0;
    this.cxRetargetAt = Infinity;
    this.api.memo = this.api.memo2 = 0;
    this.api.memoAt = start;
    this.api.seed = rand();
    this.api.start = start;
    this.api.end = end;
    this.api.taper = 0;
    this.api.stage = 0;
    this.framePending = true;
    this.logRoom(d, piece.family);
    // Its ramps and lifts.
    for (const o of piece.overlays ?? []) {
      if (o.kind === 'step') terrain.addStep(start + o.at * STEP, start + (o.at + o.rows) * STEP, o.rise);
    }
    return true;
  }

  /**
   * The current piece at row d: sets the lane (onto the main route) and the
   * routes for the tests, and returns the walls, height and floor here, and
   * the grid row (-1 in the lead-in and lead-out).
   */
  private pieceRowAt(d: number, base: number, maxSlope: number): { hw: number; H: number; r: number; floor: [number, number][] | null; catwalk: boolean } {
    const p = this.piece!;
    const rows = p.rows;
    const it = TH.interior;
    const main = p.piece.routes.find((rt) => rt.tag === 'main')!;
    const margin = LANE + 0.3;
    this.routesNow = [];
    if (d < this.pieceStart - 0.01) {
      // Lead-in: taper to the first row and steer onto the entry.
      const t = ease((d - this.roomStart) / Math.max(1, this.pieceStart - this.roomStart));
      const entry = main.points[0][1];
      const hw = Math.max(lerp(base, rows[0].hw, t), Math.abs(this.lane - this.cx) + margin, Math.abs(entry) + margin);
      this.moveLane(maxSlope, entry, hw - margin);
      return { hw, H: lerp(it.wallHeight, p.piece.height, t), r: -1, floor: null, catwalk: false };
    }
    if (d <= this.pieceEnd + 0.01) {
      const r = Math.max(0, Math.min(rows.length - 1, Math.round((d - this.pieceStart) / STEP)));
      this.lane = this.cx + routeX(main, r);
      this.routesNow = p.piece.routes.map((rt) => this.cx + routeX(rt, r));
      const row = rows[r];
      const floor = row.floor ? row.floor.map(([a, b]): [number, number] => [this.cx + a, this.cx + b]) : null;
      return { hw: row.hw, H: p.piece.height, r, floor, catwalk: row.catwalk };
    }
    // Lead-out: back to the corridor and the middle.
    const t = ease((d - this.pieceEnd) / Math.max(1, this.roomEnd - this.pieceEnd));
    const hw = Math.max(lerp(rows[rows.length - 1].hw, base, t), Math.abs(this.lane - this.cx) + margin);
    this.moveLane(maxSlope, 0, hw - margin);
    return { hw, H: lerp(p.piece.height, it.wallHeight, t), r: -1, floor: null, catwalk: false };
  }

  /** Everything that starts on grid row r of the current piece. */
  private pieceBuild(r: number, d: number, H: number): void {
    const p = this.piece!;
    const api = this.api;
    for (const b of p.blocks) if (b.r0 === r && b.part !== 'wall') this.pieceBlock(b, d, H);
    for (const o of p.piece.overlays ?? []) {
      if (o.at !== r) continue;
      if (o.kind === 'hook') api.hook(this.cx + (o.x[0] + o.x[1]) / 2, (o.x[1] - o.x[0]) / 2, this.cx + o.arrive, d);
      else if (o.kind === 'slider') api.slider(this.cx + (o.x[0] + o.x[1]) / 2, (o.x[1] - o.x[0]) / 2, this.cx + o.arrive, d, o.w, o.h, o.depth);
      else if (o.kind === 'holo') api.holo(this.cx + o.x, o.y, d, o.w, o.h);
      else if (o.kind === 'drip') api.pour(this.cx + o.x, d, 0.08, 1, false);
      else if (o.kind === 'door') api.door(d, this.cx + o.x, o.half);
      else if (o.kind === 'debris') api.debris(this.cx + o.x, d, o.w, 0.8, 1.0, 12);
      else if (o.kind === 'fan') api.bigFan(this.cx + o.x, o.y, d, o.size);
      else if (o.kind === 'steam') api.steam(this.cx + o.x, o.y, d, o.h);
      else if (o.kind === 'sparks') api.sparks(this.cx + o.x, o.y, d);
    }
    // Water across a flooded row.
    if (p.rows[r].water) api.water(this.cx, -0.45, d, p.rows[r].hw * 2);
    // Dev: the routes, as lines on the floor.
    if (this.showRoutes) {
      const colour = { main: Light.White, alt: Light.Teal, risky: Light.Amber } as const;
      for (const rt of p.piece.routes) this.light(this.cx + routeX(rt, r), 0.03, d, 0.12, 0.02, STEP, colour[rt.tag], false);
    }
    // Pickups down rewarded routes, where they've parted from the main one.
    const main = p.piece.routes.find((rt) => rt.tag === 'main')!;
    if (r % 3 === 0) {
      for (const rt of p.piece.routes) {
        if (rt.reward !== 'pickups') continue;
        const x = routeX(rt, r);
        if (Math.abs(x - routeX(main, r)) > 2) this.pickups.spawn(this.cx + x - this.shipX, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, false, 0, 0);
      }
    }
  }

  /** One merged solid block of a piece, drawn as its part. */
  private pieceBlock(b: Block, d: number, H: number): void {
    const n = b.r1 - b.r0 + 1;
    const depth = n * STEP - 0.2;
    const dc = d + ((n - 1) * STEP) / 2;
    const w = b.x1 - b.x0;
    const x = this.cx + (b.x0 + b.x1) / 2;
    const vary = (k: number) => {
      const v = Math.sin((b.x0 * 13.1 + b.r0 * 7.7 + k) * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    switch (b.part) {
      case 'divider':
        this.hullBox(x, 0, dc, w, H, depth, true);
        break;
      case 'pillar':
        this.hullBox(x, 0, dc, w, H, depth, true, true);
        break;
      case 'crate':
      case 'stack': {
        const h = b.part === 'crate' ? 0.9 : 1.8 + Math.floor(vary(1) * 2) * 0.9;
        this.blocks.spawn(x - this.shipX, 0, dc, w, h, depth, 0, true, false, w / 2, depth / 2);
        break;
      }
      case 'rack': {
        this.hullBox(x, 0, dc, w, H - 0.7, depth, true, true);
        const colour = vary(2) < 0.7 ? Light.Teal : Light.Amber;
        this.light(x - w / 2 - 0.02, 1.1 + vary(3) * 0.8, dc, 0.04, 0.06, depth * 0.8, colour, false);
        this.light(x + w / 2 + 0.02, 0.9 + vary(4) * 0.8, dc, 0.04, 0.06, depth * 0.8, colour, false);
        break;
      }
      case 'console':
        this.hullBox(x, 0, dc, w, 0.85, depth, true, true);
        this.light(x, 0.86, dc, w - 0.1, 0.03, depth * 0.7, Light.Teal, false);
        break;
      case 'tank':
        for (let k = 0; k < Math.round(w); k++) {
          for (let j = 0; j < n; j += 2) this.api.tank(this.cx + b.x0 + k + 0.5, d + j * STEP, 0.45, Math.min(H - 0.3, 2.6));
        }
        break;
      case 'tree':
        // A planter the length of the block, a tree every other row.
        this.blocks.spawn(x - this.shipX, 0, dc, w, 0.35, depth, 0, true, false, w / 2, depth / 2);
        for (let j = 0; j < n; j += 2) this.api.tree(x, d + j * STEP, 0.75 + vary(5 + j) * 0.35);
        break;
      case 'laser':
        // Posts at each end and two beams between, every row of the block.
        for (let j = 0; j < n; j++) {
          const dj = d + j * STEP;
          this.light(x, 0.28, dj, w, 0.07, 0.12, Light.Red, true);
          this.light(x, 0.62, dj, w, 0.05, 0.1, Light.Red, true);
          this.hullBox(this.cx + b.x0 + 0.12, 0, dj, 0.24, 1.1, 0.3, true, true);
          this.hullBox(this.cx + b.x1 - 0.12, 0, dj, 0.24, 1.1, 0.3, true, true);
        }
        break;
      case 'core':
        this.hullBox(x, 0, dc, w, H - 0.4, depth, true, false);
        for (let j = 0; j < n; j += 2) this.light(x, 1.2, d + j * STEP, w + 0.06, 0.16, 0.4, Light.Teal, false);
        break;
      case 'shuttle':
        this.api.shuttle(x, dc, vary(6) < 0.3);
        break;
      case 'vent':
        for (let k = 0; k < Math.round(w); k++) {
          for (let j = 0; j < n; j++) this.api.vent(this.cx + b.x0 + k + 0.5, d + j * STEP, 0.45, CONFIG.themes.interior.rooms.vents.period);
        }
        break;
      case 'coolant':
      case 'molten':
        for (let j = 0; j < n; j++) this.api.pour(x, d + j * STEP, w, b.part === 'coolant' ? 0 : 2, true);
        break;
      case 'debris':
        this.hullBox(x, 0, dc, w, 0.5 + vary(7) * 0.5, depth, true, true);
        break;
      default:
        break;
    }
  }

  private startRoom(id: RoomId, d: number, base: number, maxSlope: number, jog = true): void {
    this.piece = null;
    const it = TH.interior;
    const def = ROOMS[id];
    const vary = def.vary !== false && id !== 'corridor';
    // Split rooms bring their own layout, mirrored at random (but usually
    // towards the side the lane is already on, so it has less to cross).
    const plan = def.plan ? def.plan(base) : null;
    const towards = this.lane >= this.cx ? 1 : -1;
    const side = plan && rand() < 0.25 ? -towards : towards;
    let roomHw: number;
    if (plan) {
      roomHw = plan.halfWidth;
    } else {
      const extra = def.extraWidth(base);
      roomHw = Math.max(2.2, base + (vary && extra > 1 ? extra * range(it.sizeVariation) : extra));
    }
    const offset = plan ? plan.offset : def.laneOffset ? def.laneOffset(base) : null;

    // Every room (and some corridors) shifts the centre line sideways: an S-bend.
    const dir = rand() < 0.5 ? -1 : 1;
    let shift = 0;
    if (id !== 'corridor') shift = dir * range(it.roomShift);
    else if (jog && rand() < it.corridorJogChance) shift = dir * range(it.corridorJog);

    // Tapers long enough for the lane to follow the shift and reach its
    // offset (or come back from its widest wander before the exit).
    const reachOut = offset !== null ? Math.abs(offset) : Math.min(Math.max(0, roomHw - base), it.wanderExtra);
    const need = (Math.abs(shift) + reachOut) / (maxSlope * 0.6);
    const taper = id === 'corridor' ? 0 : Math.max(it.taperMin, need);
    let len = Math.max(roomLength(id), taper * 2 + 15);
    if (id === 'corridor') len = Math.max(len, Math.abs(shift) / (maxSlope * 0.6) + 6);
    if (d + len > this.themeEnd - TH.lane.beforeChange - 10) {
      if (id !== 'corridor' || shift !== 0) {
        // No space left before the theme ends: a straight corridor to the exit.
        this.startRoom('corridor', d, base, maxSlope, false);
        this.roomEnd = Infinity;
        return;
      }
    }
    this.room = id;
    this.roomStart = d;
    this.roomEnd = d + len;
    this.roomTaper = taper;
    this.roomHw = roomHw;
    this.roomH = def.height * (vary ? range(it.heightVariation) : 1);
    this.roomSide = side;
    this.roomShift = shift;
    this.shiftLen = id === 'corridor' ? len : taper;
    this.shiftDone = 0;
    this.plan = plan
      ? {
          halfWidth: plan.halfWidth,
          dividers: plan.dividers.map((v) => v * side),
          dividerHalf: plan.dividerHalf,
          branches: plan.branches.map((v) => v * side),
          offset: plan.offset * side,
        }
      : null;
    this.roomOffset = offset === null ? null : side * offset;
    this.api.memo = 0;
    this.api.memo2 = 0;
    this.api.memoAt = d + taper;
    this.api.start = d;
    this.api.end = d + len;
    this.api.taper = taper;
    this.api.stage = 0;
    this.api.seed = rand();
    this.nextFeatureAt = d + taper + 4;
    this.framePending = true;
    this.logRoom(d, id);
  }

  private interior(d: number, sub: number, score: number, maxSlope: number): void {
    const it = TH.interior;
    const base = this.interiorHalfWidth(score);
    const wallT = 1;
    if (this.entrancePending) {
      // Hull face with a door, so the canyon ends at the ship.
      this.entrancePending = false;
      this.buildFacade(d, base + it.doorExtra);
      this.startRoom('corridor', d, base, maxSlope, false);
    } else if (d >= this.roomEnd) {
      let next: RoomId = 'corridor';
      let named: Piece | undefined;
      if (this.room === 'corridor') {
        // A course's rooms come round again rather than falling back to random ones.
        if (this.roomQueue.length === 0 && this.roomScript.length > 0) this.roomQueue = [...this.roomScript];
        const entry = this.devRoom ?? this.roomQueue.shift() ?? pickRoom(sub, this.lastRoom);
        // A course names a piece by id, or just a room family.
        named = pieceById(entry);
        next = named ? named.family : (entry as RoomId);
      }
      else this.lastRoom = this.room;
      const piece = named ?? this.choosePiece(next, sub);
      if (!piece || !this.startPiece(piece, d, base, maxSlope)) this.startRoom(next, d, base, maxSlope);
    }

    const def = ROOMS[this.room];
    const taper = this.roomTaper;
    const open = taper > 0 ? ease(Math.min((d - this.roomStart) / taper, (this.roomEnd - d) / taper)) : 1;
    let hw = lerp(base, this.room === 'corridor' ? base : this.roomHw, open);
    let H = lerp(it.wallHeight, this.room === 'corridor' ? it.wallHeight : this.roomH, open);
    // A hand-made piece sets its own walls, height, floor and lane.
    const pr = this.piece ? this.pieceRowAt(d, base, maxSlope) : null;
    if (pr) {
      hw = pr.hw;
      H = pr.H;
    }
    this.recordWalls(d, this.cx - hw, this.cx + hw);
    this.elevate(d, this.themeEnd - d, it.elevation, 170, !def.ownSteps && !pr);

    // Centre line: the room's sideways shift (an S-bend) first; winding only once it's done.
    const s = this.shiftLen > 0 ? ease((d - this.roomStart) / this.shiftLen) : 1;
    if (this.roomShift !== 0 && s < 1) {
      this.cx += this.roomShift * (s - this.shiftDone);
      this.shiftDone = s;
      this.cxSlope = this.cxTargetSlope = 0;
    } else {
      if (this.shiftDone < 1 && this.roomShift !== 0) {
        this.cx += this.roomShift * (1 - this.shiftDone);
        this.shiftDone = 1;
      }
      this.steerCentre(d, pr ? 0 : maxSlope * it.centreSlopeFraction * def.wander);
    }

    const api = this.api;
    api.d = d;
    api.score = score;
    api.sub = sub;
    api.jitter = maxSlope * STEP * 0.5;
    api.maxSlope = maxSlope;
    api.cx = this.cx;
    api.hw = hw;
    api.H = H;
    api.side = this.roomSide;
    api.plan = this.plan;
    api.progress = (d - this.roomStart - taper) / Math.max(1, this.roomEnd - this.roomStart - 2 * taper);

    // Lane: fixed offset (around a core, down a branch), a swinging target
    // (chicane), or free wander; always back to the middle before the exit.
    const margin = LANE + 0.3;
    const exiting = this.roomEnd - d < taper + 8;
    const swing = def.laneTarget && !exiting ? def.laneTarget(api) : null;
    if (pr) {
      // The piece has set the lane.
    } else if (this.roomOffset !== null) {
      this.moveLane(maxSlope, this.roomOffset * open, hw - margin);
    } else if (swing !== null) {
      this.moveLane(maxSlope, swing, hw - margin);
    } else {
      // In wide rooms the lane stays within a few units of the corridor line,
      // so the room around it fills with obstacles and the exit stays close.
      const reach = Math.min(hw, base + it.wanderExtra) - margin;
      if (exiting) this.laneTarget = 0;
      else this.retargetOffset(d, reach);
      this.moveLane(maxSlope, this.laneTarget, reach);
    }
    api.lane = this.lane;

    // Floor: solid, or (gantry, breach) a custom floor with pits in the room body.
    const inBody = d >= this.roomStart + taper && d <= this.roomEnd - taper && !this.quiet(d);
    api.row++;
    this.floorN = -1;
    if (pr) {
      if (pr.floor) {
        this.floorN = 0;
        for (const [a, b] of pr.floor) this.floorSeg(a, b);
      }
    } else if (def.floor && inBody) def.floor(api);
    const pit = this.floorN >= 0;
    const P = it.pitDepth;
    this.recordFloor(d);

    // Shell
    const depth = STEP + 0.12;
    const span = 2 * hw + 2 * wallT;
    for (let k = -1; k <= 1; k += 2) {
      // Each segment's inner face sits on this row's wall line and it extends
      // outwards far enough to cover where the previous row's wall was, so
      // tapers and S-bends never open a diagonal gap between rows.
      const inner = this.cx + k * hw;
      const prev = k < 0 ? this.prevWallL : this.prevWallR;
      const step = Number.isNaN(prev) ? 0 : Math.abs(inner - prev);
      const thick = wallT + step;
      const wx = inner + (k * thick) / 2;
      if (def.windows) {
        // Observation deck: low wall, window frames, open above.
        this.hullBox(wx, 0, d, thick, 0.55, depth, true);
        if (Math.floor(d / STEP) % 3 === 0) this.hullBox(inner + k * 0.15, 0, d, 0.3, H, 0.3, true);
        this.hullBox(wx, H, d, thick, 0.25, depth, false);
      } else {
        // Over a pit the wall carries on down: steel near the top, then black.
        const base = pit ? -PIT_LIP : 0;
        this.hullBox(wx, base, d, thick, H - base, depth, true);
        if (pit) this.voids.spawn(wx - this.shipX, -P, d, thick, P - PIT_LIP, depth, 0, false, false, 0, 0, false);
      }
      if (k < 0) this.prevWallL = inner;
      else this.prevWallR = inner;
    }
    this.hull.nextTilt = def.ceiling;
    if (def.ceiling) this.hullBox(this.cx, H, d, span, 0.35, depth, false);
    if (!pit) {
      this.hull.nextTilt = true;
      this.hullBox(this.cx, -0.14, d, span, 0.14, depth, false);
    } else {
      // Floor pieces over a dark drop, with lit edges or railings.
      this.voids.spawn(this.cx - this.shipX, -P - 0.1, d, span + 30, 0.1, depth, 0, false, false, 0, 0, false);
      for (let i = 0; i < this.floorN; i++) {
        const x0 = this.floorSegs[i * 2];
        const x1 = this.floorSegs[i * 2 + 1];
        this.hull.nextTilt = true;
        this.hullBox((x0 + x1) / 2, -0.14, d, x1 - x0, 0.14, depth, false);
        for (const [edge, s] of [[x0, -1], [x1, 1]] as const) {
          if (Math.abs(edge - (this.cx + s * hw)) < 0.05) continue; // meets the wall: nothing to trim
          // Inside another piece of floor (where walkways join): no edge here either.
          let covered = false;
          for (let j = 0; j < this.floorN && !covered; j++) {
            if (j !== i && edge > this.floorSegs[j * 2] + 0.05 && edge < this.floorSegs[j * 2 + 1] - 0.05) covered = true;
          }
          if (covered) continue;
          // The drop's side: a steel lip, then black all the way down.
          this.hullBox(edge + s * 0.08, -PIT_LIP, d, 0.16, PIT_LIP - 0.14, depth, false);
          this.voids.spawn(edge + s * 0.08 - this.shipX, -P, d, 0.16, P - PIT_LIP, depth, 0, false, false, 0, 0, false);
          if (pr ? pr.catwalk : def.railings) {
            api.run(edge - s * 0.06, it.railHeight, d, 0.035, Decor.Steel);
            if (api.row % 3 === 0) api.greeble(edge - s * 0.06, 0, d, 0.07, it.railHeight, 0.07, Decor.Steel);
          } else {
            this.light(edge - s * 0.05, 0.01, d, 0.1, 0.03, depth, Light.White, false); // pale rim on the drop
          }
        }
      }
    }
    const split = this.plan !== null && open > 0.97;
    if (split) {
      // Dividers between branches, a light down each branch.
      const p = this.plan!;
      for (const dv of p.dividers) this.hullBox(this.cx + dv, 0, d, p.dividerHalf * 2, H, depth, true);
      if (def.ceiling) for (const br of p.branches) this.lightStrip(this.cx + br, H - 0.05, d, def.light);
    } else if (def.ceiling) {
      this.lightStrip(this.cx, H - 0.05, d, def.light);
      if (hw > 6) {
        this.lightStrip(this.cx - hw * 0.55, H - 0.05, d, def.light);
        this.lightStrip(this.cx + hw * 0.55, H - 0.05, d, def.light);
      }
    } else {
      this.lightStrip(this.cx, 0.01, d, def.light); // deck: a line along the floor instead
    }

    // Wall dressing: pipes, ducts, panels... per room type.
    api.pit = pit;
    api.ceiling = def.ceiling;
    decorate(this.room, api);

    // Door frame where each room or corridor begins: lintel, jambs and floor stripes.
    if (this.framePending) {
      this.framePending = false;
      this.hullBox(this.cx, H - 0.6, d, span, 0.6, 0.7, false);
      this.hullBox(this.cx - hw - 0.3, 0, d, 0.6, H, 0.9, true);
      this.hullBox(this.cx + hw + 0.3, 0, d, 0.6, H, 0.9, true);
      for (const off of [0.6, 1.1]) this.light(this.cx, 0.01, d + off, hw * 2, 0.01, 0.22, Light.Amber, false);
      // Number plate by the door and a light over it.
      this.light(this.cx - hw + 0.04, 2.1, d + 0.7, 0.04, 0.3, 0.5, Light.Amber, false);
      this.light(this.cx, H - 0.68, d - 0.3, 1.2, 0.06, 0.06, Light.White, false);
    }

    // A piece's contents come from its grid.
    if (pr) {
      if (pr.r >= 0) this.pieceBuild(pr.r, d, H);
      return;
    }
    // Room contents (split rooms only once the dividers are up).
    if (!def.build || !inBody) return;
    if (this.plan && !split) return;
    def.build(api);
  }

  /**
   * The outside of the ship, where the canyon ends: layered hull panels of
   * different heights and depths, towers with window strips, antenna masts
   * with red beacons, big pipes running across, and a hazard-striped door.
   */
  private buildFacade(d: number, door: number): void {
    const it = TH.interior;
    const fc = it.facade;
    const cx = this.cx;
    const front = d - 1.6; // the face nearest the ship
    const api = this.api;
    for (const s of [-1, 1]) {
      // Hull panels from the door outwards.
      let x = door + 0.6;
      while (x < fc.width) {
        const w = 2.5 + rand() * 5;
        const h = range(fc.height);
        const dep = 1.2 + rand() * 3;
        const px = cx + s * (x + w / 2);
        this.hullBox(px, 0, front + dep / 2, w, h, dep, true);
        // Rows of small windows on some panels.
        if (rand() < 0.55) {
          const rows = 1 + Math.floor(rand() * 3);
          const colour = rand() < 0.6 ? Light.White : Light.Teal;
          for (let k = 0; k < rows; k++) this.light(px, 3 + k * 2.2 + rand(), front - 0.03, w * 0.7, 0.18, 0.05, colour, false);
        }
        x += w;
      }
      // Big pipes running across the face.
      for (let k = 0; k < 2; k++) {
        const len = fc.width - door - 2;
        this.pipes.nextColor = k ? Decor.Copper : Decor.Steel;
        this.pipes.spawn(cx + s * (door + 1 + len / 2) - this.shipX, 4.4 + k * 3.5, front - 0.7, 0.45 - k * 0.15, 0.45 - k * 0.15, len, Math.PI / 2, false, false, 0, 0, false);
      }
    }
    // Towers standing proud of the hull, with lit windows.
    for (let t = 0; t < Math.round(range(fc.towers)); t++) {
      const s = rand() < 0.5 ? -1 : 1;
      const w = 3 + rand() * 4;
      const tx = cx + s * (door + 5 + rand() * (fc.width - door - 10));
      const th = 20 + rand() * 14;
      this.hullBox(tx, 0, front + 1.5, w, th, 4, true);
      for (let k = 0; k < 6; k++) this.light(tx, 6 + k * 2.6, front - 0.53, w * 0.6, 0.2, 0.05, rand() < 0.3 ? Light.Amber : Light.White, false);
    }
    // Antenna masts with red beacons.
    for (let m = 0; m < Math.round(range(fc.masts)); m++) {
      const s = rand() < 0.5 ? -1 : 1;
      const mx = cx + s * (door + 3 + rand() * (fc.width - door - 6));
      const mh = 18 + rand() * 16;
      api.greeble(mx, 0, front + 1, 0.3, mh, 0.3, Decor.Steel);
      this.light(mx, mh, front + 1, 0.5, 0.5, 0.5, Light.Red, false);
    }
    // Over the door, then hazard stripes around it and floodlights.
    const H = it.wallHeight;
    this.hullBox(cx, H, front + 1, 2 * door + 1.2, range(fc.height) - H, 2, false);
    for (let k = 0; k < 7; k++) {
      const colour = k % 2 ? Light.Amber : Light.Dark;
      this.light(cx - door - 0.35, k * 0.5 + 0.25, front - 0.05, 0.7, 0.5, 0.08, colour, false);
      this.light(cx + door + 0.35, k * 0.5 + 0.25, front - 0.05, 0.7, 0.5, 0.08, colour, false);
    }
    for (let k = 0; k < 8; k++) {
      this.light(cx - door + (k + 0.5) * ((2 * door) / 8), H + 0.25, front - 0.05, (2 * door) / 8, 0.5, 0.08, k % 2 ? Light.Amber : Light.Dark, false);
    }
    this.light(cx - door * 0.6, H + 1.2, front - 0.1, 1.2, 0.3, 0.1, Light.White, false);
    this.light(cx + door * 0.6, H + 1.2, front - 0.1, 1.2, 0.3, 0.1, Light.White, false);
  }
  /** Remember this row's floor so the ship can fall through gaps (ring buffer by row). */
  private readonly wallD = new Float64Array(FLOOR_ROWS).fill(-Infinity);
  private readonly wallL = new Float32Array(FLOOR_ROWS);
  private readonly wallR = new Float32Array(FLOOR_ROWS);

  private recordFloor(d: number): void {
    const slot = (((Math.round(d / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    this.floorD[slot] = d;
    this.floorCount[slot] = this.floorN;
    for (let i = 0; i < Math.max(0, this.floorN) * 2; i++) this.floorRows[slot * 12 + i] = this.floorSegs[i];
  }

  /** True if the ship is over a pit (no floor under it). */
  overPit(): boolean {
    const slot = (((Math.round(this.distance / STEP) % FLOOR_ROWS) + FLOOR_ROWS) % FLOOR_ROWS);
    if (Math.abs(this.floorD[slot] - this.distance) > STEP * 0.6) return false;
    const n = this.floorCount[slot];
    if (n < 0) return false;
    const x = this.shipX;
    for (let i = 0; i < n; i++) {
      if (x >= this.floorRows[slot * 12 + i * 2] - 0.1 && x <= this.floorRows[slot * 12 + i * 2 + 1] + 0.1) return false;
    }
    return true;
  }
  private makeApi(): RoomAPI {
    const w = this; // eslint-disable-line @typescript-eslint/no-this-alias
    return {
      d: 0,
      score: 0,
      sub: 0,
      jitter: 0,
      cx: 0,
      hw: 0,
      H: 0,
      lane: 0,
      side: 1,
      progress: 0,
      maxSlope: 0.2,
      plan: null,
      memo: 0,
      memoAt: 0,
      memo2: 0,
      seed: 0,
      row: 0,
      start: 0,
      end: 0,
      taper: 0,
      stage: 0,
      pit: false,
      ceiling: true,
      due(spacing) {
        if (this.d < w.nextFeatureAt) return false;
        w.nextFeatureAt = this.d + range(spacing);
        return true;
      },
      clearOf(x, half) {
        return Math.abs(x - this.lane) >= LANE + half + this.jitter;
      },
      perRow(scale) {
        return (densityAt(this.score) / 100) * 2 * this.hw * STEP * scale;
      },
      crate(x, d, width, h) {
        w.blocks.spawn(x - w.shipX, 0, d, width, h, width, 0, true, false, width / 2, width / 2);
      },
      box(x, y, d, width, h, depth, solid, scores) {
        w.hullBox(x, y, d, width, h, depth, solid, scores);
      },
      slider(centre, amp, arriveX, d, width, h, depth) {
        const s = clamp((arriveX - centre) / amp, -1, 1);
        const phase = rand() < 0.5 ? Math.asin(s) : Math.PI - Math.asin(s);
        w.hull.setNextMotion(amp, CONFIG.themes.interior.rooms.pistons.travel, phase);
        w.hullBox(centre, 0, d, width, h, depth, true, true);
      },
      light(x, y, d, width, h, depth, colour, solid = false) {
        w.light(x, y, d, width, h, depth, colour, solid);
      },
      door(d, gapX, gapHalf) {
        const hd = CONFIG.themes.interior.rooms.hangar;
        const [len, finish] = hd.doorClose;
        // Each leaf starts inside its wall and slides in to the gap edge.
        for (const side of [-1, 1]) {
          const wallX = this.cx + side * this.hw;
          const edge = gapX + side * gapHalf;
          const width = (wallX - edge) * side;
          if (width < 0.3) continue;
          const closed = (wallX + edge) / 2;
          w.hull.setNextRamp(-side * width, len, finish, false);
          w.hullBox(closed + side * width, 0, d, width, this.H, 0.7, true, false);
        }
        // Hazard stripes on the floor and a lintel across the top.
        w.light(this.cx, 0.01, d - 0.7, this.hw * 2, 0.01, 0.25, Light.Amber, false);
        w.light(this.cx, 0.01, d + 0.7, this.hw * 2, 0.01, 0.25, Light.Amber, false);
        this.greeble(this.cx, this.H - 0.9, d, this.hw * 2, 0.9, 1.1, Decor.Yellow);
      },
      debris(x, d, width, h, depth, landAhead) {
        w.hull.setNextRamp(this.H - h, CONFIG.themes.interior.rooms.collapse.fallOver, landAhead, true);
        w.hullBox(x, 0, d, width, h, depth, true, true);
      },
      wall(side) {
        return this.cx + side * this.hw;
      },
      pipe(side, y, r, colour) {
        w.pipes.nextColor = colour;
        w.pipes.nextTilt = true;
        const x = this.cx + side * (this.hw - r - 0.02);
        w.pipes.spawn(x - w.shipX, y, this.d, r, r, STEP + 0.1, 0, false, false, 0, 0, false);
      },
      run(x, y, d, r, colour) {
        w.pipes.nextColor = colour;
        w.pipes.nextTilt = true;
        w.pipes.spawn(x - w.shipX, y, d, r, r, STEP + 0.1, 0, false, false, 0, 0, false);
      },
      greeble(x, y, d, width, h, depth, colour) {
        w.greebles.nextColor = colour;
        w.greebles.spawn(x - w.shipX, y, d, width, h, depth, 0, false, false, 0, 0, false);
      },
      canister(x, d, colour, size) {
        w.canisters.nextColor = colour;
        w.canisters.spawn(x - w.shipX, 0, d, size, size, size, rand() * 6.28, false, false, 0, 0, false);
      },
      floorBegin() {
        w.floorN = 0;
      },
      floor(x0, x1) {
        if (w.floorN >= 6 || x1 <= x0) return;
        w.floorSegs[w.floorN * 2] = x0;
        w.floorSegs[w.floorN * 2 + 1] = x1;
        w.floorN++;
      },
      pour(x, d, width, liquid, solid) {
        w.pours.nextColor = liquid;
        const t = solid ? 0.22 : 0.14;
        w.pours.spawn(x - w.shipX, 0, d, width, this.H, t, 0, solid, false, width / 2, t / 2 + 0.05, solid);
      },
      pool(x, d, r, liquid) {
        w.pools.nextColor = liquid;
        w.pools.spawn(x - w.shipX, 0.02, d, r, 1, r * 0.8, 0, false, false, 0, 0, false);
      },
      steam(x, y, d, height) {
        w.steamPlumes.spawn(x - w.shipX, y, d, 0.7, height, 0.7, 0, false, false, 0, 0, false);
      },
      blinker(x, y, d, width, h, colour) {
        const s = F.cubeSize;
        w.blinkers.nextColor = colour;
        w.blinkers.spawn(x - w.shipX, y, d, width / s, h / s, Math.max(width, 0.04) / s, 0, false, false, 0, 0, false);
      },
      holo(x, y, d, width, h) {
        w.holos.spawn(x - w.shipX, y, d, width, h, 1, 0, false, false, 0, 0, false);
      },
      fan(x, d, size) {
        w.fans.spawn(x - w.shipX, this.H - 0.35, d, size, size, size, 0, false, false, 0, 0, false);
      },
      bigFan(x, y, d, size) {
        w.fans.spawn(x - w.shipX, y, d, size, size * 0.5, size, rand() * 6.28, false, false, 0, 0, false);
      },
      piston(x, d, top) {
        // Rod pumping up and down on a fixed rhythm, out of step with its neighbours.
        w.greebles.setNextPulse(0.9, 7, rand() * 6.28);
        w.greebles.nextColor = Decor.Steel;
        w.greebles.spawn(x - w.shipX, 1.1, d, 0.35, Math.max(0.5, top - 2.2), 0.35, 0, false, false, 0, 0, false);
        this.greeble(x, 0, d, 0.7, 0.9, 0.7, Decor.Copper); // cylinder block
      },
            step(a, b, delta) {
        terrain.addStep(a, b, delta);
      },
      water(x, y, d, width) {
        w.waters.nextTilt = true;
        w.waters.spawn(x - w.shipX, y - 0.05, d, width, 0.05, STEP + 0.12, 0, false, false, 0, 0, false);
      },
      tank(x, d, r, h) {
        w.tanks.nextColor = Math.floor(rand() * 3);
        w.tanks.spawn(x - w.shipX, 0.3, d, r * 2, h - 0.6, r * 2, 0, true, false, r, r);
        // Steel caps top and bottom.
        this.greeble(x, 0, d, r * 2.2, 0.3, r * 2.2, Decor.Steel);
        this.greeble(x, h - 0.3, d, r * 2.2, 0.3, r * 2.2, Decor.Steel);
      },
      hook(centre, amp, arriveX, d) {
        const R = CONFIG.themes.interior.rooms.cargoLift;
        const s = clamp((arriveX - centre) / amp, -1, 1);
        const phase = rand() < 0.5 ? Math.asin(s) : Math.PI - Math.asin(s);
        // The hook (solid) and its chain (scenery) swing together.
        w.hull.setNextMotion(amp, R.hookFreq, phase);
        w.hullBox(centre, R.hookY, d, 0.7, 0.6, 0.7, true, true);
        w.greebles.setNextMotion(amp, R.hookFreq, phase);
        w.greebles.nextColor = Decor.Dark;
        w.greebles.spawn(centre - w.shipX, R.hookY + 0.6, d, 0.08, this.H - R.hookY - 0.6, 0.08, 0, false, false, 0, 0, false);
      },
      vent(x, d, half, period) {
        // On (or near) the lane: down when the ship gets there. Elsewhere: any rhythm.
        const onLane = Math.abs(x - this.lane) < LANE + half + this.jitter + 0.3;
        const phase = onLane ? -Math.PI / 2 : rand() * Math.PI * 2;
        const height = Math.min(this.H - 0.3, 2.6);
        w.vents.setNextPulse(height, period, phase);
        w.vents.spawn(x - w.shipX, 0, d, half * 2, height, half * 2, 0, true, false, half, half, false);
        // The grate it fires from, lit amber so it reads as a hazard.
        w.light(x, 0.01, d, half * 2 + 0.2, 0.01, half * 2 + 0.2, Light.Amber, false);
      },
      sparks(x, y, d) {
        w.sparks.addEmitter(x, y, d);
      },
      tree(x, d, size) {
        const field = rand() < 0.6 ? w.mushrooms : w.spires;
        const hit = (field === w.mushrooms ? 0.2 : 0.16) * size;
        field.spawn(x - w.shipX, 0.35, d, size, size, size, rand() * Math.PI * 2, true, false, hit, hit);
      },
      shuttle(x, d, flip) {
        const r = CONFIG.themes.interior.rooms.hangar.shuttleHalfWidth;
        w.shuttles.spawn(x - w.shipX, 0, d, 1, 1, 1, flip ? Math.PI : 0, true, false, r, 2.5);
      },
    };
  }

  private logRoom(d: number, id: RoomId): void {
    this.roomLogD[this.roomLogHead] = d;
    this.roomLogId[this.roomLogHead] = ROOM_IDS.indexOf(id);
    this.roomLogHead = (this.roomLogHead + 1) % this.roomLogD.length;
  }

  /** Room the ship is in, from the log of recent room starts. */
  private roomAtShip(): RoomId | null {
    let best = -Infinity;
    let id = -1;
    for (let i = 0; i < this.roomLogD.length; i++) {
      const d = this.roomLogD[i];
      if (d <= this.distance && d > best) {
        best = d;
        id = this.roomLogId[i];
      }
    }
    return id < 0 ? null : ROOM_IDS[id];
  }
  // --- spawn helpers (world x unless noted) ----------------------------------

  /** `scores`: counts for near misses (bulkheads yes, walls no). */
  private hullBox(x: number, y: number, d: number, w: number, h: number, depth: number, solid: boolean, scores = false): void {
    const s = F.cubeSize;
    this.hull.spawn(x - this.shipX, y, d, w / s, h / s, depth / s, 0, solid, false, w / 2, depth / 2, scores);
  }

  /** Ceiling (or floor) light strip segment for one row. */
  private lightStrip(x: number, y: number, d: number, colour: Light): void {
    this.light(x, y, d, 0.22, 0.05, STEP * 0.6, colour, false);
  }

  /** Coloured light / beam box. Solid ones (laser beams) collide and count for near misses. */
  private light(x: number, y: number, d: number, w: number, h: number, depth: number, colour: Light, solid: boolean): void {
    const s = F.cubeSize;
    this.strips.nextColor = colour;
    this.strips.nextTilt = !solid && h <= 0.06; // flat strips on floors and ceilings lean with the slope
    this.strips.spawn(x - this.shipX, y, d, w / s, h / s, depth / s, 0, solid, false, w / 2, depth / 2, solid);
  }

  private obstacle(x: number, d: number, r: number, height: number, wraps = false): void {
    const hit = r * 0.8;
    this.obstacleRocks.spawn(x - this.shipX, 0, d, r, height / BOULDER_HEIGHT, r, rand() * Math.PI * 2, true, wraps, hit, hit);
  }

  private rock(x: number, d: number, r: number, height: number): void {
    const hit = r * 0.8;
    this.rocks.spawn(x - this.shipX, 0, d, r, height / BOULDER_HEIGHT, r, rand() * Math.PI * 2, true, false, hit, hit, false);
  }
}
