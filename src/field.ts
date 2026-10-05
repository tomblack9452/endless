import { BufferGeometry, type Color, InstancedBufferAttribute, InstancedMesh, type Material, Scene } from 'three';
import { CONFIG } from './config';
import { terrain } from './terrain';

// A pool of instances of one mesh (blocks, hull plates, rocks, light strips).
// Positions are stored relative to the ship laterally (the ship always sits
// at x = 0) and as absolute travelled distance `d` along the run. An
// instance is drawn at z = distance - d, so things ahead have negative z.
// Instances flagged `wraps` live on a lateral loop of [-halfWidth, halfWidth)
// so open ground never runs out; bounded themes don't wrap.
//
// Moving instances slide sideways as a function of travelled distance, not
// time: x = base + amp * sin(freq * (distance - d) + phase). When the ship
// arrives (distance = d) the position is base + amp * sin(phase) whatever the
// speed, so the generator knows exactly where it will be.
//
// Ramped instances (setNextRamp) move once instead: sideways or down by
// `amp`, over `len` units of approach, finishing `finish` units before the
// ship reaches them. Used for closing doors and falling debris.
//
// Optional per-instance colours come from a small table (see setColorTable).

export class InstancedField {
  readonly x: Float32Array;
  readonly y: Float32Array; // base height
  readonly d: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  readonly cos: Float32Array; // rotation about y
  readonly sin: Float32Array;
  readonly hx: Float32Array; // collision half-extents
  readonly hz: Float32Array;
  readonly active: Uint8Array;
  readonly solid: Uint8Array;
  readonly wraps: Uint8Array;
  readonly scores: Uint8Array; // counts for near misses (walls don't)
  readonly moving: Uint8Array; // 0 still, 1 sine, 2 ramp sideways, 3 ramp down, 4 pulse up/down
  readonly bx: Float32Array; // moving: centre of travel
  readonly amp: Float32Array;
  readonly freq: Float32Array;
  readonly phase: Float32Array;
  readonly colorIdx: Uint8Array;
  readonly tilt: Uint8Array; // floors, ceilings and planks lean with the slope they're on
  /**
   * Rolling pieces (tumbleweeds): sideways movers that turn over as they go, by
   * the distance they've travelled over this radius per unit of scale, and hop
   * a little. Their geometry is centred on the origin; y is the centre height.
   */
  rollRadius = 0;
  /** Set before spawn(): make the next instance lean with the slope (see terrain.ts). */
  nextTilt = false;
  private colorTable: Color[] | null = null;
  private colorAttr: InstancedBufferAttribute | null = null;
  /** Set before spawn(): colour table index for the next instance. */
  nextColor = 0;
  private nextAmp = 0;
  private nextFreq = 0;
  private nextPhase = 0;
  private nextRamp = 0; // 0 = the next motion is a sine
  private readonly free: Int32Array;
  private freeTop = 0;
  count = 0;

  readonly mesh: InstancedMesh;

  constructor(
    scene: Scene,
    geometry: BufferGeometry,
    material: Material | Material[],
    readonly max: number,
  ) {
    this.x = new Float32Array(max);
    this.y = new Float32Array(max);
    this.d = new Float32Array(max);
    this.sx = new Float32Array(max);
    this.sy = new Float32Array(max);
    this.sz = new Float32Array(max);
    this.cos = new Float32Array(max);
    this.sin = new Float32Array(max);
    this.hx = new Float32Array(max);
    this.hz = new Float32Array(max);
    this.active = new Uint8Array(max);
    this.solid = new Uint8Array(max);
    this.wraps = new Uint8Array(max);
    this.scores = new Uint8Array(max);
    this.moving = new Uint8Array(max);
    this.bx = new Float32Array(max);
    this.amp = new Float32Array(max);
    this.freq = new Float32Array(max);
    this.phase = new Float32Array(max);
    this.colorIdx = new Uint8Array(max);
    this.tilt = new Uint8Array(max);
    this.free = new Int32Array(max);

    this.mesh = new InstancedMesh(geometry, material, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const a = this.mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < max; i++) a[i * 16 + 15] = 1;
    scene.add(this.mesh);
    this.clear();
  }

  /** Enable per-instance colours from `table` (colours are read live each sync). */
  setColorTable(table: Color[]): void {
    this.colorTable = table;
    this.colorAttr = new InstancedBufferAttribute(new Float32Array(this.max * 3), 3);
    this.mesh.instanceColor = this.colorAttr;
  }

  /** Make the next spawn() a moving instance (see the note at the top). */
  /**
   * Make the next spawn() pulse up and down (steam vents): fully up while
   * sin(2pi * (distance - d) / period + phase) > 0, sunk by `drop` otherwise.
   * Sunk instances don't collide. Like sine motion it's tied to distance, so
   * phase -pi/2 means "down when the ship arrives", at any speed.
   */
  setNextPulse(drop: number, period: number, phase: number): void {
    this.nextAmp = drop;
    this.nextFreq = (Math.PI * 2) / period;
    this.nextPhase = phase;
    this.nextRamp = 4;
  }

  /** Make the next spawn() ramp once: sideways (`down` false) or dropping from `amp` above. */
  setNextRamp(amp: number, len: number, finish: number, down: boolean): void {
    this.nextAmp = amp;
    this.nextFreq = len;
    this.nextPhase = finish;
    this.nextRamp = down ? 3 : 2;
  }

  setNextMotion(amp: number, freq: number, phase: number): void {
    this.nextAmp = amp;
    this.nextFreq = freq;
    this.nextPhase = phase;
  }

  clear(): void {
    this.active.fill(0);
    this.freeTop = 0;
    for (let i = this.max - 1; i >= 0; i--) this.free[this.freeTop++] = i;
    this.count = 0;
  }

  spawn(
    x: number,
    y: number,
    d: number,
    sx: number,
    sy: number,
    sz: number,
    rotY: number,
    solid: boolean,
    wraps: boolean,
    hx: number,
    hz: number,
    scores = true,
  ): void {
    if (this.freeTop === 0) return;
    const i = this.free[--this.freeTop];
    this.active[i] = 1;
    this.x[i] = wraps ? wrap(x) : x;
    this.y[i] = y;
    this.d[i] = d;
    this.sx[i] = sx;
    this.sy[i] = sy;
    this.sz[i] = sz;
    this.cos[i] = Math.cos(rotY);
    this.sin[i] = Math.sin(rotY);
    this.solid[i] = solid ? 1 : 0;
    this.wraps[i] = wraps ? 1 : 0;
    this.hx[i] = hx;
    this.hz[i] = hz;
    this.scores[i] = scores && solid ? 1 : 0;
    this.colorIdx[i] = this.nextColor;
    this.nextColor = 0;
    this.tilt[i] = this.nextTilt ? 1 : 0;
    this.nextTilt = false;
    if (this.nextAmp !== 0) {
      this.moving[i] = this.nextRamp || 1;
      this.amp[i] = this.nextAmp;
      this.freq[i] = this.nextFreq;
      this.phase[i] = this.nextPhase;
      if (this.nextRamp === 4) {
        this.bx[i] = y; // a pulse keeps its raised height here
      } else if (this.nextRamp === 3) {
        this.bx[i] = y; // a drop keeps its resting height here
        this.y[i] = y + this.nextAmp;
      } else if (this.nextRamp === 2) {
        this.bx[i] = x;
      } else {
        this.bx[i] = x;
        this.x[i] = x + this.nextAmp * Math.sin(this.nextPhase);
      }
      this.nextAmp = 0;
      this.nextRamp = 0;
    } else {
      this.moving[i] = 0;
    }
    this.count++;
  }

  private release(i: number): void {
    this.active[i] = 0;
    this.free[this.freeTop++] = i;
    this.count--;
  }

  /** Remove everything with d below `limit`. */
  clearBefore(limit: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.active[i] && this.d[i] < limit) this.release(i);
    }
  }

  /** Shift sideways by `dx` (the ship moved right by dx) and recycle what fell behind `behind`. */
  advance(dx: number, behind: number): void {
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      if (this.d[i] < behind) {
        this.release(i);
        continue;
      }
      const x = this.x[i] - dx;
      this.x[i] = this.wraps[i] ? wrap(x) : x;
      if (this.moving[i] === 1 || this.moving[i] === 2) this.bx[i] -= dx;
    }
  }

  /** Update moving instances for the current distance. */
  animate(distance: number): void {
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i] || !this.moving[i]) continue;
      const m = this.moving[i];
      if (m === 1) {
        this.x[i] = this.bx[i] + this.amp[i] * Math.sin(this.freq[i] * (distance - this.d[i]) + this.phase[i]);
        continue;
      }
      if (m === 4) {
        const s = Math.sin(this.freq[i] * (distance - this.d[i]) + this.phase[i]);
        const up = s <= -0.15 ? 0 : s >= 0.15 ? 1 : (s + 0.15) / 0.3;
        this.y[i] = this.bx[i] - this.amp[i] * (1 - up);
        continue;
      }
      // Ramp: 0 far out, 1 once `finish` ahead of the ship, eased.
      const ahead = this.d[i] - distance;
      let t = 1 - (ahead - this.phase[i]) / this.freq[i];
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      if (m === 2) {
        this.x[i] = this.bx[i] + this.amp[i] * t * t * (3 - 2 * t);
      } else {
        this.y[i] = this.bx[i] + this.amp[i] * (1 - t * t); // falls, accelerating
      }
    }
  }

  /** Where instance `i` will be when the ship reaches it (ship-relative x). */
  arrivalX(i: number): number {
    const m = this.moving[i];
    if (m === 1) return this.bx[i] + this.amp[i] * Math.sin(this.phase[i]);
    if (m === 2) return this.bx[i] + this.amp[i];
    return this.x[i];
  }

  /**
   * True if the ship hit a solid instance while moving from prevDistance to
   * distance and sideways by `dx`. Both axes are swept, so a long frame can't
   * carry the ship through a thin wall.
   */
  hitTest(prevDistance: number, distance: number, dx: number): boolean {
    const shipX = CONFIG.ship.hitHalfWidth;
    const shipZ = CONFIG.ship.hitHalfDepth;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i] || !this.solid[i]) continue;
      // A pulsing vent that's mostly sunk is harmless.
      if (this.moving[i] === 4 && this.y[i] < this.bx[i] - this.amp[i] * 0.5) continue;
      const rx = this.hx[i] + shipX;
      // Instances moved by -dx this frame, so they were at x + dx before it.
      const x = this.x[i];
      const lo = dx > 0 ? x : x + dx;
      const hi = dx > 0 ? x + dx : x;
      if (lo > rx || hi < -rx) continue;
      // Swept test along z so high speeds can't tunnel through.
      const rz = this.hz[i] + shipZ;
      const zPrev = prevDistance - this.d[i];
      const zNow = distance - this.d[i];
      if (zNow >= -rz && zPrev <= rz) return true;
    }
    return false;
  }

  /**
   * Records scoring obstacles whose centre passed the ship this frame with
   * at most `range` between their edge and the ship's hitbox. Writes the side
   * (-1 left, 1 right) and that gap into `side`/`gap` from index `n`;
   * returns the new count.
   */
  passes(prevDistance: number, distance: number, range: number, side: Float32Array, gap: Float32Array, n: number): number {
    const shipHalf = CONFIG.ship.hitHalfWidth;
    for (let i = 0; i < this.max && n < side.length; i++) {
      if (!this.active[i] || !this.scores[i]) continue;
      const d = this.d[i];
      if (d <= prevDistance || d > distance) continue;
      const x = this.x[i];
      const g = (x < 0 ? -x : x) - this.hx[i] - shipHalf;
      if (g > range) continue;
      side[n] = x < 0 ? -1 : 1;
      gap[n] = g;
      n++;
    }
    return n;
  }
  /** Write instance matrices for every active instance (`shipX`: the ship's world x, for split heights). */
  sync(distance: number, shipX = 0): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
    const hills = terrain.active;
    const h0 = hills ? terrain.heightAtX(distance, shipX) : 0;
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i]) continue;
      const o = n * 16;
      const c = this.cos[i];
      const s = this.sin[i];
      const sx = this.sx[i];
      const sz = this.sz[i];
      a[o] = c * sx;
      a[o + 1] = 0;
      a[o + 2] = -s * sx;
      a[o + 4] = 0;
      a[o + 5] = this.sy[i];
      a[o + 6] = 0;
      a[o + 8] = s * sz;
      a[o + 9] = 0;
      a[o + 10] = c * sz;
      a[o + 12] = this.x[i];
      if (hills) {
        const wx = shipX + this.x[i];
        const di = this.d[i];
        a[o + 13] = this.y[i] + terrain.heightAtX(di, wx) - h0;
        if (this.tilt[i]) {
          // Lean about x to the slope here (after any turn about y), so neighbouring
          // rows meet without steps: rotation = Rx(lean) * Ry(turn) * scale.
          const slope = (terrain.heightAtX(di + 0.6, wx) - terrain.heightAtX(di - 0.6, wx)) / 1.2;
          const k = 1 / Math.sqrt(1 + slope * slope); // cos of the lean
          const t = slope * k; // sin of the lean
          const sy = this.sy[i];
          a[o] = c * sx;
          a[o + 1] = t * s * sx;
          a[o + 2] = -k * s * sx;
          a[o + 5] = k * sy;
          a[o + 6] = t * sy;
          a[o + 8] = s * sz;
          a[o + 9] = -t * c * sz;
          a[o + 10] = k * c * sz;
        }
      } else {
        a[o + 13] = this.y[i];
      }
      a[o + 14] = distance - this.d[i];
      if (this.rollRadius > 0 && this.moving[i] === 2) {
        // Turn about z by how far it has rolled, and bounce along.
        const angle = -(this.x[i] - this.bx[i]) / (this.rollRadius * sx);
        const rc = Math.cos(angle);
        const rs = Math.sin(angle);
        a[o] = rc * sx;
        a[o + 1] = rs * sx;
        a[o + 2] = 0;
        a[o + 4] = -rs * this.sy[i];
        a[o + 5] = rc * this.sy[i];
        a[o + 6] = 0;
        a[o + 8] = 0;
        a[o + 9] = 0;
        a[o + 10] = sz;
        a[o + 13] += Math.abs(Math.sin(angle * 0.5)) * 0.35 * this.sy[i];
      }
      if (this.colorTable) {
        const col = this.colorTable[this.colorIdx[i]];
        const ca = this.colorAttr!.array as Float32Array;
        ca[n * 3] = col.r;
        ca[n * 3 + 1] = col.g;
        ca[n * 3 + 2] = col.b;
      }
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.colorAttr) this.colorAttr.needsUpdate = true;
  }
}

export function randomHeight(): number {
  const f = CONFIG.field;
  return f.minHeight + (f.maxHeight - f.minHeight) * Math.pow(Math.random(), f.heightBias);
}

const W = CONFIG.field.halfWidth;
const SPAN = W * 2;

export function wrap(x: number): number {
  if (x >= W || x < -W) return x - SPAN * Math.floor((x + W) / SPAN);
  return x;
}
