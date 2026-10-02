import { CONFIG } from './config';

// Rolling hills on open ground. Height is a function of distance along the
// run only, so everything at the same distance rises and falls together:
// instances add it in InstancedField.sync and the ground plane adds it in its
// vertex shader. Heights are drawn relative to the ship's own, so the ship
// stays put and the land ahead climbs and drops. Collision is unaffected (it's
// all in the ground plane), so hills change the view, never the course.
//
// One window of hills at a time: set when an open-ground theme is generated,
// faded in and out at its ends, flat everywhere else.

const T = CONFIG.terrain;

export const terrain = {
  start: 0,
  end: 0,
  amp: 0, // 0 = flat
  p: 0, // phases of the two waves
  q: 0,

  /** Hills between `start` and `end` (distances), with these wave phases. */
  setWindow(start: number, end: number, p: number, q: number): void {
    this.start = start;
    this.end = end;
    this.amp = T.amplitude;
    this.p = p;
    this.q = q;
  },

  flatten(): void {
    this.amp = 0;
  },

  heightAt(d: number): number {
    if (this.amp === 0 || d <= this.start || d >= this.end) return 0;
    const fade = smooth((d - this.start - T.flatEdge) / T.fade) * smooth((this.end - d - T.flatEdge) / T.fade);
    if (fade <= 0) return 0;
    return this.amp * fade * (0.6 * Math.sin(d * T.freqA + this.p) + 0.4 * Math.sin(d * T.freqB + this.q));
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
float hillSmooth(float t) { t = clamp(t, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float hillAt(float d) {
  if (uHill.z == 0.0 || d <= uHill.x || d >= uHill.y) return 0.0;
  float fade = hillSmooth((d - uHill.x - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)})
             * hillSmooth((uHill.y - d - ${T.flatEdge.toFixed(1)}) / ${T.fade.toFixed(1)});
  return uHill.z * fade * (0.6 * sin(d * ${T.freqA} + uPhase.x) + 0.4 * sin(d * ${T.freqB} + uPhase.y));
}
`;
