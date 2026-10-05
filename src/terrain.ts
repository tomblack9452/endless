import { CONFIG } from './config';

// Height of the world, as a function of distance along the run (and, inside
// a split, of how far across it you are). Everything is drawn relative to the
// ship's own height: instances add it in InstancedField.sync and the ground
// plane in its vertex shader, so the ship stays put and the land, canyon or
// deck ahead climbs and drops. Collision is unaffected (everything at the
// same spot rises together), so heights change the view, never the course.
//
// Four layers:
//   hills   rolling waves plus a few broad bumps, on open ground (one window)
//   steps   ramps, platforms and drops in the canyon and the ship: each step
//           eases the height by `delta` between two distances, and they add up
//   lift    a split where one branch climbs and the other dips (upper and
//           lower routes): it depends on x as well, across the island
//   pits    chasms: the ground (only) falls away between two distances; bridges
//           span them. The ship never follows a pit down.

const T = CONFIG.terrain;
export const MAX_BUMPS = 4;
export const MAX_STEPS = 12;
export const MAX_PITS = 4;

export const terrain = {
  start: 0,
  end: 0,
  amp: 0, // 0 = no hills
  p: 0, // phases of the two waves
  q: 0,
  /** Big hill sections: centre distance, half-width and height, packed in threes. */
  bumps: new Float32Array(MAX_BUMPS * 3),
  /** Steps: start, end and height change, packed in threes (unused slots have end <= start). */
  steps: new Float32Array(MAX_STEPS * 3),
  /** Height from steps already folded away (they're all behind the ship). */
  base: 0,
  /** Lift: rise start/end, fall start/end (distances), then centre x (world), half-width, up and down heights. */
  lift: new Float32Array(8),
  /** Pits: start and end distances, in pairs. */
  pits: new Float32Array(MAX_PITS * 2),
  pitNext: 0, // next pit slot (a ring)

  /** Hills between `start` and `end` (distances), with these wave phases and big hills. */
  setWindow(start: number, end: number, p: number, q: number, bumps: [number, number, number][] = []): void {
    this.start = start;
    this.end = end;
    this.amp = T.amplitude;
    this.p = p;
    this.q = q;
    this.bumps.fill(0);
    bumps.slice(0, MAX_BUMPS).forEach(([c, w, h], i) => this.bumps.set([c, w, h], i * 3));
  },

  /** Back to flat ground everywhere (a new run). */
  flatten(): void {
    this.amp = 0;
    this.bumps.fill(0);
    this.steps.fill(0);
    this.base = 0;
    this.lift.fill(0);
    this.pits.fill(0);
    this.pitNext = 0;
  },

  /** True if anything makes the world not flat (lets the per-frame work be skipped). */
  get active(): boolean {
    if (this.amp !== 0 || this.lift[6] !== 0 || this.lift[7] !== 0) return true;
    for (let i = 0; i < MAX_STEPS; i++) if (this.steps[i * 3 + 1] > this.steps[i * 3]) return true;
    return false;
  },

  /** Ease the height by `delta` between distances `a` and `b`. */
  addStep(a: number, b: number, delta: number): void {
    let slot = -1;
    let oldest = Infinity;
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = this.steps[i * 3];
      const e = this.steps[i * 3 + 1];
      if (e <= s) {
        slot = i;
        break;
      }
      if (e < oldest) {
        oldest = e;
        slot = i;
      }
    }
    // Full: the oldest finished step's height moves into the base first.
    if (this.steps[slot * 3 + 1] > this.steps[slot * 3]) this.base += this.steps[slot * 3 + 2];
    this.steps.set([a, b, delta], slot * 3);
  },

  /** Fold steps that finished before `d` into the base (call as the ship moves on). */
  fold(d: number): void {
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = this.steps[i * 3];
      const e = this.steps[i * 3 + 1];
      if (e > s && e < d) {
        this.base += this.steps[i * 3 + 2];
        this.steps.fill(0, i * 3, i * 3 + 3);
      }
    }
  },

  /** Total of every step, finished or not: the level the generator has built up to. */
  get level(): number {
    let h = this.base;
    for (let i = 0; i < MAX_STEPS; i++) if (this.steps[i * 3 + 1] > this.steps[i * 3]) h += this.steps[i * 3 + 2];
    return h;
  },

  /**
   * A split's upper and lower routes: between `x - half` and `x + half` (world)
   * the floor tilts from `down` (on the -side * side) to `up` (on the side
   * `upSide` points to), easing in from `a0` to `a1` and back out from `b0` to `b1`.
   */
  setLift(a0: number, a1: number, b0: number, b1: number, x: number, half: number, up: number, down: number, upSide: number): void {
    this.lift.set([a0, a1, b0, b1, x, half * upSide, up, down]);
  },

  /** A chasm in the ground between `a` and `b`. */
  addPit(a: number, b: number): void {
    const i = this.pitNext;
    this.pits.set([a, b], i * 2);
    this.pitNext = (i + 1) % MAX_PITS;
  },

  /** Hills and steps at distance `d` (no lift). */
  heightAt(d: number): number {
    let h = this.base;
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = this.steps[i * 3];
      const e = this.steps[i * 3 + 1];
      if (e <= s) continue;
      h += this.steps[i * 3 + 2] * smooth((d - s) / (e - s));
    }
    if (this.amp === 0 || d <= this.start || d >= this.end) return h;
    const fade = smooth((d - this.start - T.flatEdge) / T.fade) * smooth((this.end - d - T.flatEdge) / T.fade);
    if (fade <= 0) return h;
    let hill = this.amp * (0.6 * Math.sin(d * T.freqA + this.p) + 0.4 * Math.sin(d * T.freqB + this.q));
    for (let i = 0; i < MAX_BUMPS; i++) {
      const w = this.bumps[i * 3 + 1];
      if (w <= 0) continue;
      const x = (d - this.bumps[i * 3]) / w;
      hill += this.bumps[i * 3 + 2] * Math.exp(-x * x);
    }
    return h + fade * hill;
  },

  /** The split lift at distance `d` and world x `x`. */
  liftAt(d: number, x: number): number {
    const L = this.lift;
    if ((L[6] === 0 && L[7] === 0) || d <= L[0] || d >= L[3]) return 0;
    const k = smooth((d - L[0]) / Math.max(1, L[1] - L[0])) * smooth((L[3] - d) / Math.max(1, L[3] - L[2]));
    const t = smooth(((x - L[4]) / L[5] + 1) / 2); // 0 on the low side, 1 on the high side
    return k * (L[7] + (L[6] - L[7]) * t);
  },

  /** Full height at distance `d` and world x `x`. */
  heightAtX(d: number, x: number): number {
    return this.heightAt(d) + this.liftAt(d, x);
  },
};

function smooth(t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** The same height functions in GLSL, for the ground's vertex shader. */
export const TERRAIN_GLSL = /* glsl */ `
uniform float uDistance;
uniform float uShipX;
uniform vec4 uHill; // start, end, amp, unused
uniform vec2 uPhase;
uniform vec3 uBumps[${MAX_BUMPS}];
uniform vec3 uSteps[${MAX_STEPS}];
uniform vec4 uLiftD; // rise start, rise end, fall start, fall end
uniform vec4 uLiftX; // centre x, signed half-width, up, down
uniform vec2 uPits[${MAX_PITS}];
float hillSmooth(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hillAt(float d) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_STEPS}; i++) {
    if (uSteps[i].y > uSteps[i].x) h += uSteps[i].z * hillSmooth((d - uSteps[i].x) / (uSteps[i].y - uSteps[i].x));
  }
  if (uHill.z == 0.0 || d <= uHill.x || d >= uHill.y) return h;
  float fade = hillSmooth((d - uHill.x - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)})
             * hillSmooth((uHill.y - d - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)});
  float w = uHill.z * (0.6 * sin(d * ${T.freqA} + uPhase.x) + 0.4 * sin(d * ${T.freqB} + uPhase.y));
  for (int i = 0; i < ${MAX_BUMPS}; i++) {
    if (uBumps[i].y > 0.0) {
      float x = (d - uBumps[i].x) / uBumps[i].y;
      w += uBumps[i].z * exp(-x * x);
    }
  }
  return h + fade * w;
}
float liftAt(float d, float x) {
  if ((uLiftX.z == 0.0 && uLiftX.w == 0.0) || d <= uLiftD.x || d >= uLiftD.w) return 0.0;
  float k = hillSmooth((d - uLiftD.x) / max(1.0, uLiftD.y - uLiftD.x)) * hillSmooth((uLiftD.w - d) / max(1.0, uLiftD.w - uLiftD.z));
  float t = hillSmooth(((x - uLiftX.x) / uLiftX.y + 1.0) * 0.5);
  return k * (uLiftX.w + (uLiftX.z - uLiftX.w) * t);
}
// 0 on solid ground, 1 at the bottom of a chasm (short sloped edges).
float pitAt(float d) {
  float p = 0.0;
  for (int i = 0; i < ${MAX_PITS}; i++) {
    if (uPits[i].y > uPits[i].x) p = max(p, hillSmooth((d - uPits[i].x) / 2.0) * hillSmooth((uPits[i].y - d) / 2.0));
  }
  return p;
}
`;
