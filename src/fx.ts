import {
  AdditiveBlending,
  BufferAttribute,
  DoubleSide,
  BufferGeometry,
  Color,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Scene,
} from 'three';

// Animated set dressing for the ship interior: pouring liquids, pools,
// steam, blinking lights, holograms and sparks. The animated looks are
// material patches driven by two shared uniforms (time and distance); each
// instance gets its own phase from its place along the run, so neighbours
// don't move in lockstep. Sparks are a small particle pool fed by emitters
// the world registers as it builds rooms.

/** Seconds since start (drives every animated material). */
export const fxTime = { value: 0 };
/** Distance along the run (gives each instance a fixed phase). */
export const fxDistance = { value: 0 };

export type FxKind = 'pour' | 'pool' | 'steam' | 'blink' | 'holo' | 'vent' | 'water' | 'tank';

const COMMON = /* glsl */ `
uniform float uFxTime;
uniform float uFxDistance;
varying vec3 vFxLocal;
varying float vFxPhase;
`;

const FRAG: Record<FxKind, string> = {
  // Streaks running down a falling sheet of liquid.
  pour: `
    float s = fract(vFxLocal.y * 2.2 + uFxTime * 2.6 + vFxPhase + sin(vFxLocal.x * 40.0 + vFxLocal.z * 40.0) * 0.15);
    float streak = smoothstep(0.5, 1.0, s);
    diffuseColor.rgb *= 0.65 + 0.8 * streak;
    diffuseColor.a *= 0.45 + 0.55 * streak;`,
  // Rings spreading out from the middle of a pool.
  pool: `
    float r = length(vFxLocal.xz) * 2.0;
    float ring = 0.5 + 0.5 * sin(r * 9.0 - uFxTime * 3.2 + vFxPhase * 6.28);
    diffuseColor.rgb *= 0.82 + 0.28 * ring;`,
  // A jet that puffs on and off, thinning towards its end.
  steam: `
    float on = smoothstep(0.1, 0.6, sin(uFxTime * 2.1 + vFxPhase * 6.28));
    float along = clamp(vFxLocal.y, 0.0, 1.0);
    float churn = 0.75 + 0.25 * sin(vFxLocal.y * 13.0 - uFxTime * 9.0 + vFxPhase * 20.0);
    diffuseColor.a *= on * (1.0 - along) * churn;`,
  // Indicator lights blinking at their own rate.
  blink: `
    float rate = 0.5 + fract(vFxPhase * 7.13) * 1.6;
    float lit = step(0.45, fract(uFxTime * rate + vFxPhase));
    diffuseColor.rgb *= 0.25 + 0.95 * lit;`,
  // Hologram: scan lines, a slow sweep and a little flicker.
  holo: `
    float lines = 0.55 + 0.45 * step(0.5, fract(vFxLocal.y * 18.0 - uFxTime * 1.5));
    float sweep = smoothstep(0.92, 1.0, fract(vFxLocal.y * 0.5 - uFxTime * 0.35 + vFxPhase));
    float flicker = 0.85 + 0.15 * sin(uFxTime * 31.0 + vFxPhase * 50.0);
    diffuseColor.a *= (0.35 * lines + 0.5 * sweep) * flicker;`,
  // Water: slow crossing ripples and glints.
  water: `
    float wa = sin(vFxLocal.x * 7.0 + uFxTime * 1.3 + vFxPhase * 6.28) * sin(vFxLocal.z * 5.0 - uFxTime * 0.9);
    float glint = smoothstep(0.75, 1.0, wa);
    diffuseColor.rgb *= 0.72 + 0.18 * wa + 0.5 * glint;`,
  // Glass tank: bubbles rising through glowing liquid.
  tank: `
    float rise = fract(vFxLocal.y * 2.5 - uFxTime * 0.7 + vFxPhase + sin(vFxLocal.x * 21.0) * 0.3);
    float bubble = smoothstep(0.9, 1.0, rise) * step(0.0, sin(vFxLocal.x * 30.0 + vFxLocal.z * 30.0 + vFxPhase * 6.28));
    diffuseColor.rgb *= 0.75 + 0.6 * bubble + 0.15 * vFxLocal.y;`,
  // Steam vent column (a hazard): churning, brightest at the base.
  vent: `
    float churn = 0.7 + 0.3 * sin(vFxLocal.y * 10.0 - uFxTime * 12.0 + vFxPhase * 30.0);
    diffuseColor.a *= churn * (1.0 - 0.6 * clamp(vFxLocal.y, 0.0, 1.0));`,
};

/**
 * A MeshBasicMaterial with one of the animated looks. Instanced meshes only
 * (the phase comes from the instance's place along the run). `local` is the
 * geometry space the look reads, so unit boxes stretched by instances work.
 */
export function fxMaterial(kind: FxKind, opts: { transparent?: boolean; opacity?: number; additive?: boolean } = {}): MeshBasicMaterial {
  const transparent = opts.transparent ?? (kind !== 'pool' && kind !== 'blink' && kind !== 'water');
  const m = new MeshBasicMaterial({
    transparent,
    opacity: opts.opacity ?? 1,
    depthWrite: !transparent,
  });
  if (opts.additive) m.blending = AdditiveBlending;
  // Plumes and holograms are open shapes: seen from inside and out.
  if (kind === 'steam' || kind === 'vent' || kind === 'holo') m.side = DoubleSide;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uFxTime = fxTime;
    shader.uniforms.uFxDistance = fxDistance;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${COMMON}`).replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vFxLocal = position;
      #ifdef USE_INSTANCING
        float fxD = uFxDistance - instanceMatrix[3].z;
      #else
        float fxD = 0.0;
      #endif
      vFxPhase = fract(sin(floor(fxD * 4.0) * 12.9898) * 43758.5453);`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG[kind]}`);
  };
  return m;
}

/** Colours for liquids and lights (fx colour table order). */
export const enum Liquid {
  Coolant = 0,
  Water = 1,
  Molten = 2,
  Steam = 3,
  Holo = 4,
}

export const LIQUID_COLOURS = ['#5fd0b8', '#6aa8e0', '#ff8a3a', '#e8ecef', '#7fe0f0'].map((c) => new Color(c));

// --- sparks --------------------------------------------------------------------

const SPARKS = 160;
const EMITTERS = 64;

/** Showers of sparks from broken panels, fed by emitters the world registers. */
export class Sparks {
  private readonly pos = new Float32Array(SPARKS * 3);
  private readonly vel = new Float32Array(SPARKS * 3);
  private readonly life = new Float32Array(SPARKS);
  private readonly ex = new Float32Array(EMITTERS); // world x
  private readonly ey = new Float32Array(EMITTERS);
  private readonly ed = new Float32Array(EMITTERS).fill(-Infinity);
  private head = 0;
  private next = 0;
  private wx = new Float32Array(SPARKS); // world x of each spark (ship moves sideways)
  private wd = new Float32Array(SPARKS); // distance of each spark
  private readonly geometry = new BufferGeometry();
  private readonly points: Points;

  constructor(scene: Scene) {
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    const mat = new PointsMaterial({ color: '#ffd27a', size: 0.06, transparent: true, depthWrite: false, blending: AdditiveBlending });
    this.points = new Points(this.geometry, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.clear();
  }

  clear(): void {
    this.ed.fill(-Infinity);
    this.life.fill(0);
    this.pos.fill(-100);
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  /** A sparking point at world x, height y, distance d. */
  addEmitter(x: number, y: number, d: number): void {
    this.ex[this.head] = x;
    this.ey[this.head] = y;
    this.ed[this.head] = d;
    this.head = (this.head + 1) % EMITTERS;
  }

  update(dt: number, distance: number, shipX: number): void {
    // Burst from emitters ahead in view now and then.
    for (let e = 0; e < EMITTERS; e++) {
      const ahead = this.ed[e] - distance;
      if (ahead < -2 || ahead > 70) continue;
      if (Math.random() > dt * 2.5) continue;
      const n = 4 + Math.floor(Math.random() * 6);
      for (let k = 0; k < n; k++) {
        const i = this.next;
        this.next = (this.next + 1) % SPARKS;
        this.life[i] = 0.4 + Math.random() * 0.5;
        this.wx[i] = this.ex[e];
        this.wd[i] = this.ed[e];
        this.pos[i * 3 + 1] = this.ey[e];
        this.vel[i * 3] = (Math.random() - 0.5) * 3;
        this.vel[i * 3 + 1] = Math.random() * 2.5;
        this.vel[i * 3 + 2] = (Math.random() - 0.5) * 3;
      }
    }
    for (let i = 0; i < SPARKS; i++) {
      const o = i * 3;
      if (this.life[i] <= 0) {
        this.pos[o + 1] = -100;
        continue;
      }
      this.life[i] -= dt;
      this.vel[o + 1] -= 9 * dt; // gravity
      this.wx[i] += this.vel[o] * dt;
      this.wd[i] -= this.vel[o + 2] * dt;
      this.pos[o] = this.wx[i] - shipX;
      this.pos[o + 1] = Math.max(0.02, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] = distance - this.wd[i];
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}
