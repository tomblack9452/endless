import {
  CircleGeometry,
  Color,
  DoubleSide,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RingGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';

const DEG = Math.PI / 180;
const PLANET_BODY = new Color(CONFIG.planet.body);
const PLANET_RING = new Color(CONFIG.planet.ring);

// Vertical FOV at which the ship sits exactly at CONFIG.camera.shipY.
const SHIP_MIN_VFOV = (() => {
  const c = CONFIG.camera;
  const tanBelow = (c.height - CONFIG.ship.hoverY) / c.distanceBehind;
  return (2 * Math.atan(tanBelow / (2 * (c.shipY - c.horizonY)))) / DEG;
})();

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly fog: FogExp2;
  private readonly groundMat: MeshBasicMaterial;
  private readonly planetMat: MeshBasicMaterial;
  private readonly ringMat: MeshBasicMaterial;
  private planetVisible = 1;

  // Camera state driven by the game.
  roll = 0; // radians
  shakeX = 0;
  shakeY = 0;
  fovBoost = 0; // extra horizontal degrees
  pullBack = 0; // extra distance behind the ship (boost)
  drop = 0; // camera lowered by this much (boost)
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement, private readonly palette: LivePalette) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: CONFIG.render.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio));

    const c = CONFIG.camera;
    // The camera looks dead level; a vertical lens shift (view offset) moves the
    // horizon up the screen so the ship sits near the bottom without pitching.
    this.camera = new PerspectiveCamera(60, 1, c.near, c.far);

    this.fog = new FogExp2(palette.fog.getHex(), CONFIG.fog.density);
    this.scene.fog = this.fog;
    this.scene.background = palette.sky.clone();

    this.groundMat = new MeshBasicMaterial({ color: palette.ground });
    const ground = new Mesh(new PlaneGeometry(2000, 2000), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = -600;
    ground.renderOrder = -1;
    this.scene.add(ground);

    // A faint ringed planet low in the sky. The camera never moves, so it can
    // simply sit far away; it ignores fog and is drawn behind everything.
    const P = CONFIG.planet;
    this.planetMat = new MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false });
    this.ringMat = new MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false, side: DoubleSide });
    const planet = new Group();
    const body = new Mesh(new CircleGeometry(1, 48), this.planetMat);
    const ring = new Mesh(new RingGeometry(1.4, 1.95, 72), this.ringMat);
    ring.rotation.set(-1.2, 0, 0.32); // tilted ellipse crossing the disc
    ring.renderOrder = -1;
    body.renderOrder = -2;
    planet.add(body, ring);
    planet.position.set(P.x, P.y, P.z);
    planet.scale.setScalar(P.radius);
    this.scene.add(planet);

    this.resize();
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
  }

  applyPalette(): void {
    this.groundMat.color.copy(this.palette.ground);
    this.fog.color.copy(this.palette.fog);
    (this.scene.background as typeof this.palette.sky).copy(this.palette.sky);
    // Tinted towards the sky so it stays faint by day and stands out at night.
    const P = CONFIG.planet;
    this.planetMat.color.copy(PLANET_BODY).lerp(this.palette.sky, P.skyBlend);
    this.ringMat.color.copy(PLANET_RING).lerp(this.palette.sky, P.skyBlend);
    this.planetMat.opacity = this.planetVisible;
    this.ringMat.opacity = this.planetVisible * P.ringOpacity;
  }

  /** 0 hides the planet (inside the ship), 1 shows it. */
  setPlanetVisible(k: number): void {
    this.planetVisible = k;
  }

  resize = (): void => {
    // Play area: full screen on phones, a centred column on wider screens.
    const h = window.innerHeight;
    const w = Math.min(window.innerWidth, Math.round(h * CONFIG.render.maxAspect));
    document.documentElement.style.setProperty('--play-w', `${w}px`);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, 0, (0.5 - CONFIG.camera.horizonY) * h, w, h);
    this.camera.fov = this.verticalFov();
    this.camera.updateProjectionMatrix();
  };

  private verticalFov(): number {
    const c = CONFIG.camera;
    const halfH = ((c.hfov + this.fovBoost) * DEG) / 2;
    let v = (2 * Math.atan(Math.tan(halfH) / (this.width / this.height))) / DEG;
    v = v < c.minVfov ? c.minVfov : v > c.maxVfov ? c.maxVfov : v;
    // Never so narrow that the ship falls below shipY on screen.
    return Math.max(v, SHIP_MIN_VFOV);
  }

  render(): void {
    const c = CONFIG.camera;
    const cam = this.camera;
    cam.position.set(this.shakeX, c.height - this.drop + this.shakeY, c.distanceBehind + this.pullBack);
    cam.rotation.set(0, 0, this.roll);

    const fov = this.verticalFov();
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, cam);
  }
}

export { DEG };
