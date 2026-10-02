import { BoxGeometry, Color, MeshBasicMaterial, OctahedronGeometry, Scene, type Texture } from 'three';
import { patchBlockMaterial } from './blockTextures';
import { CONFIG } from './config';
import { rand, seed as seedRandom } from './rng';
import { densityAt, lateralSpeedAt, speedAt } from './difficulty';
import { InstancedField, wrap } from './field';
import type { LivePalette } from './palette';
import { Decor, decorate, Light, pickRoom, ROOM_IDS, ROOMS, roomLength, type RoomAPI, type RoomId, type RoomPlan } from './interior';
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
export const POWER_NAMES = ['shield', 'magnet', 'slow-mo'] as const;
const THEMES: ThemeId[] = ['land', 'canyon', 'interior'];

const F = CONFIG.field;
const TH = CONFIG.themes;
const LPT = TH.levelsPerTheme;
const STEP = F.rowSpacing;
const W = F.halfWidth;
const SPAN = W * 2;
const LANE = TH.lane.halfWidth;
const FLOOR_ROWS = 512; // rows of floor history kept for fall checks
const PIT_LIP = 0.3; // pit sides: a thin steel lip, then black

/** Open-ground prop kinds. */
const enum Prop {
  Mushroom,
  Spire,
  Rock,
  Crystal,
}

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

export function themeName(level: number): string {
  return TH.names[themeForLevel(level)];
}

export class World {
  distance = 0;
  canyonMix = 0; // 0..1, how much the canyon look applies at the ship
  interiorMix = 0;
  deckMix = 0; // 0..1, open to space on the observation deck
  insideMix = 0; // 0..1, inside the ship at all (ignores how open the room is)

  private generatedTo = 0;
  private lastDx = 0; // sideways movement this frame, for swept collision
  // Inner edges of the previous row's walls (world x), so each wall segment can
  // reach back over any step and leave no gap between rows.
  private prevWallL = NaN;
  private prevWallR = NaN;
  private shipX = 0; // ship's world lateral position
  private runStart: number | null = null; // null on the title screen

  private readonly blocks: InstancedField; // steel crates (interior)
  private readonly hull: InstancedField;
  private readonly rocks: InstancedField; // canyon walls
  private readonly obstacleRocks: InstancedField; // dark boulders and pillars
  private readonly mushrooms: InstancedField;
  private readonly spires: InstancedField;
  private readonly crystals: InstancedField;
  private readonly strips: InstancedField; // lights, and laser beams (solid ones)
  private readonly shuttles: InstancedField;
  private readonly pipes: InstancedField; // wall dressing
  private readonly greebles: InstancedField;
  private readonly voids: InstancedField; // pit bottoms
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
    this.stripMat = new MeshBasicMaterial();
    this.strips = new InstancedField(scene, box, this.stripMat, F.maxStrips);
    const L = TH.interior.lights;
    this.strips.setColorTable([new Color(1, 1, 1), new Color(L.amber), new Color(L.teal), new Color(L.red), new Color(L.dark), new Color(L.green)]);
    // Wall dressing: shaded geometry tinted per instance from the decor table (Decor order).
    const D = TH.interior.decor;
    const decorTable = [D.steel, D.copper, D.teal, D.red, D.dark, D.yellow, D.panel, D.green].map((h) => new Color(h));
    this.decorMat = new MeshBasicMaterial({ vertexColors: true });
    this.decorMat.color.setScalar(0.95);
    this.pipes = new InstancedField(scene, pipeSegment(), this.decorMat, F.maxPipes);
    this.pipes.setColorTable(decorTable);
    this.greebles = new InstancedField(scene, greebleBox(), this.decorMat, F.maxGreebles);
    this.greebles.setColorTable(decorTable);
    this.canisters = new InstancedField(scene, canister(), this.decorMat, F.maxCanisters);
    this.canisters.setColorTable(decorTable);
    this.voids = new InstancedField(scene, box, new MeshBasicMaterial({ color: TH.interior.void, fog: false }), F.maxVoids);
    this.shuttles = new InstancedField(scene, shuttle(), this.propMat, F.maxShuttles);
    this.pickupMat = new MeshBasicMaterial();
    const p = CONFIG.boost.pickup;
    this.pickups = new InstancedField(scene, new OctahedronGeometry(p.size, 0), this.pickupMat, F.maxPickups);
    const pw = CONFIG.powers;
    this.powers = new InstancedField(scene, powerGem(pw.size), new MeshBasicMaterial({ vertexColors: true }), F.maxPowers);
    this.powers.setColorTable([pw.shield.color, pw.magnet.color, pw.slow.color].map((c) => new Color(c)));
    this.solids = [this.blocks, this.hull, this.rocks, this.obstacleRocks, this.mushrooms, this.spires, this.crystals, this.shuttles, this.strips];
    this.fields = [...this.solids, this.pickups, this.powers, this.pipes, this.greebles, this.voids, this.canisters];
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
    this.roomShift = 0;
    this.prevWallL = this.prevWallR = NaN;
    this.floorD.fill(-Infinity);
    // startScore > 0 (dev skip) places the run part-way along.
    this.runStart = run ? this.distance - startScore / CONFIG.score.pointsPerUnit : null;
    this.theme = 'land';
    this.themeStart = -Infinity;
    const level = this.levelAt(this.distance);
    this.themeEnd = run ? this.levelStart(level - ((level - 1) % LPT) + LPT) : Infinity;
    this.lane = this.laneTarget = this.shipX;
    this.laneRetargetAt = this.distance + clearance + 20;
    this.nextFeatureAt = this.distance + clearance;
    this.nextPickupAt = this.distance + clearance + 40;
    this.nextPowerAt = this.distance + CONFIG.powers.firstAfter + range(CONFIG.powers.spacing) * 0.5;
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
    this.updateMix(dt);
  }

  hitTest(prevDistance: number): boolean {
    for (const f of this.solids) if (f.hitTest(prevDistance, this.distance, this.lastDx)) return true;
    return false;
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
    const r = CONFIG.boost.pickup.collectRadius;
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
    const r = CONFIG.boost.pickup.collectRadius;
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
    for (const f of this.fields) f.sync(this.distance);
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
    this.canyonMix = this.interiorMix = this.insideMix = 0;
    this.roomName = '';
    if (themeForLevel(this.levelAt(this.distance)) !== 'interior') this.deckMix = 0;
    if (this.runStart === null) return;
    const level = this.levelAt(this.distance);
    const first = level - ((level - 1) % LPT);
    const k =
      ease((this.distance - this.levelStart(first)) / TH.fadeIn) *
      ease((this.levelStart(first + LPT) - this.distance) / TH.fadeOut);
    const theme = themeForLevel(level);
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
    const level = this.levelAt(d);
    const theme = themeForLevel(level);
    if (theme !== this.theme) this.startTheme(theme, d, level);
    const sub = (level - 1) % LPT;
    const score = this.scoreAt(d);
    const speed = speedAt(score);
    // Fastest the lane may drift sideways per unit of forward travel.
    const maxSlope = (TH.lane.slopeFraction * lateralSpeedAt(speed)) / speed;
    if (theme === 'land') this.land(d, sub, score, maxSlope);
    else if (theme === 'canyon') this.canyon(d, sub, score, maxSlope);
    else this.interior(d, sub, score, maxSlope);

    // Boost pickups sit on the safe lane, so they also hint at the way through.
    if (this.runStart !== null && d >= this.nextPickupAt && !this.quiet(d)) {
      this.nextPickupAt = d + range(CONFIG.boost.pickup.spacing);
      const x = this.lane - this.shipX;
      if (d >= this.nextPowerAt) {
        // Now and then a power-up takes the boost pickup's place.
        this.nextPowerAt = d + range(CONFIG.powers.spacing);
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

  private startTheme(theme: ThemeId, d: number, level: number): void {
    const first = level - ((level - 1) % LPT);
    this.theme = theme;
    this.themeStart = d;
    this.themeEnd = this.levelStart(first + LPT);
    this.nextFeatureAt = d + 25;
    this.cxSlope = this.cxTargetSlope = 0;
    this.cxRetargetAt = d + 30;
    this.laneRetargetAt = d;
    if (theme === 'canyon') {
      // Centre the mouth on the ship, not the lane: on open ground the player can
      // roam far from the lane. Nothing is placed in the run-up, so the lane can
      // jump here safely.
      this.cx = this.lane = this.shipX;
    } else if (theme === 'interior') {
      this.entrancePending = true;
      this.room = this.lastRoom = 'corridor';
      this.prevWallL = this.prevWallR = NaN;
    } else {
      this.laneTarget = this.lane;
    }
  }

  // --- land ------------------------------------------------------------------

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

  /** Choose the next open-ground prop's kind and size (sets propKind/propSize/propHit). */
  private pickProp(): void {
    const m = TH.land.mix;
    const r = rand() * (m.mushroom + m.spire + m.rock + m.crystal);
    if (r < m.mushroom) {
      this.propKind = Prop.Mushroom;
      this.propSize = 0.8 + rand() * 0.45;
      this.propHit = 0.2 * this.propSize;
    } else if (r < m.mushroom + m.spire) {
      this.propKind = Prop.Spire;
      this.propSize = 0.8 + rand() * 0.4;
      this.propHit = 0.16 * this.propSize;
    } else if (r < m.mushroom + m.spire + m.rock) {
      this.propKind = Prop.Rock;
      this.propSize = 0.5 + rand() * 0.6;
      this.propHit = 0.8 * this.propSize;
    } else {
      this.propKind = Prop.Crystal;
      this.propSize = 0.8 + rand() * 0.5;
      this.propHit = 0.45 * this.propSize;
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
      const field = this.propKind === Prop.Mushroom ? this.mushrooms : this.propKind === Prop.Spire ? this.spires : this.crystals;
      field.spawn(x, 0, d, s, s * (0.85 + rand() * 0.3), s, rot, true, wraps, h, h);
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
    this.steerCentre(d, maxSlope * c.centreSlopeFraction);
    let hw = (c.halfWidthStart - c.halfWidthMin) * Math.exp(-score / c.widthRampPoints) + c.halfWidthMin;
    const left = this.themeEnd - d;
    hw = lerp(c.mouthHalfWidth, hw, ease((d - this.themeStart) / c.mouth));
    hw = lerp(this.interiorHalfWidth(score) + TH.interior.doorExtra, hw, ease(left / c.exit));

    const maxOffset = hw - (LANE + 0.4);
    if (left < c.exit + 60) this.laneTarget = 0; // line up with the interior door
    else this.retargetOffset(d, maxOffset);
    this.moveLane(maxSlope, this.laneTarget, maxOffset);

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
      // Crystals growing out of the canyon sides (scenery: behind the wall rocks, never hit).
      if (rand() < c.wallCrystals) {
        const s = 1.1 + rand() * 1.1;
        const x = this.cx + side * (hw + 1.4 + rand() * 4) - this.shipX;
        this.crystals.spawn(x, 0, d, s, s * (0.8 + rand() * 0.6), s, rand() * 6.28, false, false, 0, 0, false);
      }
    }

    if (this.quiet(d)) return;

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
    for (let x = this.cx - hw + 0.8; x < this.cx + hw - 0.5; x += 1.7) {
      const r = 0.75 + rand() * 0.2;
      if (Math.abs(x - this.lane) < gapHalf + r * 0.8) continue;
      this.obstacle(x, d + (rand() - 0.5) * 0.6, r, 0.9 + rand() * 0.7);
    }
  }

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

  private startRoom(id: RoomId, d: number, base: number, maxSlope: number, jog = true): void {
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
      if (this.room === 'corridor') next = this.devRoom ?? pickRoom(sub, this.lastRoom);
      else this.lastRoom = this.room;
      this.startRoom(next, d, base, maxSlope);
    }

    const def = ROOMS[this.room];
    const taper = this.roomTaper;
    const open = taper > 0 ? ease(Math.min((d - this.roomStart) / taper, (this.roomEnd - d) / taper)) : 1;
    const hw = lerp(base, this.room === 'corridor' ? base : this.roomHw, open);
    const H = lerp(it.wallHeight, this.room === 'corridor' ? it.wallHeight : this.roomH, open);

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
      this.steerCentre(d, maxSlope * it.centreSlopeFraction * def.wander);
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
    if (this.roomOffset !== null) {
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
    if (def.floor && inBody) def.floor(api);
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
    if (def.ceiling) this.hullBox(this.cx, H, d, span, 0.35, depth, false);
    if (!pit) {
      this.hullBox(this.cx, -0.14, d, span, 0.14, depth, false);
    } else {
      // Floor pieces over a dark drop, with lit edges or railings.
      this.voids.spawn(this.cx - this.shipX, -P - 0.1, d, span + 30, 0.1, depth, 0, false, false, 0, 0, false);
      for (let i = 0; i < this.floorN; i++) {
        const x0 = this.floorSegs[i * 2];
        const x1 = this.floorSegs[i * 2 + 1];
        this.hullBox((x0 + x1) / 2, -0.14, d, x1 - x0, 0.14, depth, false);
        for (const [edge, s] of [[x0, -1], [x1, 1]] as const) {
          if (Math.abs(edge - (this.cx + s * hw)) < 0.05) continue; // meets the wall: nothing to trim
          // The drop's side: a steel lip, then black all the way down.
          this.hullBox(edge + s * 0.08, -PIT_LIP, d, 0.16, PIT_LIP - 0.14, depth, false);
          this.voids.spawn(edge + s * 0.08 - this.shipX, -P, d, 0.16, P - PIT_LIP, depth, 0, false, false, 0, 0, false);
          if (def.railings) {
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
      wall(side) {
        return this.cx + side * this.hw;
      },
      pipe(side, y, r, colour) {
        w.pipes.nextColor = colour;
        const x = this.cx + side * (this.hw - r - 0.02);
        w.pipes.spawn(x - w.shipX, y, this.d, r, r, STEP + 0.1, 0, false, false, 0, 0, false);
      },
      run(x, y, d, r, colour) {
        w.pipes.nextColor = colour;
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
