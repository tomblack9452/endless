import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments, Scene } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';

// Thin streaks rushing past either side of the ship while boosting.
// One LineSegments mesh; positions are rewritten in place each frame.

const L = CONFIG.boost.speedLines;
const SPAWN_NEAR = -8;
const SPAWN_FAR = -60;
const PASS_Z = CONFIG.camera.distanceBehind + 1; // behind the camera

export class SpeedLines {
  private readonly x = new Float32Array(L.count);
  private readonly y = new Float32Array(L.count);
  private readonly z = new Float32Array(L.count);
  private readonly len = new Float32Array(L.count); // 0.5..1.5 length factor
  private readonly positions = new Float32Array(L.count * 6);
  private readonly geometry = new BufferGeometry();
  private readonly material: LineBasicMaterial;
  private readonly mesh: LineSegments;

  constructor(scene: Scene, private readonly palette: LivePalette) {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.material = new LineBasicMaterial({
      color: palette.text,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    for (let i = 0; i < L.count; i++) this.respawn(i, SPAWN_FAR + Math.random() * (SPAWN_NEAR - SPAWN_FAR));
  }

  applyPalette(): void {
    // Text colour contrasts with the scene by design (dark by day, light at night).
    this.material.color.copy(this.palette.text);
  }

  /** `amount` 0..1 is how much boost is applied; `speed` is forward speed. */
  update(dt: number, speed: number, amount: number): void {
    if (amount < 0.01) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.material.opacity = L.opacity * amount;
    const move = speed * L.rushFactor * dt;
    const baseLen = speed * L.lengthPerSpeed * amount;
    const p = this.positions;
    for (let i = 0; i < L.count; i++) {
      this.z[i] += move;
      if (this.z[i] > PASS_Z) this.respawn(i, SPAWN_FAR + Math.random() * 15);
      const o = i * 6;
      const tail = this.z[i] - baseLen * this.len[i];
      p[o] = this.x[i];
      p[o + 1] = this.y[i];
      p[o + 2] = this.z[i];
      p[o + 3] = this.x[i];
      p[o + 4] = this.y[i];
      p[o + 5] = tail;
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }

  private respawn(i: number, z: number): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    // Bias towards the ship so most streaks pass close by.
    const t = Math.random();
    this.x[i] = side * (L.innerX + t * t * (L.outerX - L.innerX));
    this.y[i] = L.minY + Math.random() * (L.maxY - L.minY);
    this.z[i] = z;
    this.len[i] = 0.5 + Math.random();
  }
}
