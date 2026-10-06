import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import type { TrailId } from './looks';
import type { LivePalette } from './palette';

// Engine flames, fixed to the back of the ship so they always point straight
// out of the engine and bank with the hull. The style is one of the flame looks
// (see catalogue.ts) and says which flames to draw:
//   none    a small engine glow only          line    one flame from the tail
//   dashes  the same flame, pulsing           ion     two thin streams from the wing tips
//   triple  a flame and a short one each side  twin    two flames side by side
//   long    one long thin flame                wide    a short fat flame
//   pulse   a flame that swells and shrinks    ribbon  a long soft flame and streams
// The engine colour (looks) tints them, root to tip; boosting stretches them.
//
// The ship never turns its nose, so a trail that traced the real path ran off
// at an angle to the hull; flames fixed to the hull avoid that.

const SEGMENTS = 8;
const DEFAULT_FLAME = new Color('#e9b26a');

class Flame {
  readonly pos = new Float32Array((SEGMENTS + 1) * 2 * 3);
  readonly col = new Float32Array((SEGMENTS + 1) * 2 * 4);
  readonly geometry = new BufferGeometry();
  readonly mesh: Mesh;

  constructor(parent: Object3D, material: MeshBasicMaterial) {
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.col, 4));
    const index: number[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    parent.add(this.mesh);
  }

  /** Lay the flame out from (x, 0, 0) backwards: `len` long, `width` wide at the root. */
  draw(x: number, len: number, width: number, alpha: number, colour: Color, tip: Color, pulse: number | null): void {
    for (let k = 0; k <= SEGMENTS; k++) {
      const t = k / SEGMENTS; // 0 at the engine, 1 at the tip
      const w = width * (1 - t) * (0.85 + 0.15 * Math.cos(t * 3));
      const z = t * len;
      const o = k * 6;
      this.pos[o] = x - w;
      this.pos[o + 1] = 0.005;
      this.pos[o + 2] = z;
      this.pos[o + 3] = x + w;
      this.pos[o + 4] = 0.005;
      this.pos[o + 5] = z;
      let a = alpha * (1 - t) * (1 - t * 0.5);
      if (pulse !== null) a *= 0.35 + 0.65 * Math.max(0, Math.sin((t * 3 - pulse) * Math.PI * 2));
      const c = k * 8;
      const r = colour.r + (tip.r - colour.r) * t;
      const g = colour.g + (tip.g - colour.g) * t;
      const b = colour.b + (tip.b - colour.b) * t;
      for (const off of [0, 4]) {
        this.col[c + off] = r;
        this.col[c + off + 1] = g;
        this.col[c + off + 2] = b;
        this.col[c + off + 3] = a;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }
}

/** One flame of a style: where across (0 centre, ±1 the wing tips), how long, how wide, how bright. */
interface FlameSpec {
  at: number;
  len: number;
  width: number;
  alpha: number;
  /** A pulse travelling down it (dashes). */
  dashes?: boolean;
  /** Swells and shrinks with time (pulse). */
  swell?: boolean;
}

/** What each style draws: up to three flames (centre, left, right). */
export const TRAIL_STYLES: Record<TrailId, FlameSpec[]> = {
  none: [{ at: 0, len: 0.14, width: 0.05, alpha: 0.75 }],
  line: [{ at: 0, len: 0.42, width: 0.075, alpha: 0.8 }],
  dashes: [{ at: 0, len: 0.42, width: 0.075, alpha: 0.8, dashes: true }],
  ion: [
    { at: 0, len: 0.14, width: 0.05, alpha: 0.75 },
    { at: -0.92, len: 0.5, width: 0.018, alpha: 0.9 },
    { at: 0.92, len: 0.5, width: 0.018, alpha: 0.9 },
  ],
  triple: [
    { at: 0, len: 0.42, width: 0.06, alpha: 0.85 },
    { at: -0.3, len: 0.28, width: 0.04, alpha: 0.8 },
    { at: 0.3, len: 0.28, width: 0.04, alpha: 0.8 },
  ],
  wide: [{ at: 0, len: 0.3, width: 0.17, alpha: 0.8 }],
  long: [{ at: 0, len: 0.95, width: 0.055, alpha: 0.8 }],
  twin: [
    { at: -0.26, len: 0.42, width: 0.05, alpha: 0.85 },
    { at: 0.26, len: 0.42, width: 0.05, alpha: 0.85 },
  ],
  pulse: [{ at: 0, len: 0.5, width: 0.09, alpha: 0.9, swell: true }],
  ribbon: [
    { at: 0, len: 1.05, width: 0.13, alpha: 0.6 },
    { at: -0.5, len: 0.7, width: 0.02, alpha: 0.8 },
    { at: 0.5, len: 0.7, width: 0.02, alpha: 0.8 },
  ],
};

export class Trail {
  private style: TrailId = 'none';
  private shown = false;
  private tint: Color | null = null;
  private tint2: Color | null = null;
  private clock = 0;
  private readonly colour = new Color();
  private readonly colour2 = new Color();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  private readonly centre: Flame;
  private readonly left: Flame;
  private readonly right: Flame;

  /** `mount` is the ship's engine point (Player.engine). */
  constructor(mount: Object3D, private readonly palette: LivePalette) {
    this.centre = new Flame(mount, this.material);
    this.left = new Flame(mount, this.material);
    this.right = new Flame(mount, this.material);
    this.setVisible(false);
  }

  setStyle(style: TrailId): void {
    this.style = style;
    this.showFlames();
  }

  /** Engine colours (root and tip), or null for the default (amber, or the pickup colour for ion). */
  setTint(root: string | null, tip: string | null = root): void {
    this.tint = root ? new Color(root) : null;
    this.tint2 = tip ? new Color(tip) : this.tint;
  }

  setVisible(on: boolean): void {
    this.shown = on;
    this.showFlames();
  }

  private showFlames(): void {
    const n = TRAIL_STYLES[this.style].length;
    this.centre.mesh.visible = this.shown;
    this.left.mesh.visible = this.shown && n > 1;
    this.right.mesh.visible = this.shown && n > 2;
  }

  /** `boost` 0..1 stretches the flames; `halfSpan` is half the wing span (where side flames sit). */
  update(dt: number, boost: number, halfSpan: number): void {
    if (!this.shown) return;
    this.clock += dt;
    const flicker = 0.9 + 0.1 * Math.sin(this.clock * 47) * Math.sin(this.clock * 31);
    const stretch = (1 + boost * 0.9) * flicker;
    const spec = TRAIL_STYLES[this.style];
    this.colour.copy(this.tint ?? (this.style === 'ion' ? this.palette.pickup : DEFAULT_FLAME));
    this.colour2.copy(this.tint2 ?? this.colour);
    const flames = [this.centre, this.left, this.right];
    for (let i = 0; i < spec.length; i++) {
      const f = spec[i];
      const swell = f.swell ? 0.55 + 0.45 * Math.sin(this.clock * 7) : 1;
      // The side flames of ion and ribbon sit near the wing tips; the others a fraction of the wing across.
      const x = f.at * (this.style === 'ion' || this.style === 'ribbon' ? halfSpan : Math.max(halfSpan, 0.2));
      flames[i].draw(x, f.len * stretch * swell, f.width, f.alpha, this.colour, this.colour2, f.dashes ? this.clock * 4 : null);
    }
  }
}
