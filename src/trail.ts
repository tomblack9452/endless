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

// A short exhaust ribbon behind the ship tracing where it has actually been. Points are kept
// ship-relative (like the world): each frame they slide back by the forward
// distance and sideways against the ship's movement. Styles:
//   line   - one flame from the tail, fading out
//   dashes - the same flame, pulsing
//   ion    - two thin streams from the wing tips in the pickup colour

const COUNT = 10; // samples per ribbon
// The camera sits ~2.5 behind and above the ship, so anything longer than about a unit
// runs off the bottom of the screen as a straight bar. Trails are short engine flames.
const SPACING = 0.035; // ~0.35 long
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
  private head = 0; // index of the newest fixed sample (the live point is the next slot)
  private sinceSample = 0;
  private travelled = 0; // for dash phase
  private readonly colour = new Color();
  private tint: Color | null = null; // engine colour (looks), or null for the default

  /** Engine colour for the trail, or null for the default (text colour, or pickup colour for ion). */
  setTint(css: string | null): void {
    this.tint = css ? new Color(css) : null;
  }

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
    // Fixed samples are laid exactly SPACING apart along the ground. At speed
    // the ship covers several per frame, so the new ones are filled in along
    // the line from last frame's emitter position to this one's. The slot
    // after the newest fixed sample is a live point that sits on the emitter.
    this.sinceSample += dz;
    const total = Math.floor(this.sinceSample / SPACING);
    this.sinceSample -= total * SPACING; // travel since the newest fixed sample
    const added = Math.min(COUNT - 2, total); // only the most recent ones fit
    const ion = this.style === 'ion';
    this.colour.copy(this.tint ?? (ion ? this.palette.pickup : this.palette.text));
    const width = ion ? 0.016 : 0.07;
    const alpha = ion ? 0.9 : 0.6;
    const cos = Math.cos(bank);
    const emitZ = S.length * 0.4;
    const y0 = S.hoverY + 0.02; // at engine height, not on the ground
    let head = this.head;
    for (let r = 0; r < this.ribbons.length; r++) {
      const rb = this.ribbons[r];
      if (!rb.mesh.visible) continue;
      for (let i = 0; i < COUNT; i++) {
        rb.x[i] -= dx;
        rb.z[i] += dz;
      }
      const live = (this.head + 1) % COUNT;
      const fromX = rb.x[live]; // last frame's emitter point, now dz further back
      const toX = this.offsets[r] * cos;
      head = this.head;
      for (let j = 1; j <= added; j++) {
        const back = this.sinceSample + (added - j) * SPACING; // how far behind the emitter, oldest first
        const f = dz > 0 ? Math.min(1, back / dz) : 0;
        head = (head + 1) % COUNT;
        rb.x[head] = toX + (fromX - toX) * f;
        rb.z[head] = emitZ + back;
      }
      const now = (head + 1) % COUNT;
      rb.x[now] = toX;
      rb.z[now] = emitZ;
      // Wing tips rise and fall with the bank.
      const y = y0 + (ion ? this.offsets[r] * -Math.sin(bank) : 0);
      for (let k = 0; k < COUNT; k++) {
        const i = (now - k + COUNT) % COUNT;
        const t = k / (COUNT - 1); // 0 at the ship, 1 at the end
        let a = alpha * (1 - t) * (1 - t);
        // Samples left from earlier frames can lie further back than the flame is long: fold them in.
        const maxZ = emitZ + (COUNT - 1) * SPACING;
        if (rb.z[i] > maxZ) {
          rb.z[i] = maxZ;
          a = 0;
        }
        if (this.style === 'dashes') {
          // Dashes fixed to the ground: pulses along the flame.
          const along = this.travelled - (rb.z[i] - emitZ);
          if (((along % 0.12) + 0.12) % 0.12 > 0.06) a = 0;
        }
        const w = width * (1 - t); // tapers to a point
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
    this.head = head;
  }
}