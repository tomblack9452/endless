import { BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, type Scene } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';

// Weather that comes with an area rather than an event: snow on the ice field
// (light, then medium, then a blizzard as the levels go on) and ash and smoke
// on the volcanic plain (thicker the further in you are). One pool of
// particles drifting past the camera, plus fog density and tint.

const W = CONFIG.weather;

export type WeatherKind = 'none' | 'snow' | 'ash';

export class Weather {
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly mat = new PointsMaterial({ size: 0.09, transparent: true, depthWrite: false, fog: true });
  private readonly points: Points;
  private kind: WeatherKind = 'none';
  /** 0..1+, how heavy it is (eased towards the target). */
  private amount = 0;
  private target = 0;
  private wind = 0;
  private readonly snow = new Color(W.snowColor);
  private readonly ash = new Color(W.ashColor);
  private readonly smoke = new Color(W.smokeFog);
  private readonly white = new Color(W.blizzardFog);

  constructor(scene: Scene) {
    const n = W.particles;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.respawn(i, true);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  /** What falls and how heavily (0 = none, 1 = heavy, a little over in later loops). */
  set(kind: WeatherKind, amount: number): void {
    if (kind !== this.kind && amount > 0) {
      this.kind = kind;
      this.mat.color.copy(kind === 'snow' ? this.snow : this.ash);
      this.mat.size = kind === 'snow' ? W.snowSize : W.ashSize;
    }
    this.target = kind === 'none' ? 0 : amount;
  }

  clear(): void {
    this.kind = 'none';
    this.amount = this.target = 0;
    this.points.visible = false;
  }

  /** Move the flakes past the camera at forward `speed`. */
  update(dt: number, speed: number): void {
    this.amount += (this.target - this.amount) * (1 - Math.exp(-dt / W.ease));
    const on = this.amount > 0.01;
    this.points.visible = on;
    if (!on) return;
    const n = W.particles;
    const shown = Math.min(n, Math.round(n * Math.min(1, this.amount)));
    this.geo.setDrawRange(0, shown);
    this.mat.opacity = Math.min(1, 0.35 + this.amount * 0.6);
    // Gusts: the wind swings slowly, harder in a blizzard.
    this.wind = Math.sin(performance.now() / 1700) * (this.kind === 'snow' ? W.snowWind : W.ashWind) * this.amount;
    const fall = this.kind === 'snow' ? W.snowFall : W.ashFall;
    for (let i = 0; i < shown; i++) {
      const k = i * 3;
      this.pos[k] += (this.vel[k] + this.wind) * dt;
      this.pos[k + 1] -= (fall + this.vel[k + 1]) * dt;
      this.pos[k + 2] += speed * dt;
      if (this.pos[k + 1] < 0 || this.pos[k + 2] > 6 || Math.abs(this.pos[k]) > W.halfWidth) this.respawn(i, false);
    }
    this.geo.attributes.position.needsUpdate = true;
  }

  private respawn(i: number, anywhere: boolean): void {
    const k = i * 3;
    this.pos[k] = (Math.random() * 2 - 1) * W.halfWidth;
    this.pos[k + 1] = anywhere ? Math.random() * W.height : W.height * (0.6 + Math.random() * 0.4);
    this.pos[k + 2] = -Math.random() * W.depth;
    this.vel[k] = (Math.random() - 0.5) * 1.5;
    this.vel[k + 1] = Math.random() * 1.2;
  }

  /** Fog density multiplier: blizzards and smoke close the view in. */
  fogScale(): number {
    if (this.kind === 'snow') return 1 + W.blizzardFogScale * this.amount;
    if (this.kind === 'ash') return 1 + W.smokeFogScale * this.amount;
    return 1;
  }

  /** Whiten the air in snow, darken it in smoke. */
  tint(p: LivePalette): void {
    const k = Math.min(1, this.amount);
    if (k <= 0.01) return;
    if (this.kind === 'snow') {
      p.fog.lerp(this.white, 0.55 * k);
      p.sky.lerp(this.white, 0.4 * k);
    } else if (this.kind === 'ash') {
      p.fog.lerp(this.smoke, 0.6 * k);
      p.sky.lerp(this.smoke, 0.5 * k);
    }
  }
}
