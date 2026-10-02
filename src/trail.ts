import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three';
import { CONFIG } from './config';
import type { TrailId } from './cosmetics';
import type { LivePalette } from './palette';

// A ribbon behind the ship tracing where it has actually been. Points are kept
// ship-relative (like the world): each frame they slide back by the forward
// distance and sideways against the ship's movement. Styles:
//   line   - one solid ribbon from the tail, fading out
//   dashes - the same ribbon broken into dashes fixed to the ground
//   ion    - two thin ribbons from the wing tips in the pickup colour

const COUNT = 24; // samples per ribbon
const SPACING = 0.13; // world units between samples (the camera is only ~2.5 behind)
const S = CONFIG.ship;

class Ribbon {
  readonly x = new Float32Array(COUNT);
  readonly z = new Float32Array(COUNT);
  readonly pos = new Float32Array(COUNT * 2 * 3);
  readonly col = new Float32Array(COUNT * 2 * 4);
  readonly geometry = new BufferGeometry();
  readonly mesh: Mesh;

  constructor(scene: Scene, material: MeshBasicMaterial) {
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('color', new BufferAttribute(this.col, 4));
    const index: number[] = [];
    for (let i = 0; i < COUNT - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(index);
    this.mesh = new Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
  }
}

export class Trail {
  private style: TrailId = 'none';
  private shown = false; // only during a run
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  private readonly ribbons: Ribbon[];
  private readonly offsets = [0, -S.halfWidth * 0.9, S.halfWidth * 0.9]; // tail, left tip, right tip
  private head = 0; // index of the newest sample
  private sinceSample = 0;
  private travelled = 0; // for dash phase
  private readonly colour = new Color();

  constructor(scene: Scene, private readonly palette: LivePalette) {
    this.ribbons = this.offsets.map(() => new Ribbon(scene, this.material));
    this.setStyle('none');
  }

  setStyle(style: TrailId): void {
    this.style = style;
    this.showRibbons();
    this.reset();
  }

  /** Collapse the trail onto the ship (new run). */
  reset(): void {
    for (let r = 0; r < this.ribbons.length; r++) {
      const rb = this.ribbons[r];
      rb.x.fill(this.offsets[r]);
      for (let i = 0; i < COUNT; i++) rb.z[i] = S.length * 0.4;
      rb.col.fill(0); // nothing drawn until the next update
      (rb.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
    this.sinceSample = 0;
  }

  setVisible(on: boolean): void {
    this.shown = on;
    this.showRibbons();
  }

  private showRibbons(): void {
    const s = this.style;
    this.ribbons[0].mesh.visible = this.shown && (s === 'line' || s === 'dashes');
    this.ribbons[1].mesh.visible = this.ribbons[2].mesh.visible = this.shown && s === 'ion';
  }

  /** `dx` is how far the ship moved sideways this frame, `dz` how far forward. */
  update(dx: number, dz: number, bank: number): void {
    if (this.style === 'none') return;
    this.travelled += dz;
    this.sinceSample += dz;
    const newSample = this.sinceSample >= SPACING;
    if (newSample) {
      this.sinceSample = 0;
      this.head = (this.head + 1) % COUNT;
    }
    const ion = this.style === 'ion';
    this.colour.copy(ion ? this.palette.pickup : this.palette.text);
    const width = ion ? 0.022 : 0.045;
    const alpha = ion ? 0.95 : 0.55;
    const cos = Math.cos(bank);
    for (let r = 0; r < this.ribbons.length; r++) {
      const rb = this.ribbons[r];
      if (!rb.mesh.visible) continue;
      for (let i = 0; i < COUNT; i++) {
        rb.x[i] -= dx;
        rb.z[i] += dz;
      }
      // The newest sample sits on the emitter (tail or wing tip, which tilts with the bank).
      const emitZ = S.length * 0.4;
      rb.x[this.head] = this.offsets[r] * cos;
      rb.z[this.head] = emitZ;
      const y = S.hoverY + (ion ? this.offsets[r] * -Math.sin(bank) : 0) - 0.02;
      for (let k = 0; k < COUNT; k++) {
        const i = (this.head - k + COUNT) % COUNT;
        const t = k / (COUNT - 1); // 0 at the ship, 1 at the end
        let a = alpha * (1 - t) * (1 - t);
        if (this.style === 'dashes') {
          // Dashes fixed to the ground: on for about half of each 0.5-unit stretch.
          const along = this.travelled - (rb.z[i] - emitZ);
          if (((along % 0.5) + 0.5) % 0.5 > 0.28) a = 0;
        }
        const w = width * (1 - t * 0.6);
        const o = k * 6;
        rb.pos[o] = rb.x[i] - w;
        rb.pos[o + 1] = y;
        rb.pos[o + 2] = rb.z[i];
        rb.pos[o + 3] = rb.x[i] + w;
        rb.pos[o + 4] = y;
        rb.pos[o + 5] = rb.z[i];
        const c = k * 8;
        for (const off of [0, 4]) {
          rb.col[c + off] = this.colour.r;
          rb.col[c + off + 1] = this.colour.g;
          rb.col[c + off + 2] = this.colour.b;
          rb.col[c + off + 3] = a;
        }
      }
      (rb.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (rb.geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
    }
  }
}
