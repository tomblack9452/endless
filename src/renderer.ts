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
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';
import { MAX_BUMPS, MAX_PITS, MAX_STEPS, terrain, TERRAIN_GLSL } from './terrain';

const DEG = Math.PI / 180;
// Ground grid: rows along the run and columns across the middle (see groundGeometry).
const GROUND_ROW = 2.5;
const GROUND_COL = 1.5;
const GROUND_Z = -600;
const PLANET_BODY = new Color(CONFIG.planet.body);
const BLACK = new Color(0x050608);
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
  // Adaptive resolution state.
  private maxRatio = 1;
  private ratio = 1;
  private frameAvg = 16.7;
  private slowFor = 0;
  private fastFor = 0;
  private readonly ground: Mesh;
  private underfloor = 0; // inside the ship: ground drops away and turns black
  private readonly hillDistance = { value: 0 };
  private readonly hillWindow = { value: new Vector4() };
  private readonly hillPhase = { value: new Vector2() };
  private readonly hillBumps = { value: Array.from({ length: MAX_BUMPS }, () => new Vector3()) };
  private readonly hillSteps = { value: Array.from({ length: MAX_STEPS }, () => new Vector3()) };
  private readonly liftD = { value: new Vector4() };
  private readonly liftX = { value: new Vector4() };
  private readonly pits = { value: Array.from({ length: MAX_PITS }, () => new Vector2()) };
  private readonly shipX = { value: 0 };
  private readonly groundAt = { value: new Vector2() }; // world x and distance under the camera, wrapped
  private readonly groundStyle = { value: new Vector2() };

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
    this.maxRatio = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);

    const c = CONFIG.camera;
    // The camera looks dead level; a vertical lens shift (view offset) moves the
    // horizon up the screen so the ship sits near the bottom without pitching.
    this.camera = new PerspectiveCamera(60, 1, c.near, c.far);

    this.fog = new FogExp2(palette.fog.getHex(), CONFIG.fog.density);
    this.scene.fog = this.fog;
    this.scene.background = palette.sky.clone();

    this.groundMat = new MeshBasicMaterial({ color: palette.ground });
    // Subdivided along the run so it can follow the hills (see terrain.ts).
    this.groundMat.onBeforeCompile = (shader) => {
      shader.uniforms.uDistance = this.hillDistance;
      shader.uniforms.uHill = this.hillWindow;
      shader.uniforms.uPhase = this.hillPhase;
      shader.uniforms.uBumps = this.hillBumps;
      shader.uniforms.uSteps = this.hillSteps;
      shader.uniforms.uLiftD = this.liftD;
      shader.uniforms.uLiftX = this.liftX;
      shader.uniforms.uPits = this.pits;
      shader.uniforms.uShipX = this.shipX;
      shader.uniforms.uGroundAt = this.groundAt;
      shader.uniforms.uGroundStyle = this.groundStyle;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${TERRAIN_GLSL}\nvarying float vHillShade;\nvarying float vPit;\nvarying vec2 vGround;\nuniform vec2 uGroundAt;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 groundWorld = modelMatrix * vec4(transformed, 1.0);
          // Ground-fixed coordinates (they move with the world, not the camera).
          vGround = vec2(groundWorld.x + uGroundAt.x, uGroundAt.y - groundWorld.z);
          float hillD = uDistance - groundWorld.z;
          float hillX = uShipX + groundWorld.x;
          // Chasms drop away under the ground's own height (the ship never follows them down).
          vPit = pitAt(hillD);
          transformed.z += hillAt(hillD) + liftAt(hillD, hillX) - hillAt(uDistance) - liftAt(uDistance, uShipX)
            - vPit * ${CONFIG.terrain.pitDepth.toFixed(1)};
          // Slopes facing the camera catch the light; the far sides fall into shade.
          vHillShade = clamp((hillAt(hillD + 1.0) - hillAt(hillD - 1.0)) * 0.5, -1.0, 1.0);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying float vHillShade;
varying float vPit;
varying vec2 vGround;
uniform vec2 uGroundStyle; // grass and dirt patches, fine speckle
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 + vHillShade * ${CONFIG.terrain.shade.toFixed(2)};
        if (uGroundStyle.x > 0.0 || uGroundStyle.y > 0.0) {
          // Broad patches: greener grass and warmer bare dirt, tinting whatever the ground colour is.
          float patchN = gNoise(vGround * 0.045) * 0.65 + gNoise(vGround * 0.13 + 7.0) * 0.35;
          float grass = smoothstep(0.56, 0.7, patchN) * uGroundStyle.x;
          float dirt = smoothstep(0.42, 0.3, patchN) * uGroundStyle.x;
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.9, 1.0, 0.86), grass);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.02, 0.97, 0.92), dirt);
          // Fine grain so the ground doesn't read as flat paint.
          float grain = gNoise(vGround * 1.6) * 0.6 + gNoise(vGround * 4.1) * 0.4;
          diffuseColor.rgb *= 1.0 + (grain - 0.5) * 0.09 * uGroundStyle.y;
        }
        // Chasm walls darken as soon as they drop below the rim (each wall is one steep strip of ground).
        diffuseColor.rgb *= 1.0 - 0.9 * smoothstep(0.0, 0.06, vPit);`)
        // ...and stay dark through the fog, so a chasm reads as a drop, not pale mist.
        .replace('#include <fog_fragment>', `#include <fog_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.045, 0.04, 0.035), smoothstep(0.01, 0.12, vPit) * 0.92);`);
    };
    const ground = new Mesh(groundGeometry(), this.groundMat);
    this.ground = ground;
    ground.rotation.x = -Math.PI / 2;
    ground.position.z = GROUND_Z;
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

  /** Heights for the current distance and ship x (call every frame before rendering). */
  setTerrain(distance: number, shipX = 0): void {
    this.hillDistance.value = distance;
    this.shipX.value = shipX;
    // Keep the ground's points fixed in the world as it slides past (snapped to its
    // grid), so chasm rims, ramps and split edges don't shimmer from frame to frame.
    this.ground.position.z = GROUND_Z + (distance - Math.floor(distance / GROUND_ROW) * GROUND_ROW);
    this.ground.position.x = -(shipX - Math.floor(shipX / GROUND_COL) * GROUND_COL);
    for (let i = 0; i < MAX_STEPS; i++) this.hillSteps.value[i].fromArray(terrain.steps, i * 3);
    this.liftD.value.fromArray(terrain.lift, 0);
    this.liftX.value.fromArray(terrain.lift, 4);
    for (let i = 0; i < MAX_PITS; i++) this.pits.value[i].fromArray(terrain.pits, i * 2);
    this.hillWindow.value.set(terrain.start, terrain.end, terrain.amp, 0);
    this.hillPhase.value.set(terrain.p, terrain.q);
    for (let i = 0; i < MAX_BUMPS; i++) this.hillBumps.value[i].fromArray(terrain.bumps, i * 3);
  }

  /**
   * Ground styling: `grass` 0..1 for grass and dirt patches, `grain` 0..1 for
   * speckle. `shipX` and `distance` place the pattern so it moves with the
   * world (wrapped, so floats stay precise on long runs).
   */
  setGroundStyle(grass: number, grain: number, shipX: number, distance: number): void {
    this.groundStyle.value.set(grass, grain);
    this.groundAt.value.set(shipX % 4096, distance % 4096);
  }

  applyPalette(): void {
    this.groundMat.color.copy(this.palette.ground).lerp(BLACK, this.underfloor);
    this.fog.color.copy(this.palette.fog);
    (this.scene.background as typeof this.palette.sky).copy(this.palette.sky);
    // Tinted towards the sky so it stays faint by day and stands out at night.
    const P = CONFIG.planet;
    this.planetMat.color.copy(PLANET_BODY).lerp(this.palette.sky, P.skyBlend);
    this.ringMat.color.copy(PLANET_RING).lerp(this.palette.sky, P.skyBlend);
    this.planetMat.opacity = this.planetVisible;
    this.ringMat.opacity = this.planetVisible * P.ringOpacity;
  }

  /** Current render scale (device pixels per CSS pixel). */
  get pixelRatio(): number {
    return this.ratio;
  }

  /**
   * Feed the real frame time; lowers the render scale when frames run slow
   * and raises it again when there's headroom. Ignores stalls (tab switches).
   */
  adapt(frameMs: number): void {
    const R = CONFIG.render;
    if (!R.adaptive || frameMs > 100) return;
    this.frameAvg += (frameMs - this.frameAvg) * 0.05;
    this.slowFor = this.frameAvg > R.slowFrameMs ? this.slowFor + frameMs : 0;
    this.fastFor = this.frameAvg < R.fastFrameMs ? this.fastFor + frameMs : 0;
    let next = this.ratio;
    if (this.slowFor > R.slowForMs) next = Math.max(R.minPixelRatio, this.ratio - R.pixelRatioStep);
    else if (this.fastFor > R.fastForMs) next = Math.min(this.maxRatio, this.ratio + R.pixelRatioStep);
    if (next !== this.ratio) {
      this.ratio = next;
      this.renderer.setPixelRatio(next);
      this.resize();
      this.slowFor = this.fastFor = 0;
      this.frameAvg = 16.7;
    }
  }

  /**
   * Inside the ship (k = 1) the ground plane sinks below the pits and goes
   * black, so holes in the floor look bottomless.
   */
  setUnderfloor(k: number): void {
    this.underfloor = k;
    this.ground.position.y = -CONFIG.themes.interior.pitDepth * 1.5 * k;
    // Unfogged inside, so looking down a hole stays black however far it runs.
    const fog = k < 0.5;
    if (this.groundMat.fog !== fog) {
      this.groundMat.fog = fog;
      this.groundMat.needsUpdate = true;
    }
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

  /**
   * Compile every material up front (in the background), so the first trip into
   * the canyon or the ship doesn't stutter while its shaders build.
   */
  warmUp(): void {
    void this.renderer.compileAsync(this.scene, this.camera).catch(() => {
      // Older browsers: shaders just compile on first use.
    });
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

/**
 * The ground: 2000 x 2000, finely divided along the run (hills, chasm edges)
 * and across it near the middle only (the two sides of a split rise and fall
 * separately), with a few wide columns out to the edges.
 */
function groundGeometry(): PlaneGeometry {
  const xs: number[] = [];
  for (let x = -36; x <= 36; x += GROUND_COL) xs.push(x);
  const outer = [48, 80, 150, 300, 600, 1000];
  const cols = [...outer.map((x) => -x).reverse(), ...xs, ...outer];
  const g = new PlaneGeometry(1, 2000, cols.length - 1, 2000 / GROUND_ROW);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, cols[i % cols.length]);
  pos.needsUpdate = true;
  g.computeBoundingSphere();
  return g;
}
