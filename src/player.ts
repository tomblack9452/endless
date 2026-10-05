import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Scene,
  Vector3,
} from 'three';
import type { Fin, Marking } from './looks';
import { CONFIG } from './config';
import type { ShipId } from './cosmetics';
import type { LivePalette } from './palette';

const DEG = Math.PI / 180;
const WHITE = new Color(1, 1, 1);
const S = CONFIG.ship;

// Outline in the ground plane (x, z). Nose points to -z.
const NOSE = new Vector3(0, 0, -S.length * 0.6);
const LEFT = new Vector3(-S.halfWidth, 0, S.length * 0.4);
const RIGHT = new Vector3(S.halfWidth, 0, S.length * 0.4);
const RIDGE = new Vector3(0, S.height, S.length * 0.28);

/**
 * Ship shapes (cosmetic; the hitbox is the same for all). Each is a list of
 * triangles, light faces first then shaded ones, plus an outline for the
 * shadow. Units are the ship's half-width (w), length (l) and ridge height (h).
 */
function shipShape(id: ShipId): { light: Vector3[]; shade: Vector3[]; outline: Vector3[] } {
  const w = S.halfWidth;
  const l = S.length;
  const h = S.height;
  const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
  switch (id) {
    case 'wing': {
      // Wide, shallow delta with a notched tail.
      const nose = v(0, 0, -l * 0.5);
      const lt = v(-w * 1.5, 0, l * 0.45);
      const rt = v(w * 1.5, 0, l * 0.45);
      const ridge = v(0, h * 0.8, l * 0.05);
      const notch = v(0, 0, l * 0.25);
      return { light: [nose, lt, ridge, ridge, notch, rt], shade: [nose, ridge, rt, lt, notch, ridge], outline: [nose, lt, rt] };
    }
    case 'needle': {
      // Long and narrow with a tall spine.
      const nose = v(0, 0, -l * 0.85);
      const lt = v(-w * 0.62, 0, l * 0.45);
      const rt = v(w * 0.62, 0, l * 0.45);
      const ridge = v(0, h * 1.6, l * 0.3);
      return { light: [nose, lt, ridge], shade: [nose, ridge, rt, lt, rt, ridge], outline: [nose, lt, rt] };
    }
    case 'manta': {
      // Broad body with forward canards.
      const nose = v(0, 0, -l * 0.55);
      const lt = v(-w * 1.25, 0, l * 0.35);
      const rt = v(w * 1.25, 0, l * 0.35);
      const tail = v(0, 0, l * 0.5);
      const ridge = v(0, h * 1.1, l * 0.1);
      const cl = v(-w * 0.7, 0.01, -l * 0.25);
      const cr = v(w * 0.7, 0.01, -l * 0.25);
      return {
        light: [nose, lt, ridge, ridge, tail, rt, nose, cl, v(0, 0.01, -l * 0.15)],
        shade: [nose, ridge, rt, lt, tail, ridge, nose, v(0, 0.01, -l * 0.15), cr],
        outline: [nose, lt, rt],
      };
    }
    case 'arrow': {
      // Long, slim dart with a deep notch between two tail points.
      const nose = v(0, 0, -l * 0.8);
      const lt = v(-w * 0.95, 0, l * 0.5);
      const rt = v(w * 0.95, 0, l * 0.5);
      const ridge = v(0, h * 1.3, l * 0.05);
      const notch = v(0, 0, l * 0.15);
      return { light: [nose, lt, ridge, ridge, notch, rt], shade: [nose, ridge, rt, lt, notch, ridge], outline: [nose, lt, rt] };
    }
    case 'talon': {
      // Wings swept forward from a narrow tail.
      const nose = v(0, 0, -l * 0.6);
      const lt = v(-w * 1.35, 0, -l * 0.02);
      const rt = v(w * 1.35, 0, -l * 0.02);
      const tl = v(-w * 0.45, 0, l * 0.5);
      const tr = v(w * 0.45, 0, l * 0.5);
      const ridge = v(0, h * 1.2, l * 0.12);
      return {
        light: [nose, lt, ridge, lt, tl, ridge, tl, tr, ridge],
        shade: [nose, ridge, rt, rt, ridge, tr],
        outline: [nose, v(-w * 1.1, 0, l * 0.45), v(w * 1.1, 0, l * 0.45)],
      };
    }
    default: {
      // Dart: the original low pyramid.
      return { light: [NOSE, LEFT, RIDGE], shade: [NOSE, RIDGE, RIGHT, LEFT, RIGHT, RIDGE], outline: [NOSE, LEFT, RIGHT] };
    }
  }
}

function shipGeometry(id: ShipId): BufferGeometry {
  const s = shipShape(id);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...s.light, ...s.shade].flatMap(xyz), 3));
  g.addGroup(0, s.light.length, 0);
  g.addGroup(s.light.length, s.shade.length, 1);
  return g;
}

// --- dressing: markings, fins and the wing decal --------------------------------

const DOWN = new Vector3(0, -1, 0);
const UP_Z = new Vector3(0, 0, 1);
const raycaster = new Raycaster();
const probeMat = new MeshBasicMaterial({ side: DoubleSide });
const SURFACE_LIFT = 0.006;

/** Where the hull's top surface is above (x, z), in ship space, or null if off the hull. */
function surface(geometry: BufferGeometry, x: number, z: number): { y: number; normal: Vector3 } | null {
  const probe = new Mesh(geometry, probeMat);
  probe.updateMatrixWorld();
  raycaster.set(new Vector3(x, 1, z), DOWN);
  const hit = raycaster.intersectObject(probe)[0];
  if (!hit) return null;
  const normal = hit.face ? hit.face.normal.clone() : new Vector3(0, 1, 0);
  if (normal.y < 0) normal.negate();
  return { y: hit.point.y, normal };
}

/** A quad in hull space: `a` runs tail (0) to nose (1), `b` across (-1 left edge, 1 right edge). */
type Quad = [number, number][];

const MARKINGS: Record<Exclude<Marking, 'none'>, Quad[]> = {
  stripe: [[[0.04, -0.16], [0.04, 0.16], [0.92, 0.16], [0.92, -0.16]]],
  twin: [
    [[0.04, -0.55], [0.04, -0.34], [0.85, -0.34], [0.85, -0.55]],
    [[0.04, 0.34], [0.04, 0.55], [0.85, 0.55], [0.85, 0.34]],
  ],
  split: [[[0.01, -0.97], [0.01, 0], [0.97, 0], [0.97, -0.97]]],
  twotone: [[[0.01, -0.97], [0.01, 0.97], [0.38, 0.97], [0.38, -0.97]]],
  chevron: [
    [[0.3, -0.85], [0.45, -0.85], [0.66, 0], [0.51, 0]],
    [[0.51, 0], [0.66, 0], [0.45, 0.85], [0.3, 0.85]],
  ],
};

interface Frame {
  nose: Vector3;
  left: Vector3;
}

/** Hull space (a, b) to ship x, z. */
function hullPoint(f: Frame, a: number, b: number): [number, number] {
  const tailZ = f.left.z;
  const halfW = Math.abs(f.left.x);
  return [b * halfW * (1 - a), tailZ + (f.nose.z - tailZ) * a];
}

/** Lay a quad onto the hull's top surface as a grid of small triangles. */
function drape(geometry: BufferGeometry, f: Frame, q: Quad, out: number[]): void {
  const N = 6;
  const at = (s: number, t: number): number[] | null => {
    const a0 = q[0][0] + (q[1][0] - q[0][0]) * s;
    const b0 = q[0][1] + (q[1][1] - q[0][1]) * s;
    const a1 = q[3][0] + (q[2][0] - q[3][0]) * s;
    const b1 = q[3][1] + (q[2][1] - q[3][1]) * s;
    const [x, z] = hullPoint(f, a0 + (a1 - a0) * t, b0 + (b1 - b0) * t);
    const hit = surface(geometry, x, z);
    return hit ? [x, hit.y + SURFACE_LIFT, z] : null;
  };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const p00 = at(i / N, j / N);
      const p10 = at((i + 1) / N, j / N);
      const p11 = at((i + 1) / N, (j + 1) / N);
      const p01 = at(i / N, (j + 1) / N);
      if (!p00 || !p10 || !p11 || !p01) continue;
      out.push(...p00, ...p10, ...p11, ...p00, ...p11, ...p01);
    }
  }
}

function finGeometry(geometry: BufferGeometry, f: Frame, fin: Exclude<Fin, 'none'>): BufferGeometry {
  const pos: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const len = f.left.z - f.nose.z;
  const on = (x: number, z: number) => new Vector3(x, (surface(geometry, x, z)?.y ?? 0) - 0.002, z);
  if (fin === 'tail' || fin === 'twin') {
    const xs = fin === 'tail' ? [0] : [-Math.abs(f.left.x) * 0.4, Math.abs(f.left.x) * 0.4];
    for (const x of xs) {
      const back = on(x * 0.8, f.left.z - len * 0.06);
      const front = on(x, f.left.z - len * 0.4);
      const top = back.clone().add(new Vector3(0, fin === 'tail' ? 0.15 : 0.11, len * 0.02));
      tri(back, front, top);
    }
  } else {
    for (const side of [-1, 1]) {
      const tip = new Vector3(Math.abs(f.left.x) * side, 0, f.left.z);
      const along = tip.clone().lerp(new Vector3(0, 0, f.nose.z), 0.28);
      const base0 = on(tip.x * 0.97, tip.z - 0.01);
      const base1 = on(along.x, along.z);
      const top = base0.clone().add(new Vector3(side * 0.035, 0.1, 0));
      tri(base0, base1, top);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** Draw an SVG (in white) into a texture, asynchronously. */
function svgTexture(svg: string, texture: CanvasTexture): void {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.replace(/currentColor/g, '#ffffff'));
}

/** Perceived brightness 0..1. */
function luma(c: Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

interface Fragment {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
}

export class Player {
  readonly root = new Group(); // follows bank
  private readonly shield: Mesh;
  private readonly shieldMat: MeshBasicMaterial;
  private readonly body: Mesh;
  private readonly shadow: Mesh;
  private readonly matTop: MeshBasicMaterial;
  private readonly matShade: MeshBasicMaterial;
  private readonly matShadow: MeshBasicMaterial;
  // Dressing (see looks.ts), all children of the body so they bank and blink with it.
  private readonly decor = new Group();
  private readonly matMarking = new MeshBasicMaterial({ side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  private readonly matDecal: MeshBasicMaterial;
  private readonly decalTexture: CanvasTexture;
  private shape: ShipId = 'dart';
  private shaped = false;
  private marking: Marking = 'none';
  private fin: Fin = 'none';
  private decalSvg: string | null = null;
  private paint: [Color, Color] | null = null;
  private readonly fragments: Fragment[] = [];

  lateral = 0; // sideways speed, units/s, + = right
  steer = 0; // smoothed steering, -1..1
  private broken = false;
  private falling = false;
  private fallVel = 0;

  constructor(scene: Scene, private readonly palette: LivePalette) {
    this.matTop = new MeshBasicMaterial({ color: palette.ship, side: DoubleSide });
    this.matShade = new MeshBasicMaterial({ color: palette.shipShade, side: DoubleSide });
    this.matShadow = new MeshBasicMaterial({
      color: palette.text,
      transparent: true,
      opacity: S.shadowOpacity,
      depthWrite: false,
    });

    this.body = new Mesh(shipGeometry('dart'), [this.matTop, this.matShade]);
    this.root.add(this.body);
    this.body.add(this.decor);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    this.decalTexture = new CanvasTexture(canvas);
    this.matDecal = new MeshBasicMaterial({ map: this.decalTexture, transparent: true, depthWrite: false, side: DoubleSide });
    this.root.position.y = S.hoverY;
    scene.add(this.root);
    // Shield bubble: a faint wireframe shell, shown while a shield is held.
    this.shieldMat = new MeshBasicMaterial({ color: CONFIG.powers.shield.color, wireframe: true, transparent: true, opacity: 0.3, fog: false });
    this.shield = new Mesh(new IcosahedronGeometry(S.length * 0.62, 1), this.shieldMat);
    this.shield.scale.set(1, 0.55, 1);
    this.shield.visible = false;
    this.root.add(this.shield);

    const sg = new BufferGeometry();
    sg.setAttribute(
      'position',
      new Float32BufferAttribute([...xyz(NOSE), ...xyz(LEFT), ...xyz(RIGHT)], 3),
    );
    this.shadow = new Mesh(sg, this.matShadow);
    this.shadow.position.y = 0.01;
    this.shadow.scale.set(1.05, 1, 1.05);
    this.shadow.renderOrder = 1;
    scene.add(this.shadow);

    this.buildFragments(scene);
    this.setVisible(false);
  }

  /** 0 hides the ground shadow (no ground in the asteroid belt), 1 shows it. */
  setShadowAmount(k: number): void {
    this.matShadow.opacity = S.shadowOpacity * k; // opacity only: visibility belongs to setVisible/crash
  }

  setShield(on: boolean): void {
    this.shield.visible = on;
  }

  /** Spin the shield; `blink` > 0 flickers the ship (grace after a shield hit). */
  updateShield(dt: number, blink: number): void {
    this.shield.rotation.y += dt * 0.8;
    this.body.visible = blink <= 0 || Math.floor(blink * 14) % 2 === 0;
  }

  /** Paint colours (top, shade), or null for the palette's own. */
  setPaint(colors: [string, string] | null): void {
    this.paint = colors ? [new Color(colors[0]), new Color(colors[1])] : null;
    this.applyPalette();
  }

  /** Markings, fins and the wing decal (an insignia SVG, or null). */
  setDressing(marking: Marking, fin: Fin, decalSvg: string | null): void {
    if (marking === this.marking && fin === this.fin && decalSvg === this.decalSvg) return;
    this.marking = marking;
    this.fin = fin;
    this.decalSvg = decalSvg;
    this.buildDecor();
  }

  /** Rebuild the dressing for the current hull. */
  private buildDecor(): void {
    for (const child of [...this.decor.children]) {
      (child as Mesh).geometry.dispose();
      this.decor.remove(child);
    }
    const geometry = this.body.geometry;
    const s = shipShape(this.shape);
    const frame: Frame = { nose: s.outline[0], left: s.outline[1] };
    if (this.marking !== 'none') {
      const pos: number[] = [];
      for (const q of MARKINGS[this.marking]) drape(geometry, frame, q, pos);
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      this.decor.add(new Mesh(g, this.matMarking));
    }
    if (this.fin !== 'none') this.decor.add(new Mesh(finGeometry(geometry, frame, this.fin), this.matShade));
    if (this.decalSvg) {
      const [x, z] = hullPoint(frame, 0.32, -0.55);
      const hit = surface(geometry, x, z);
      if (hit) {
        svgTexture(this.decalSvg, this.decalTexture);
        const size = Math.min(0.11, Math.abs(frame.left.x) * 0.45);
        const decal = new Mesh(new PlaneGeometry(size, size), this.matDecal);
        decal.position.set(x, hit.y + SURFACE_LIFT * 1.5, z);
        decal.quaternion.setFromUnitVectors(UP_Z, hit.normal);
        decal.rotateZ(Math.PI); // nose up the insignia, seen from behind
        this.decor.add(decal);
      }
    }
  }

  /** Swap the ship's shape (cosmetic). */
  setShape(id: ShipId): void {
    if (id === this.shape && this.shaped) return; // same hull: nothing to rebuild
    this.shaped = true;
    this.shape = id;
    const s = shipShape(id);
    this.body.geometry.dispose();
    this.body.geometry = shipGeometry(id);
    this.shadow.geometry.dispose();
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(s.outline.flatMap(xyz), 3));
    this.shadow.geometry = sg;
    this.buildDecor();
  }

  applyPalette(): void {
    if (this.paint) {
      // Paint keeps its hue but still dims a little with the light.
      const k = 0.7 + 0.3 * Math.min(1, luma(this.palette.light));
      this.matTop.color.copy(this.paint[0]).multiplyScalar(k);
      this.matShade.color.copy(this.paint[1]).multiplyScalar(k);
    } else {
      this.matTop.color.copy(this.palette.ship);
      this.matShade.color.copy(this.palette.shipShade);
    }
    // Markings and decal contrast with the hull: dark on light paint, light on dark.
    const light = luma(this.matTop.color) > 0.42;
    if (light) this.matMarking.color.copy(this.matTop.color).multiplyScalar(0.38);
    else this.matMarking.color.copy(this.matTop.color).lerp(WHITE, 0.62);
    this.matDecal.color.copy(this.matMarking.color);
    this.matShadow.color.copy(this.palette.text);
  }

  setVisible(v: boolean): void {
    this.root.visible = v && !this.broken;
    this.shadow.visible = v;
  }

  reset(): void {
    this.lateral = 0;
    this.steer = 0;
    this.broken = false;
    this.root.rotation.set(0, 0, 0);
    this.root.position.set(0, S.hoverY, 0);
    this.fallVel = 0;
    this.falling = false;
    for (const f of this.fragments) f.mesh.visible = false;
  }

  /** Drop into a pit: the ship tips forward and falls away (instead of shattering). */
  fall(): void {
    this.falling = true;
    this.fallVel = 0;
    this.shadow.visible = false;
  }

  updateFall(dt: number): void {
    if (!this.falling) return;
    this.fallVel += 16 * dt;
    this.root.position.y -= this.fallVel * dt;
    this.root.position.z -= 3 * dt; // keeps a little forward momentum
    this.root.rotation.x -= 1.6 * dt;
    if (this.root.position.y < -CONFIG.themes.interior.pitDepth) this.root.visible = false;
  }

  /** `maxLateral` is the sideways speed at full steer (rises with forward speed). */
  /** `pitch` (radians) dips the nose, used while boosting. */
  update(dt: number, input: number, maxLateral: number, pitch = 0): void {
    const k = 1 - Math.exp(-CONFIG.steering.response * dt);
    this.steer += (input - this.steer) * k;
    this.lateral = this.steer * maxLateral;
    this.root.rotation.z = -this.steer * S.maxBankDeg * DEG;
    this.root.rotation.x = -pitch;
    this.shadow.scale.x = 1.05 * Math.cos(this.root.rotation.z);
  }

  /** Swap the ship for its fragments. */
  shatter(): void {
    this.broken = true;
    this.root.visible = false;
    this.shadow.visible = false;
    const c = CONFIG.crash;
    for (const f of this.fragments) {
      const m = f.mesh;
      const base = m.userData.base as Vector3;
      m.position.set(base.x, S.hoverY + 0.05, base.z);
      m.rotation.set(0, 0, 0);
      m.visible = true;
      const out = Math.atan2(base.x, base.z + 0.001);
      const sp = c.fragmentSpeed * (0.6 + Math.random() * 0.6);
      f.vel.set(Math.sin(out) * sp * 0.7, 2.5 + Math.random() * 2.5, -sp * (0.4 + Math.random()));
      f.spin.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 14);
    }
  }

  updateFragments(dt: number): void {
    if (!this.broken) return;
    for (const f of this.fragments) {
      const m = f.mesh;
      if (m.position.y <= 0.02 && f.vel.y <= 0 && f.vel.lengthSq() < 0.01) continue;
      f.vel.y -= 14 * dt;
      m.position.addScaledVector(f.vel, dt);
      m.rotation.x += f.spin.x * dt;
      m.rotation.y += f.spin.y * dt;
      m.rotation.z += f.spin.z * dt;
      if (m.position.y < 0.02) {
        // Settle flat on the ground with a dull bounce.
        m.position.y = 0.02;
        f.vel.y = Math.abs(f.vel.y) > 1.5 ? -f.vel.y * 0.25 : 0;
        f.vel.x *= 0.5;
        f.vel.z *= 0.5;
        f.spin.multiplyScalar(0.4);
        if (f.vel.y === 0) {
          m.rotation.x = 0;
          m.rotation.z = 0;
          f.vel.set(0, 0, 0);
          f.spin.set(0, 0, 0);
        }
      }
    }
  }

  private buildFragments(scene: Scene): void {
    const a = NOSE.clone().lerp(LEFT, 0.5);
    const b = LEFT.clone().lerp(RIGHT, 0.5);
    const c = RIGHT.clone().lerp(NOSE, 0.5);
    const g = NOSE.clone().add(LEFT).add(RIGHT).multiplyScalar(1 / 3);
    const tris = [
      [NOSE, a, g],
      [a, LEFT, g],
      [LEFT, b, g],
      [b, RIGHT, g],
      [RIGHT, c, g],
      [c, NOSE, g],
    ].slice(0, CONFIG.crash.fragments);

    tris.forEach((t, i) => {
      const centre = t[0].clone().add(t[1]).add(t[2]).multiplyScalar(1 / 3);
      const geo = new BufferGeometry();
      geo.setAttribute(
        'position',
        new Float32BufferAttribute(t.flatMap((v) => xyz(v.clone().sub(centre))), 3),
      );
      const mesh = new Mesh(geo, i % 2 === 0 ? this.matTop : this.matShade);
      mesh.userData.base = centre;
      mesh.visible = false;
      scene.add(mesh);
      this.fragments.push({ mesh, vel: new Vector3(), spin: new Vector3() });
    });
  }
}

function xyz(v: Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}
