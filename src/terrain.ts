import { CONFIG } from './config';

// Rolling hills on open ground. Height is a function of distance along the
// run only, so everything at the same distance rises and falls together:
// instances add it in InstancedField.sync and the ground plane adds it in its
// vertex shader. Heights are drawn relative to the ship's own, so the ship
// stays put and the land ahead climbs and drops. Collision is unaffected (it's
// all in the ground plane), so hills change the view, never the course.
//
// Two layers: rolling waves everywhere, plus a few big hill sections (broad
// bumps) per theme. One window of hills at a time: set when an open-ground
// theme is generated, faded in and out at its ends, flat everywhere else.

const T = CONFIG.terrain;
export const MAX_BUMPS = 4;

export const terrain = {
  start: 0,
  end: 0,
  amp: 0, // 0 = flat
  p: 0, // phases of the two waves
  q: 0,
  /** Big hill sections: centre distance, half-width and height, packed in threes. */
  bumps: new Float32Array(MAX_BUMPS * 3),

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

  flatten(): void {
    this.amp = 0;
    this.bumps.fill(0);
  },

  heightAt(d: number): number {
    if (this.amp === 0 || d <= this.start || d >= this.end) return 0;
    const fade = smooth((d - this.start - T.flatEdge) / T.fade) * smooth((this.end - d - T.flatEdge) / T.fade);
    if (fade <= 0) return 0;
    let h = this.amp * (0.6 * Math.sin(d * T.freqA + this.p) + 0.4 * Math.sin(d * T.freqB + this.q));
    for (let i = 0; i < MAX_BUMPS; i++) {
      const w = this.bumps[i * 3 + 1];
      if (w <= 0) continue;
      const x = (d - this.bumps[i * 3]) / w;
      h += this.bumps[i * 3 + 2] * Math.exp(-x * x);
    }
    return fade * h;
  },
};

function smooth(t: number): number {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

/** The same height function in GLSL, for the ground's vertex shader. */
export const TERRAIN_GLSL = /* glsl */ `
uniform float uDistance;
uniform vec4 uHill; // start, end, amp, unused
uniform vec2 uPhase;
uniform vec3 uBumps[${MAX_BUMPS}];
float hillSmooth(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hillAt(float d) {
  if (uHill.z == 0.0 || d <= uHill.x || d >= uHill.y) return 0.0;
  float fade = hillSmooth((d - uHill.x - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)})
             * hillSmooth((uHill.y - d - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)});
  float h = uHill.z * (0.6 * sin(d * ${T.freqA} + uPhase.x) + 0.4 * sin(d * ${T.freqB} + uPhase.y));
  for (int i = 0; i < ${MAX_BUMPS}; i++) {
    if (uBumps[i].y > 0.0) {
      float x = (d - uBumps[i].x) / uBumps[i].y;
      h += uBumps[i].z * exp(-x * x);
    }
  }
  return fade * h;
}
`;
