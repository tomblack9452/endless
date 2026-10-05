import { BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, type Object3D } from 'three';
import type { TrailId } from './cosmetics';
import type { LivePalette } from './palette';

// Engine flames, fixed to the back of the ship so they always point straight
// out of the engine and bank with the hull. Styles (from missions):
//   none   - a small engine glow only
//   line   - one flame from the tail
//   dashes - the same flame, pulsing
//   ion    - two thin streams from the wing tips, plus the glow
// The engine colour (looks) tints them; boosting stretches them.
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
  draw(x: number, len: number, width: number, alpha: number, colour: Color, pulse: number | null): void {
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
      for (const off of [0, 4]) {
        this.col[c + off] = colour.r;
        this.col[c + off + 1] = colour.g;
        this.col[c + off + 2] = colour.b;
        this.col[c + off + 3] = a;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  }
}

export class Trail {
  private style: TrailId = 'none';
  private shown = false;
  private tint: Color | null = null;
  private clock = 0;
  private readonly colour = new Color();
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

  /** Engine colour, or null for the default (amber, or the pickup colour for ion). */
  setTint(css: string | null): void {
    this.tint = css ? new Color(css) : null;
  }

  setVisible(on: boolean): void {
    this.shown = on;
    this.showFlames();
  }

  private showFlames(): void {
    this.centre.mesh.visible = this.shown;
    this.left.mesh.visible = this.right.mesh.visible = this.shown && this.style === 'ion';
  }

  /** `boost` 0..1 stretches the flames; `halfSpan` is half the wing span (ion streams). */
  update(dt: number, boost: number, halfSpan: number): void {
    if (!this.shown) return;
    this.clock += dt;
    const flicker = 0.9 + 0.1 * Math.sin(this.clock * 47) * Math.sin(this.clock * 31);
    const stretch = (1 + boost * 0.9) * flicker;
    const ion = this.style === 'ion';
    this.colour.copy(this.tint ?? (ion ? this.palette.pickup : DEFAULT_FLAME));
    if (this.style === 'none' || ion) this.centre.draw(0, 0.14 * stretch, 0.05, 0.75, this.colour, null);
    else this.centre.draw(0, 0.42 * stretch, 0.075, 0.8, this.colour, this.style === 'dashes' ? this.clock * 4 : null);
    if (ion) {
      this.left.draw(-halfSpan * 0.92, 0.5 * stretch, 0.018, 0.9, this.colour, null);
      this.right.draw(halfSpan * 0.92, 0.5 * stretch, 0.018, 0.9, this.colour, null);
    }
  }
}
