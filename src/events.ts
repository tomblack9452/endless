import { BufferAttribute, BufferGeometry, Color, LineBasicMaterial, LineSegments, Points, PointsMaterial, Scene } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';
import type { ThemeId } from './world';

// Theme events: a stretch of weather or trouble partway through a theme.
//   meteors   - open ground: meteors streak down to the horizon and thud
//   sandstorm - canyon: the air turns to sand, visibility drops, grit blows across
//   redAlert  - ship interior: power failure, red emergency lighting and an alarm
// They change the look and sound only; the course itself is generated as normal.

export type EventKind = 'none' | 'meteors' | 'sandstorm' | 'redAlert';

const E = CONFIG.events;
const WHITE = new Color(1, 1, 1);
const EVENT_FOR: Record<ThemeId, EventKind> = { land: 'meteors', canyon: 'sandstorm', interior: 'redAlert' };
export const EVENT_NOTICE: Record<EventKind, string> = {
  none: '',
  meteors: 'meteor shower',
  sandstorm: 'sandstorm',
  redAlert: 'red alert. power failure',
};

interface Meteor {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  live: boolean;
}

export class Events {
  kind: EventKind = 'none';
  /** Eased 0..1: how strongly the event shows. */
  amount = 0;
  private timeLeft = 0;
  private clock = 0;
  private nextMeteor = 0;
  /** Set when a meteor lands this frame: its pan (-1..1), for the thud. */
  impact: number | null = null;
  /** True on the frame the alarm should sound. */
  alarm = false;
  private nextAlarm = 0;

  private readonly meteors: Meteor[] = [];
  private readonly meteorPos = new Float32Array(E.meteors.count * 6);
  private readonly meteorGeo = new BufferGeometry();
  private readonly meteorMat = new LineBasicMaterial({ color: E.meteors.color, transparent: true, depthWrite: false, fog: false });
  private readonly sandPos = new Float32Array(E.sandstorm.streaks * 6);
  private readonly sandX = new Float32Array(E.sandstorm.streaks);
  private readonly sandY = new Float32Array(E.sandstorm.streaks);
  private readonly sandZ = new Float32Array(E.sandstorm.streaks);
  private readonly sandGeo = new BufferGeometry();
  private readonly sandMat = new LineBasicMaterial({ transparent: true, depthWrite: false, fog: false });
  private readonly meteorLines: LineSegments;
  private readonly headPos = new Float32Array(E.meteors.count * 3);
  private readonly headGeo = new BufferGeometry();
  private readonly headMat = new PointsMaterial({ color: E.meteors.color, size: 5, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
  private readonly heads: Points;
  private readonly sandLines: LineSegments;
  private readonly sand = new Color(E.sandstorm.color);
  private readonly red = new Color(E.redAlert.color);
  private readonly dark = new Color(E.redAlert.dark);

  constructor(scene: Scene) {
    for (let i = 0; i < E.meteors.count; i++) this.meteors.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, live: false });
    this.meteorGeo.setAttribute('position', new BufferAttribute(this.meteorPos, 3));
    this.meteorLines = new LineSegments(this.meteorGeo, this.meteorMat);
    this.meteorLines.frustumCulled = false;
    this.meteorLines.renderOrder = -2;
    this.meteorLines.visible = false;
    scene.add(this.meteorLines);
    this.headGeo.setAttribute('position', new BufferAttribute(this.headPos, 3));
    this.heads = new Points(this.headGeo, this.headMat);
    this.heads.frustumCulled = false;
    this.heads.renderOrder = -2;
    this.meteorLines.add(this.heads);
    this.sandGeo.setAttribute('position', new BufferAttribute(this.sandPos, 3));
    this.sandLines = new LineSegments(this.sandGeo, this.sandMat);
    this.sandLines.frustumCulled = false;
    this.sandLines.visible = false;
    scene.add(this.sandLines);
    for (let i = 0; i < E.sandstorm.streaks; i++) this.respawnSand(i, true);
  }

  /** The event that belongs to a theme. */
  static forTheme(theme: ThemeId): EventKind {
    return EVENT_FOR[theme];
  }

  start(kind: EventKind): void {
    this.kind = kind;
    this.timeLeft = E.seconds;
    this.nextMeteor = 0.5;
    this.nextAlarm = 0;
  }

  /** Stop at once (new run, main menu). */
  clear(): void {
    this.kind = 'none';
    this.amount = 0;
    this.timeLeft = 0;
    for (const m of this.meteors) m.live = false;
    this.meteorLines.visible = this.sandLines.visible = false;
  }

  /** `allowed` is false once the theme has changed (the event fades out early). */
  update(dt: number, dz: number, allowed: boolean): void {
    this.impact = null;
    this.alarm = false;
    this.clock += dt;
    if (this.kind === 'none') return;
    this.timeLeft -= dt;
    const on = this.timeLeft > 0 && allowed;
    const goal = on ? 1 : 0;
    this.amount += (goal - this.amount) * (1 - Math.exp(-(on ? 1.2 : 0.8) * dt));
    if (!on && this.amount < 0.01) {
      this.clear();
      return;
    }
    if (this.kind === 'meteors') this.updateMeteors(dt, on);
    else if (this.kind === 'sandstorm') this.updateSand(dt, dz);
    else if (this.kind === 'redAlert' && on) {
      this.nextAlarm -= dt;
      if (this.nextAlarm <= 0) {
        this.nextAlarm = E.redAlert.alarmEvery;
        this.alarm = true;
      }
    }
  }

  /** Fog density multiplier (sandstorm thickens the air). */
  fogScale(): number {
    return this.kind === 'sandstorm' ? 1 + E.sandstorm.fog * this.amount : 1;
  }

  /** Recolour the live palette for the event (after time of day). */
  tint(p: LivePalette): void {
    const k = this.amount;
    if (k <= 0.001) return;
    if (this.kind === 'sandstorm') {
      p.fog.lerp(this.sand, 0.65 * k);
      p.sky.lerp(this.sand, 0.55 * k);
      p.ground.lerp(this.sand, 0.2 * k);
    } else if (this.kind === 'redAlert') {
      // Slow emergency-light pulse.
      const pulse = 0.55 + 0.45 * Math.sin(this.clock * Math.PI * 2 * E.redAlert.pulseHz);
      p.strip.lerp(this.red, k);
      p.fog.lerp(this.dark, 0.6 * k);
      p.sky.lerp(this.dark, 0.6 * k);
      // Structure lit red, dimmer between pulses.
      p.alert.setRGB(1, 0.42 + 0.2 * (1 - pulse), 0.38 + 0.2 * (1 - pulse)).multiplyScalar(0.75 + 0.25 * pulse);
      p.alert.lerpColors(WHITE, p.alert, k);
    } else if (this.kind === 'meteors') {
      p.sky.lerp(this.sand, 0.12 * k); // a faint warm haze
    }
  }

  private updateMeteors(dt: number, spawning: boolean): void {
    const M = E.meteors;
    this.nextMeteor -= dt;
    if (spawning && this.nextMeteor <= 0) {
      this.nextMeteor = M.every[0] + Math.random() * (M.every[1] - M.every[0]);
      const m = this.meteors.find((x) => !x.live);
      if (m) {
        const side = Math.random() < 0.5 ? -1 : 1;
        m.z = -M.distance[0] - Math.random() * (M.distance[1] - M.distance[0]);
        m.x = (Math.random() * 2 - 1) * -m.z * 0.6;
        m.y = -m.z * (0.35 + Math.random() * 0.25);
        const speed = -m.z * (0.5 + Math.random() * 0.3);
        m.vx = side * speed * 0.5;
        m.vy = -speed;
        m.live = true;
      }
    }
    let any = false;
    for (let i = 0; i < this.meteors.length; i++) {
      const m = this.meteors[i];
      const o = i * 6;
      if (!m.live) {
        this.meteorPos.fill(0, o, o + 6);
        this.headPos.fill(0, i * 3, i * 3 + 3);
        continue;
      }
      any = true;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y <= 0) {
        m.live = false;
        this.impact = Math.max(-1, Math.min(1, m.x / (-m.z * 0.6)));
        continue;
      }
      const tail = M.tail;
      const len = Math.hypot(m.vx, m.vy);
      this.meteorPos[o] = m.x;
      this.meteorPos[o + 1] = m.y;
      this.meteorPos[o + 2] = m.z;
      this.meteorPos[o + 3] = m.x - (m.vx / len) * tail * -m.z * 0.1;
      this.meteorPos[o + 4] = m.y - (m.vy / len) * tail * -m.z * 0.1;
      this.meteorPos[o + 5] = m.z;
      this.headPos.set([m.x, m.y, m.z], i * 3);
    }
    this.meteorLines.visible = any;
    this.meteorMat.opacity = this.headMat.opacity = this.amount;
    (this.meteorGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.headGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  private updateSand(dt: number, dz: number): void {
    const S = E.sandstorm;
    this.sandLines.visible = true;
    this.sandMat.color.copy(this.sand).multiplyScalar(0.8);
    this.sandMat.opacity = S.opacity * this.amount;
    const wind = S.wind * dt;
    for (let i = 0; i < S.streaks; i++) {
      this.sandX[i] += wind;
      this.sandZ[i] += dz;
      if (this.sandX[i] > S.width || this.sandZ[i] > CONFIG.camera.distanceBehind) this.respawnSand(i, false);
      const o = i * 6;
      this.sandPos[o] = this.sandX[i];
      this.sandPos[o + 1] = this.sandY[i];
      this.sandPos[o + 2] = this.sandZ[i];
      this.sandPos[o + 3] = this.sandX[i] - S.length;
      this.sandPos[o + 4] = this.sandY[i] + 0.04;
      this.sandPos[o + 5] = this.sandZ[i] - 0.3;
    }
    (this.sandGeo.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  private respawnSand(i: number, anywhere: boolean): void {
    const S = E.sandstorm;
    this.sandX[i] = anywhere ? (Math.random() * 2 - 1) * S.width : -S.width - Math.random() * 4;
    this.sandY[i] = 0.1 + Math.random() * 2.5;
    this.sandZ[i] = -2 - Math.random() * 40;
  }
}
