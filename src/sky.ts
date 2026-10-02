import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Scene,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { CONFIG } from './config';

// Deep space: stars, a spiral galaxy and shooting stars. Shown over the
// observation deck and faintly outside at night. The camera never moves, so
// all of it can simply sit far away in front of it.

const S = CONFIG.space;
const DOME = 330;

/** Point on the sky dome: azimuth (0 = straight ahead) and elevation, degrees. */
function dome(az: number, el: number, out: Vector3): Vector3 {
  const a = (az * Math.PI) / 180;
  const e = (el * Math.PI) / 180;
  return out.set(Math.sin(a) * Math.cos(e) * DOME, Math.sin(e) * DOME, -Math.cos(a) * Math.cos(e) * DOME);
}

function galaxyTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rgb},${a})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // Two logarithmic spiral arms of soft dust and bright knots.
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 900; i++) {
      const t = Math.random() * 3.4;
      const r = 8 * Math.exp(0.62 * t) + (Math.random() - 0.5) * 14 * (1 + t * 0.4);
      const ang = t * 1.9 + arm * Math.PI + (Math.random() - 0.5) * 0.35;
      const x = c + Math.cos(ang) * r;
      const y = c + Math.sin(ang) * r;
      const bluish = Math.random() < 0.7;
      blob(x, y, 3 + Math.random() * 9, bluish ? '176,194,232' : '205,184,226', 0.05 + Math.random() * 0.06);
      if (Math.random() < 0.08) blob(x, y, 1.5, '235,240,255', 0.7);
    }
  }
  // Warm core.
  blob(c, c, 70, '245,226,190', 0.35);
  blob(c, c, 26, '255,244,220', 0.8);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface Shooter {
  line: LineSegments;
  mat: LineBasicMaterial;
  pos: Float32Array;
  head: Vector3;
  dir: Vector3;
  t: number; // 0..1, or < 0 when idle
  speed: number;
}

export class Sky {
  private readonly group = new Group();
  private readonly starMat: PointsMaterial;
  private readonly galaxyMat: MeshBasicMaterial;
  private readonly shooters: Shooter[] = [];
  private amount = 0;
  private nextShooter = 2;

  constructor(scene: Scene) {
    const v = new Vector3();
    // Stars, denser towards the top, a few brighter ones.
    const pos = new Float32Array(S.stars * 3);
    for (let i = 0; i < S.stars; i++) {
      dome((Math.random() * 2 - 1) * 55, 2 + Math.pow(Math.random(), 0.7) * 70, v);
      pos.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    this.starMat = new PointsMaterial({
      color: 0xe8ecf5,
      size: 1.6,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const stars = new Points(geo, this.starMat);
    stars.renderOrder = -3;
    this.group.add(stars);

    // Galaxy, facing the camera with a tilt.
    const G = S.galaxy;
    this.galaxyMat = new MeshBasicMaterial({
      map: galaxyTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      blending: AdditiveBlending,
    });
    const galaxy = new Mesh(new PlaneGeometry(G.size, G.size), this.galaxyMat);
    galaxy.position.set(G.x, G.y, G.z);
    galaxy.lookAt(0, 0, 0);
    galaxy.rotateZ(G.tilt);
    galaxy.renderOrder = -3;
    this.group.add(galaxy);

    // Two shooting stars, reused.
    for (let i = 0; i < 2; i++) {
      const p = new Float32Array(6);
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(p, 3));
      const mat = new LineBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0, depthWrite: false, fog: false });
      const line = new LineSegments(g, mat);
      line.frustumCulled = false;
      line.renderOrder = -3;
      this.group.add(line);
      this.shooters.push({ line, mat, pos: p, head: new Vector3(), dir: new Vector3(), t: -1, speed: 1 });
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** 0 hides everything; 1 is the full view from the observation deck. */
  setAmount(k: number): void {
    this.amount = k;
    this.group.visible = k > 0.01;
    this.starMat.opacity = k;
    this.galaxyMat.opacity = Math.min(1, k * 1.1);
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    if (this.amount > 0.3) {
      this.nextShooter -= dt;
      if (this.nextShooter <= 0) {
        this.nextShooter = S.shootingEvery[0] + Math.random() * (S.shootingEvery[1] - S.shootingEvery[0]);
        const s = this.shooters.find((x) => x.t < 0);
        if (s) {
          dome((Math.random() * 2 - 1) * 40, 25 + Math.random() * 40, s.head);
          const side = Math.random() < 0.5 ? -1 : 1;
          s.dir.set(side * (0.6 + Math.random() * 0.4), -0.35 - Math.random() * 0.3, 0).normalize();
          s.t = 0;
          s.speed = 1 / (0.6 + Math.random() * 0.5);
        }
      }
    }
    for (const s of this.shooters) {
      if (s.t < 0) continue;
      s.t += dt * s.speed;
      if (s.t >= 1) {
        s.t = -1;
        s.mat.opacity = 0;
        continue;
      }
      const travel = s.t * 90;
      const tail = Math.min(1, s.t * 3) * 26;
      const hx = s.head.x + s.dir.x * travel;
      const hy = s.head.y + s.dir.y * travel;
      s.pos[0] = hx;
      s.pos[1] = hy;
      s.pos[2] = s.head.z;
      s.pos[3] = hx - s.dir.x * tail;
      s.pos[4] = hy - s.dir.y * tail;
      s.pos[5] = s.head.z;
      (s.line.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      s.mat.opacity = this.amount * (1 - s.t) * Math.min(1, s.t * 6);
    }
  }
}
