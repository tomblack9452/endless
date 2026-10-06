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
import type { Fin, Marking, ShipId } from './looks';
import { CONFIG } from './config';
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
export function shipShape(id: ShipId): { light: Vector3[]; shade: Vector3[]; outline: Vector3[]; tail?: number } {
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
    case 'viper': {
      // Two long tail spikes behind low shoulders: a snake's head with a forked tail.
      const nose = v(0, 0, -l * 0.9);
      const ls = v(-w * 0.95, 0, l * 0.08);
      const rs = v(w * 0.95, 0, l * 0.08);
      const sl = v(-w * 0.55, 0, l * 0.62);
      const sr = v(w * 0.55, 0, l * 0.62);
      const notch = v(0, 0, l * 0.3);
      const ridge = v(0, h * 1.15, -l * 0.08);
      return {
        light: [nose, ls, ridge, ls, sl, ridge, sl, notch, ridge],
        shade: [nose, ridge, rs, rs, ridge, sr, sr, ridge, notch],
        outline: [nose, ls, rs],
        tail: l * 0.62,
      };
    }
    case 'phantom': {
      // A flat stealth chevron: tips at the back, almost no spine.
      const nose = v(0, 0, -l * 0.62);
      const lt = v(-w * 1.5, 0, l * 0.5);
      const rt = v(w * 1.5, 0, l * 0.5);
      const notch = v(0, 0, l * 0.12);
      const ridge = v(0, h * 0.7, l * 0.02);
      return { light: [nose, lt, ridge, lt, notch, ridge], shade: [nose, ridge, rt, rt, ridge, notch], outline: [nose, lt, rt] };
    }
    case 'kite': {
      // A kite: a rounded diamond with a split tail.
      const nose = v(0, 0, -l * 0.75);
      const ls = v(-w * 1.05, 0, -l * 0.02);
      const rs = v(w * 1.05, 0, -l * 0.02);
      const tl = v(-w * 0.32, 0, l * 0.6);
      const tr = v(w * 0.32, 0, l * 0.6);
      const notch = v(0, 0, l * 0.42);
      const ridge = v(0, h * 1.4, -l * 0.02);
      return {
        light: [nose, ls, ridge, ls, tl, ridge, tl, notch, ridge],
        shade: [nose, ridge, rs, rs, ridge, tr, tr, ridge, notch],
        outline: [nose, ls, rs],
        tail: l * 0.6,
      };
    }
    case 'comet': {
      // A teardrop: a broad round head trailing to a long point.
      const nose = v(0, 0, -l * 0.55);
      const fl = v(-w * 0.62, 0, -l * 0.38);
      const fr = v(w * 0.62, 0, -l * 0.38);
      const ls = v(-w * 1.1, 0, l * 0.04);
      const rs = v(w * 1.1, 0, l * 0.04);
      const tail = v(0, 0, l * 0.78);
      const ridge = v(0, h * 1.5, -l * 0.04);
      return {
        light: [nose, fl, ridge, fl, ls, ridge, ls, tail, ridge],
        shade: [nose, ridge, fr, fr, ridge, rs, rs, ridge, tail],
        outline: [nose, ls, rs],
        tail: l * 0.78,
      };
    }
    case 'nova': {
      // A four-pointed star: short side blades and a long tail spike.
      const nose = v(0, 0, -l * 0.7);
      const lt = v(-w * 1.45, 0, l * 0.12);
      const rt = v(w * 1.45, 0, l * 0.12);
      const tail = v(0, 0, l * 0.62);
      const ridge = v(0, h * 1.25, l * 0.02);
      return {
        light: [nose, lt, ridge, lt, tail, ridge],
        shade: [nose, ridge, rt, rt, ridge, tail],
        outline: [nose, lt, rt, lt, tail, rt],
        tail: l * 0.62,
      };
    }
    case 'halo': {
      // A crescent: wing tips swept forward round a short body, a tall fin and a split tail.
      const nose = v(0, 0, -l * 0.6);
      const lw = v(-w * 1.45, 0, -l * 0.28);
      const rw = v(w * 1.45, 0, -l * 0.28);
      const lb = v(-w * 0.85, 0, l * 0.32);
      const rb = v(w * 0.85, 0, l * 0.32);
      const notch = v(0, 0, l * 0.2);
      const ridge = v(0, h * 1.5, l * 0.05);
      return {
        light: [nose, lw, ridge, lw, lb, ridge, lb, notch, ridge],
        shade: [nose, ridge, rw, rw, ridge, rb, rb, ridge, notch],
        outline: [nose, lw, lb, notch, rb, rw],
        tail: l * 0.32,
      };
    }
    case 'raptor': {
      // Long swept wings with the tips turned forward, and a split tail.
      const nose = v(0, 0, -l * 0.78);
      const lw = v(-w * 1.5, 0, l * 0.18);
      const rw = v(w * 1.5, 0, l * 0.18);
      const lt = v(-w * 0.55, 0, l * 0.55);
      const rt = v(w * 0.55, 0, l * 0.55);
      const notch = v(0, 0, l * 0.28);
      const ridge = v(0, h * 1.35, -l * 0.05);
      return {
        light: [nose, lw, ridge, lw, lt, ridge, lt, notch, ridge],
        shade: [nose, ridge, rw, rw, ridge, rt, rt, ridge, notch],
        outline: [nose, lw, rw, lw, lt, notch, rw, notch, rt],
        tail: l * 0.55,
      };
    }
    default: {
      // Dart: the original low pyramid.
      return { light: [NOSE, LEFT, RIDGE], shade: [NOSE, RIDGE, RIGHT, LEFT, RIGHT, RIDGE], outline: [NOSE, LEFT, RIGHT] };
    }
  }
}

export function shipGeometry(id: ShipId): BufferGeometry {
  const s = shipShape(id);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([...s.light, ...s.shade].flatMap(xyz), 3));
  g.addGroup(0, s.light.length, 0);
  g.addGroup(s.light.length, s.shade.length, 1);
  return g;
}

// --- dressing: markings, fins and the wing decals ------------------------------

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

interface Frame {
  nose: Vector3;
  left: Vector3;
}

/** Hull space to ship x, z: `a` runs tail (0) to nose (1), `b` across (-1 left edge, 1 right edge). */
function hullPoint(f: Frame, a: number, b: number): [number, number] {
  const tailZ = f.left.z;
  const halfW = Math.abs(f.left.x);
  return [b * halfW * (1 - a), tailZ + (f.nose.z - tailZ) * a];
}

/** Marking ids for the hull shader (0 = none). */
export const MARKING_ID: Record<Marking, number> = { none: 0, stripe: 1, twin: 2, split: 3, twotone: 4, chevron: 5, nose: 6, tips: 7, spine: 8, hazard: 9, checker: 10, dots: 11, rings: 12 };

/**
 * Markings are painted by the hull's own shader, worked out per pixel from
 * the point's place on the hull (the same tail-to-nose / edge-to-edge space as
 * hullPoint), so they follow every hull shape exactly with clean edges.
 */
function addMarkings(mat: MeshBasicMaterial, uniforms: Record<string, { value: unknown }>): void {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vShip;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShip = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vShip;
uniform float uMark;
uniform vec3 uMarkColor;
uniform vec3 uFrame; // nose z, tail z, half width`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
if (uMark > 0.5) {
  float a = clamp((uFrame.y - vShip.z) / (uFrame.y - uFrame.x), 0.0, 1.0);
  float b = vShip.x / max(uFrame.z * (1.0 - a), 0.02);
  float ab = abs(b);
  float m = 0.0;
  if (uMark < 1.5) m = step(ab, 0.16) * step(0.04, a) * step(a, 0.92);
  else if (uMark < 2.5) m = step(0.32, ab) * step(ab, 0.56) * step(0.04, a) * step(a, 0.85);
  else if (uMark < 3.5) m = step(b, 0.0);
  else if (uMark < 4.5) m = step(a, 0.36);
  else if (uMark < 5.5) {
    float lo = 0.5 - 0.22 * ab / 0.85;
    m = step(ab, 0.85) * step(lo, a) * step(a, lo + 0.14);
  }
  else if (uMark < 6.5) m = step(0.8, a); // nose cap
  else if (uMark < 7.5) m = step(0.7, ab) * step(a, 0.6); // wing tips
  else if (uMark < 8.5) m = step(ab, 0.06) * step(0.03, a) * step(a, 0.97); // a thin spine
  else if (uMark < 9.5) m = step(a, 0.5) * step(fract(a * 7.0 + ab * 3.5), 0.5); // hazard stripes at the back
  else if (uMark < 10.5) m = mod(floor(b * 3.0 + 3.0) + floor(a * 7.0), 2.0) * step(0.06, a) * step(a, 0.62) * step(ab, 0.98); // checks
  else if (uMark < 11.5) {
    vec2 g = fract(vec2(vShip.x, vShip.z) / 0.15 + 0.5) - 0.5; // round dots on a grid, in the ship's own units
    m = step(length(g), 0.27) * step(0.08, a) * step(a, 0.94) * step(ab, 0.9); // dots
  }
  else m = step(0.55, fract(a * 3.2)) * step(0.06, a) * step(a, 0.94); // bands
  diffuseColor.rgb = mix(diffuseColor.rgb, uMarkColor, m);
}`,
      );
  };
}

function finGeometry(geometry: BufferGeometry, f: Frame, fin: Exclude<Fin, 'none'>): BufferGeometry {
  const pos: number[] = [];
  const tri = (a: Vector3, b: Vector3, c: Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const len = f.left.z - f.nose.z;
  const halfW = Math.abs(f.left.x);
  const on = (x: number, z: number) => new Vector3(x, (surface(geometry, x, z)?.y ?? 0) - 0.002, z);
  /** A wedge fin: a blade with a back face, so the chase camera sees it. `reach` is how far forward it starts (of the hull's length). */
  const wedge = (x: number, lean: number, height: number, reach = 0.42) => {
    const front = on(x, f.left.z - len * reach);
    const back = on(x, f.left.z - len * 0.08);
    const bl = back.clone().add(new Vector3(-0.035, 0, 0));
    const br = back.clone().add(new Vector3(0.035, 0, 0));
    const top = back.clone().add(new Vector3(lean, height, len * 0.03));
    tri(front, bl, top);
    tri(front, top, br);
    tri(bl, br, top);
  };
  if (fin === 'tail') wedge(0, 0, 0.26);
  else if (fin === 'blade') wedge(0, 0, 0.15, 0.72); // long and low
  else if (fin === 'crest') {
    wedge(0, 0, 0.34, 0.5);
    wedge(-halfW * 0.4, -0.08, 0.12, 0.3);
    wedge(halfW * 0.4, 0.08, 0.12, 0.3);
  } else if (fin === 'swept') {
    // Two long fins raked back and out.
    wedge(-halfW * 0.5, -0.14, 0.2, 0.62);
    wedge(halfW * 0.5, 0.14, 0.2, 0.62);
  } else if (fin === 'twin') {
    // Canted outwards so their faces catch the light from above.
    wedge(-halfW * 0.42, -0.1, 0.19);
    wedge(halfW * 0.42, 0.1, 0.19);
  } else {
    for (const side of [-1, 1]) {
      const tip = new Vector3(halfW * side, 0, f.left.z);
      const along = tip.clone().lerp(new Vector3(0, 0, f.nose.z), 0.28);
      const base0 = on(tip.x * 0.97, tip.z - 0.01);
      const base1 = on(along.x, along.z);
      const top = base0.clone().add(new Vector3(side * 0.05, 0.14, 0));
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
  private readonly markColor = new Color();
  // Fins get their own material: the hull's shade, darker, and never marked.
  private readonly matFin = new MeshBasicMaterial({ side: DoubleSide });
  private readonly markUniforms = {
    uMark: { value: 0 },
    uMarkColor: { value: this.markColor },
    uFrame: { value: new Vector3() },
  };
  /** Engine flames mount here (see trail.ts): straight back from the tail, banking with the hull. */
  readonly engine = new Group();
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

    addMarkings(this.matTop, this.markUniforms);
    addMarkings(this.matShade, this.markUniforms);
    this.body = new Mesh(shipGeometry('dart'), [this.matTop, this.matShade]);
    this.root.add(this.body);
    this.body.add(this.decor, this.engine);
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
    this.markUniforms.uMark.value = MARKING_ID[this.marking];
    this.markUniforms.uFrame.value.set(frame.nose.z, frame.left.z, Math.abs(frame.left.x));
    // The engine sits at the tail line, centred (wing tips: see engineSpan()).
    this.engine.position.set(0, 0, s.tail ?? frame.left.z);
    this.engineHalfSpan = Math.abs(frame.left.x);
    if (this.fin !== 'none') this.decor.add(new Mesh(finGeometry(geometry, frame, this.fin), this.matFin));
    if (this.decalSvg) {
      svgTexture(this.decalSvg, this.decalTexture);
      // One on each wing, as big as the wing allows.
      const size = Math.min(0.17, Math.abs(frame.left.x) * 0.6);
      for (const side of [-1, 1]) {
        const [x, z] = hullPoint(frame, 0.44, side * 0.46); // forward of the two-tone band
        const hit = surface(geometry, x, z);
        if (!hit) continue;
        const decal = new Mesh(new PlaneGeometry(size, size), this.matDecal);
        decal.position.set(x, hit.y + SURFACE_LIFT, z);
        decal.quaternion.setFromUnitVectors(UP_Z, hit.normal);
        decal.rotateZ(Math.PI); // upright as seen from behind
        this.decor.add(decal);
      }
    }
  }

  /** Half the distance between the wing tips (engine flames sit at the tips for ion). */
  engineHalfSpan: number = S.halfWidth;

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
    if (light) this.markColor.copy(this.matTop.color).multiplyScalar(0.38);
    else this.markColor.copy(this.matTop.color).lerp(WHITE, 0.62);
    this.matDecal.color.copy(this.markColor);
    this.matFin.color.copy(this.matShade.color).multiplyScalar(0.6);
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
  /** `grip` < 1 makes steering slow to take hold (sliding on ice). */
  update(dt: number, input: number, maxLateral: number, pitch = 0, grip = 1): void {
    const k = 1 - Math.exp(-CONFIG.steering.response * grip * dt);
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
