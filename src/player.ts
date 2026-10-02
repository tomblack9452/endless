import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Scene,
  Vector3,
} from 'three';
import { CONFIG } from './config';
import type { ShipId } from './cosmetics';
import type { LivePalette } from './palette';

const DEG = Math.PI / 180;
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

interface Fragment {
  mesh: Mesh;
  vel: Vector3;
  spin: Vector3;
}

export class Player {
  readonly root = new Group(); // follows bank
  private readonly body: Mesh;
  private readonly shadow: Mesh;
  private readonly matTop: MeshBasicMaterial;
  private readonly matShade: MeshBasicMaterial;
  private readonly matShadow: MeshBasicMaterial;
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
    this.root.position.y = S.hoverY;
    scene.add(this.root);

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

  /** Swap the ship's shape (cosmetic). */
  setShape(id: ShipId): void {
    const s = shipShape(id);
    this.body.geometry.dispose();
    this.body.geometry = shipGeometry(id);
    this.shadow.geometry.dispose();
    const sg = new BufferGeometry();
    sg.setAttribute('position', new Float32BufferAttribute(s.outline.flatMap(xyz), 3));
    this.shadow.geometry = sg;
  }

  applyPalette(): void {
    this.matTop.color.copy(this.palette.ship);
    this.matShade.color.copy(this.palette.shipShade);
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
