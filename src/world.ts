import { BoxGeometry, Color, MeshBasicMaterial, OctahedronGeometry, Scene, type Texture } from 'three';
import { patchBlockMaterial } from './blockTextures';
import { CONFIG } from './config';
import { densityAt, lateralSpeedAt, speedAt } from './difficulty';
import { InstancedField, wrap } from './field';
import type { LivePalette } from './palette';
import { Light, pickRoom, ROOM_IDS, ROOMS, roomLength, type RoomAPI, type RoomId, type RoomPlan } from './interior';
import { BOULDER_HEIGHT, boulder, crystalCluster, mushroomTree, shuttle, spireTree } from './props';

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
const THEMES: ThemeId[] = ['land', 'canyon', 'interior'];

const F = CONFIG.field;
const TH = CONFIG.themes;
const LPT = TH.levelsPerTheme;
const STEP = F.rowSpacing;
const W = F.halfWidth;
const SPAN = W * 2;
const LANE = TH.lane.halfWidth;

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
  return r[0] + Math.random() * (r[1] - r[0]);
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
  private readonly pickups: InstancedField;
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
    this.strips.setColorTable([new Color(1, 1, 1), new Color(L.amber), new Color(L.teal), new Color(L.red)]);
    this.shuttles = new InstancedField(scene, shuttle(), this.propMat, F.maxShuttles);
    this.pickupMat = new MeshBasicMaterial();
    const p = CONFIG.boost.pickup;
    this.pickups = new InstancedField(scene, new OctahedronGeometry(p.size, 0), this.pickupMat, F.maxPickups);
    this.solids = [this.blocks, this.hull, this.rocks, this.obstacleRocks, this.mushrooms, this.spires, this.crystals, this.shuttles, this.strips];
    this.fields = [...this.solids, this.pickups];
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
  reset(clearance: number, run: boolean, startScore = 0): void {
    for (const f of this.fields) f.clear();
    // Forget rooms generated ahead in the previous run.
    this.roomLogD.fill(-Infinity);
    this.room = this.lastRoom = 'corridor';
    this.roomEnd = -Infinity;
    this.enclosure = 1;
    this.plan = null;
    this.roomShift = 0;
    this.prevWallL = this.prevWallR = NaN;
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
    this.generatedTo = this.distance + clearance;
    this.fill();
  }

  /** Start a run from the title scene, keeping the open ground already generated. */
  beginRun(clearance: number): void {
    for (const f of this.fields) f.clearBefore(this.distance + clearance);
    this.runStart = this.distance;
    this.themeEnd = this.levelStart(1 + LPT);
    this.nextPickupAt = this.generatedTo + range(CONFIG.boost.pickup.spacing);
    // The lane is left as is: rows already ahead were built around it.
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
    this.canyonMix = this.interiorMix = 0;
    this.roomName = '';
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
      this.interiorMix = k * this.enclosure;
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
      this.pickups.spawn(x, CONFIG.boost.pickup.height, d, 1, 1, 1, 0, false, this.theme === 'land', 0, 0);
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
      this.laneTarget = this.lane + (Math.random() * 2 - 1) * wander;
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
        if (Math.random() > lt.edgeChance) continue;
        this.pickProp();
        const x = laneRel + side * (pathHalf + jitter + this.propHit + Math.random() * 0.5);
        this.placeProp(x, d + (Math.random() - 0.5) * STEP, true);
      }
      return;
    }

    this.scatter(d, densityAt(score) * (sub === 1 ? lt.denseFactor : 1), laneRel, LANE + jitter);

    // Level 2: rock clusters, well clear of the lane.
    if (sub === 1 && d >= this.nextFeatureAt) {
      this.nextFeatureAt = d + range(lt.clusterSpacing);
      const centre = (Math.random() * 2 - 1) * W;
      const size = Math.round(range(lt.clusterSize));
      for (let i = 0; i < size; i++) {
        const r = 0.5 + Math.random() * 0.6;
        const x = centre + (Math.random() - 0.5) * 4;
        // Cluster rocks spread ±2 units along the run, where the lane may have moved.
        if (Math.abs(wrap(x - laneRel)) < LANE + maxSlope * 2 + r * 0.8) continue;
        this.obstacle(x + this.shipX, d + (Math.random() - 0.5) * 4, r, 0.6 + Math.random() * 1.2, true);
      }
    }
  }

  /** Random open-ground props at `density`, none closer than `clear` (+ their size) to the lane. */
  private scatter(d: number, density: number, laneRel: number, clear: number): void {
    const expected = (density / 100) * SPAN * STEP;
    const tries = Math.ceil(expected * 2);
    const p = tries > 0 ? expected / tries : 0;
    for (let i = 0; i < tries; i++) {
      if (Math.random() >= p) continue;
      this.pickProp();
      const x = (Math.random() * 2 - 1) * W;
      if (Math.abs(wrap(x - laneRel)) < clear + this.propHit) continue;
      this.placeProp(x, d + (Math.random() - 0.5) * STEP, true);
    }
  }

  /** Choose the next open-ground prop's kind and size (sets propKind/propSize/propHit). */
  private pickProp(): void {
    const m = TH.land.mix;
    const r = Math.random() * (m.mushroom + m.spire + m.rock + m.crystal);
    if (r < m.mushroom) {
      this.propKind = Prop.Mushroom;
      this.propSize = 0.8 + Math.random() * 0.45;
      this.propHit = 0.2 * this.propSize;
    } else if (r < m.mushroom + m.spire) {
      this.propKind = Prop.Spire;
      this.propSize = 0.8 + Math.random() * 0.4;
      this.propHit = 0.16 * this.propSize;
    } else if (r < m.mushroom + m.spire + m.rock) {
      this.propKind = Prop.Rock;
      this.propSize = 0.5 + Math.random() * 0.6;
      this.propHit = 0.8 * this.propSize;
    } else {
      this.propKind = Prop.Crystal;
      this.propSize = 0.8 + Math.random() * 0.5;
      this.propHit = 0.45 * this.propSize;
    }
  }

  /** Place the prop chosen by pickProp() at ship-relative `x`. Trees collide at the trunk only. */
  private placeProp(x: number, d: number, wraps: boolean): void {
    const s = this.propSize;
    const h = this.propHit;
    const rot = Math.random() * Math.PI * 2;
    if (this.propKind === Prop.Rock) {
      this.obstacleRocks.spawn(x, 0, d, s, (0.6 + Math.random()) / BOULDER_HEIGHT, s, rot, true, wraps, h, h);
    } else {
      const field = this.propKind === Prop.Mushroom ? this.mushrooms : this.propKind === Prop.Spire ? this.spires : this.crystals;
      field.spawn(x, 0, d, s, s * (0.85 + Math.random() * 0.3), s, rot, true, wraps, h, h);
    }
  }
  // --- shared path steering --------------------------------------------------

  /** Wind the path centre; slope changes gradually so turns are smooth. */
  private steerCentre(d: number, maxSlope: number): void {
    if (d >= this.cxRetargetAt) {
      this.cxTargetSlope = (Math.random() * 2 - 1) * maxSlope;
      this.cxRetargetAt = d + 25 + Math.random() * 35;
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
      this.laneTarget = (Math.random() * 2 - 1) * Math.max(0, maxOffset) * 0.8;
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
        const r = 0.9 + Math.random() * 0.8;
        this.rock(this.cx + side * (hw + r * 0.65), d + k * STEP * 0.5, r, 1.6 + Math.random() * 2.6);
      }
      for (let k = 0; k < 2; k++) {
        const r = 1.5 + Math.random() * 2.2;
        const off = hw + 2 + k * 6 + Math.random() * 6;
        this.rock(this.cx + side * off, d + (Math.random() - 0.5) * STEP, r, 4 + Math.random() * 7);
      }
      // Crystals growing out of the canyon sides (scenery: behind the wall rocks, never hit).
      if (Math.random() < c.wallCrystals) {
        const s = 1.1 + Math.random() * 1.1;
        const x = this.cx + side * (hw + 1.4 + Math.random() * 4) - this.shipX;
        this.crystals.spawn(x, 0, d, s, s * (0.8 + Math.random() * 0.6), s, Math.random() * 6.28, false, false, 0, 0, false);
      }
    }

    if (this.quiet(d)) return;

    // Obstacles: dark rocks, laid out so the way through reads from a distance.
    if (d < this.nextFeatureAt) return;
    const jitter = maxSlope * STEP * 0.5;
    if (sub === 0) {
      // Lone boulders.
      this.nextFeatureAt = d + range(c.loneBoulderSpacing);
      const r = 0.9 + Math.random() * 0.5;
      const x = this.offLane(hw - r, LANE + r * 0.8 + jitter);
      if (x !== null) this.obstacle(x, d, r, 1.2 + Math.random() * 0.8);
    } else if (sub === 1 || Math.random() < 0.3) {
      // Rockfall band across the path with one wide gap on the lane.
      this.nextFeatureAt = d + range(c.bandSpacing) * (sub === 2 ? 1.6 : 1);
      this.band(d, hw, c.bandGapWidth / 2 + jitter);
    } else {
      // Pillar slalom: one or two tall pillars off the lane.
      this.nextFeatureAt = d + range(c.pillarSpacing);
      const count = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const r = 0.7 + Math.random() * 0.3;
        const x = this.offLane(hw - r, LANE + r * 0.8 + jitter + 0.3);
        if (x === null) continue;
        if (Math.random() < 0.5) {
          this.obstacle(x, d + i * 3, r, 5 + Math.random() * 4);
        } else {
          // Crystal spire instead of a rock pillar.
          const s = r * 1.5;
          this.crystals.spawn(x - this.shipX, 0, d + i * 3, s, s * 1.4, s, Math.random() * 6.28, true, false, r * 0.8, r * 0.8);
        }
      }
    }
  }

  /** A row of boulders across the canyon, leaving a gap of half-width `gapHalf` on the lane. */
  private band(d: number, hw: number, gapHalf: number): void {
    for (let x = this.cx - hw + 0.8; x < this.cx + hw - 0.5; x += 1.7) {
      const r = 0.75 + Math.random() * 0.2;
      if (Math.abs(x - this.lane) < gapHalf + r * 0.8) continue;
      this.obstacle(x, d + (Math.random() - 0.5) * 0.6, r, 0.9 + Math.random() * 0.7);
    }
  }

  /** Random x within cx ± halfRange at least `clear` from the lane, or null. */
  private offLane(halfRange: number, clear: number): number | null {
    for (let t = 0; t < 6; t++) {
      const x = this.cx + (Math.random() * 2 - 1) * halfRange;
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
    const side = plan && Math.random() < 0.25 ? -towards : towards;
    let roomHw: number;
    if (plan) {
      roomHw = plan.halfWidth;
    } else {
      const extra = def.extraWidth(base);
      roomHw = Math.max(2.2, base + (vary && extra > 1 ? extra * range(it.sizeVariation) : extra));
    }
    const offset = plan ? plan.offset : def.laneOffset ? def.laneOffset(base) : null;

    // Every room (and some corridors) shifts the centre line sideways: an S-bend.
    const dir = Math.random() < 0.5 ? -1 : 1;
    let shift = 0;
    if (id !== 'corridor') shift = dir * range(it.roomShift);
    else if (jog && Math.random() < it.corridorJogChance) shift = dir * range(it.corridorJog);

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
      const door = base + it.doorExtra;
      const fw = 34;
      const fh = 10;
      this.hullBox(this.cx - door - wallT - fw / 2, 0, d - 1, fw, fh, 1.2, true);
      this.hullBox(this.cx + door + wallT + fw / 2, 0, d - 1, fw, fh, 1.2, true);
      this.hullBox(this.cx, it.wallHeight, d - 1, 2 * door + 2 * wallT, fh - it.wallHeight, 1.2, false);
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
        this.hullBox(wx, 0, d, thick, H, depth, true);
      }
      if (k < 0) this.prevWallL = inner;
      else this.prevWallR = inner;
    }
    if (def.ceiling) this.hullBox(this.cx, H, d, span, 0.35, depth, false);
    this.hullBox(this.cx, -0.14, d, span, 0.14, depth, false); // floor
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

    // Door frame where each room or corridor begins: lintel, jambs and floor stripes.
    if (this.framePending) {
      this.framePending = false;
      this.hullBox(this.cx, H - 0.6, d, span, 0.6, 0.7, false);
      this.hullBox(this.cx - hw - 0.3, 0, d, 0.6, H, 0.9, true);
      this.hullBox(this.cx + hw + 0.3, 0, d, 0.6, H, 0.9, true);
      for (const off of [0.6, 1.1]) this.light(this.cx, 0.01, d + off, hw * 2, 0.01, 0.22, Light.Amber, false);
    }

    // Room contents (split rooms only once the dividers are up).
    if (!def.build || this.quiet(d)) return;
    if (d < this.roomStart + taper || d > this.roomEnd - taper) return;
    if (this.plan && !split) return;
    def.build(api);
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
        const phase = Math.random() < 0.5 ? Math.asin(s) : Math.PI - Math.asin(s);
        w.hull.setNextMotion(amp, CONFIG.themes.interior.rooms.pistons.travel, phase);
        w.hullBox(centre, 0, d, width, h, depth, true, true);
      },
      light(x, y, d, width, h, depth, colour, solid = false) {
        w.light(x, y, d, width, h, depth, colour, solid);
      },
      tree(x, d, size) {
        const field = Math.random() < 0.6 ? w.mushrooms : w.spires;
        const hit = (field === w.mushrooms ? 0.2 : 0.16) * size;
        field.spawn(x - w.shipX, 0.35, d, size, size, size, Math.random() * Math.PI * 2, true, false, hit, hit);
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
    this.obstacleRocks.spawn(x - this.shipX, 0, d, r, height / BOULDER_HEIGHT, r, Math.random() * Math.PI * 2, true, wraps, hit, hit);
  }

  private rock(x: number, d: number, r: number, height: number): void {
    const hit = r * 0.8;
    this.rocks.spawn(x - this.shipX, 0, d, r, height / BOULDER_HEIGHT, r, Math.random() * Math.PI * 2, true, false, hit, hit, false);
  }
}
