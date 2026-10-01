import { BufferGeometry, type Color, InstancedBufferAttribute, InstancedMesh, type Material, Scene } from 'three';
import { CONFIG } from './config';

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
  readonly moving: Uint8Array;
  readonly bx: Float32Array; // moving: centre of travel
  readonly amp: Float32Array;
  readonly freq: Float32Array;
  readonly phase: Float32Array;
  private readonly colorIdx: Uint8Array;
  private colorTable: Color[] | null = null;
  private colorAttr: InstancedBufferAttribute | null = null;
  /** Set before spawn(): colour table index for the next instance. */
  nextColor = 0;
  private nextAmp = 0;
  private nextFreq = 0;
  private nextPhase = 0;
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
    if (this.nextAmp !== 0) {
      this.moving[i] = 1;
      this.bx[i] = x;
      this.amp[i] = this.nextAmp;
      this.freq[i] = this.nextFreq;
      this.phase[i] = this.nextPhase;
      this.x[i] = x + this.nextAmp * Math.sin(this.nextPhase);
      this.nextAmp = 0;
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
      if (this.moving[i]) this.bx[i] -= dx;
    }
  }

  /** Update moving instances for the current distance. */
  animate(distance: number): void {
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i] || !this.moving[i]) continue;
      this.x[i] = this.bx[i] + this.amp[i] * Math.sin(this.freq[i] * (distance - this.d[i]) + this.phase[i]);
    }
  }

  /** Where instance `i` will be when the ship reaches it (ship-relative x). */
  arrivalX(i: number): number {
    return this.moving[i] ? this.bx[i] + this.amp[i] * Math.sin(this.phase[i]) : this.x[i];
  }

  /** True if the ship hit a solid instance while moving from prevDistance to distance. */
  hitTest(prevDistance: number, distance: number): boolean {
    const shipX = CONFIG.ship.hitHalfWidth;
    const shipZ = CONFIG.ship.hitHalfDepth;
    for (let i = 0; i < this.max; i++) {
      if (!this.active[i] || !this.solid[i]) continue;
      const rx = this.hx[i] + shipX;
      const x = this.x[i];
      if (x > rx || x < -rx) continue;
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
  /** Write instance matrices for every active instance. */
  sync(distance: number): void {
    const a = this.mesh.instanceMatrix.array as Float32Array;
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
      a[o + 13] = this.y[i];
      a[o + 14] = distance - this.d[i];
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
