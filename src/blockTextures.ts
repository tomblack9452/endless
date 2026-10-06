import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type MeshBasicMaterial } from 'three';
import { CONFIG } from './config';

// Procedural sci-fi metal textures for the blocks, drawn once at startup (no
// image files, works offline). Greyscale: the field multiplies them by a
// steel tone derived from the palette, so palette fades keep working.
//
// Side atlas: SIDE_VARIANTS cells side by side, each one block wide and one
// block tall. The shader picks a cell per block and tiles it vertically, so
// tall blocks repeat panels instead of stretching them. Everything drawn in a
// cell either stays inside it or is drawn wrapped, so vertical tiling is seamless.

const SIDE_VARIANTS = 8;
/** Floor/top plates: TOP_VARIANTS cells side by side (picked per instance by its style). */
const TOP_VARIANTS = 4;

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function grey(v: number, a = 1): string {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
}

/** Draws in a 256-unit design grid inside a cell at (x0, y0) of pixel size `size`. */
class Painter {
  readonly k: number;
  constructor(
    readonly ctx: Ctx,
    readonly x0: number,
    readonly y0: number,
    readonly size: number,
    readonly r: () => number,
  ) {
    this.k = size / 256;
  }

  px(x: number): number {
    return this.x0 + x * this.k;
  }
  py(y: number): number {
    return this.y0 + y * this.k;
  }

  path(points: Pt[], close = true): void {
    const c = this.ctx;
    c.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? c.moveTo(this.px(x), this.py(y)) : c.lineTo(this.px(x), this.py(y))));
    if (close) c.closePath();
  }

  /** Flat steel plate with a slight per-plate tone shift. */
  plate(points: Pt[], tone: number): void {
    this.path(points);
    this.ctx.fillStyle = grey(tone);
    this.ctx.fill();
  }

  /**
   * Panel seam: soft occlusion either side, a dark groove, and a light lip
   * offset down-right so the edge reads as bevelled metal.
   */
  seam(points: Pt[], close = false, width = 1): void {
    const c = this.ctx;
    const k = this.k;
    c.lineJoin = 'miter';
    c.lineCap = 'square';
    this.path(points, close);
    c.strokeStyle = grey(0, 0.16);
    c.lineWidth = 9 * k * width;
    c.stroke();
    c.save();
    c.translate(1.6 * k, 1.6 * k);
    this.path(points, close);
    c.strokeStyle = grey(1, 0.55);
    c.lineWidth = 1.6 * k * width;
    c.stroke();
    c.restore();
    this.path(points, close);
    c.strokeStyle = grey(0.12, 0.9);
    c.lineWidth = 2.2 * k * width;
    c.stroke();
  }

  /** Recessed area: darker fill with an inner bevel. */
  recess(points: Pt[], tone = 0.5): void {
    this.plate(points, tone);
    this.seam(points, true);
  }

  bolt(x: number, y: number, rad = 4): void {
    const c = this.ctx;
    const k = this.k;
    c.fillStyle = grey(0.15, 0.8);
    c.beginPath();
    c.arc(this.px(x) + 0.8 * k, this.py(y) + 0.8 * k, rad * k, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = grey(0.82);
    c.beginPath();
    c.arc(this.px(x), this.py(y), rad * k, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = grey(1, 0.8);
    c.beginPath();
    c.arc(this.px(x) - rad * 0.3 * k, this.py(y) - rad * 0.3 * k, rad * 0.4 * k, 0, Math.PI * 2);
    c.fill();
  }

  /** Horizontal slats inside a rectangle. */
  slats(x: number, y: number, w: number, h: number, pitch = 9): void {
    const c = this.ctx;
    const k = this.k;
    for (let sy = y + pitch * 0.6; sy < y + h - 3; sy += pitch) {
      c.fillStyle = grey(0.08, 0.85);
      c.fillRect(this.px(x), this.py(sy), w * k, 3.5 * k);
      c.fillStyle = grey(1, 0.35);
      c.fillRect(this.px(x), this.py(sy + 3.5), w * k, 1.5 * k);
    }
  }

  /** Vertical pipe with a cylindrical gradient and clamp bands. */
  pipe(cx: number, width: number, clampYs: number[]): void {
    const c = this.ctx;
    const k = this.k;
    const left = this.px(cx - width / 2);
    const g = c.createLinearGradient(left, 0, left + width * k, 0);
    g.addColorStop(0, grey(0.18));
    g.addColorStop(0.28, grey(0.78));
    g.addColorStop(0.4, grey(0.98));
    g.addColorStop(0.62, grey(0.6));
    g.addColorStop(1, grey(0.14));
    c.fillStyle = grey(0, 0.3);
    c.fillRect(left + 5 * k, this.y0, width * k, this.size);
    c.fillStyle = g;
    c.fillRect(left, this.y0, width * k, this.size);
    for (const y of clampYs) {
      this.plate([[cx - width / 2 - 5, y - 6], [cx + width / 2 + 5, y - 6], [cx + width / 2 + 5, y + 6], [cx - width / 2 - 5, y + 6]], 0.55);
      this.seam([[cx - width / 2 - 5, y - 6], [cx + width / 2 + 5, y - 6], [cx + width / 2 + 5, y + 6], [cx - width / 2 - 5, y + 6]], true, 0.6);
    }
  }

  /** Small indicator slot: a dark recess with a dim lit strip. */
  light(x: number, y: number, w: number): void {
    this.recess([[x, y], [x + w, y], [x + w, y + 8], [x, y + 8]], 0.12);
    this.ctx.fillStyle = grey(0.95, 0.75);
    this.ctx.fillRect(this.px(x + 3), this.py(y + 3), (w - 6) * this.k, 2.5 * this.k);
  }
}

/**
 * Wear: grime clouds, speckle and scratches. Drawn wrapped vertically so the
 * cell still tiles.
 */
function weather(p: Painter, amount = 1): void {
  const { ctx: c, r, size, x0, y0 } = p;
  c.save();
  c.beginPath();
  c.rect(x0, y0, size, size);
  c.clip();
  for (let i = 0; i < 26 * amount; i++) {
    const x = x0 + r() * size;
    const y = y0 + r() * size;
    const rad = size * (0.06 + r() * 0.22);
    const a = 0.04 + r() * 0.09;
    for (const dy of [-size, 0, size]) {
      const g = c.createRadialGradient(x, y + dy, 0, x, y + dy, rad);
      g.addColorStop(0, grey(0.1, a));
      g.addColorStop(1, grey(0.1, 0));
      c.fillStyle = g;
      c.fillRect(x - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  // Fine brushed grain
  for (let i = 0; i < size * 1.4; i++) {
    const len = size * (0.15 + r() * 0.5);
    c.fillStyle = r() < 0.7 ? grey(1, 0.04 + r() * 0.05) : grey(0, 0.03 + r() * 0.03);
    c.fillRect(x0 + r() * size - len / 2, y0 + r() * size, len, 1);
  }
  // Speckle
  for (let i = 0; i < size * size * 0.02 * amount; i++) {
    c.fillStyle = r() < 0.5 ? grey(0, 0.12 + r() * 0.15) : grey(1, 0.1 + r() * 0.12);
    c.fillRect(x0 + r() * size, y0 + r() * size, 1, 1);
  }
  // Scratches
  c.lineWidth = 1;
  for (let i = 0; i < 40 * amount; i++) {
    const x = x0 + r() * size;
    const y = y0 + r() * size;
    const ang = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2);
    const len = 4 + r() * size * 0.12;
    c.strokeStyle = grey(1, 0.12 + r() * 0.18);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    c.stroke();
  }
  c.restore();
}

function base(p: Painter, tone: number): void {
  p.ctx.fillStyle = grey(tone);
  p.ctx.fillRect(p.x0, p.y0, p.size, p.size);
}

// --- side variants (each tiles vertically) ---------------------------------

/** Angular plates: a seam that jogs diagonally, like hull plating. */
function sideAngular(p: Painter): void {
  base(p, 0.7);
  p.plate([[0, 0], [118, 0], [118, 70], [150, 102], [150, 256], [0, 256]], 0.74);
  p.plate([[118, 0], [256, 0], [256, 256], [150, 256], [150, 102], [118, 70]], 0.64);
  p.seam([[118, -2], [118, 70], [150, 102], [150, 258]]);
  p.seam([[0, 150], [60, 150], [84, 174], [150, 174]]);
  p.seam([[150, 200], [256, 200]]);
  p.recess([[176, 28], [236, 28], [236, 78], [176, 78]], 0.55);
  p.slats(180, 32, 52, 44, 8);
  p.light(176, 216, 60);
  [[16, 16], [100, 16], [16, 134], [134, 190], [240, 186]].forEach(([x, y]) => p.bolt(x, y, 3.6));
}

/** Chamfered octagon inset with a vent, seams running to the corners. */
function sideOctagon(p: Painter): void {
  base(p, 0.68);
  const o: Pt[] = [[78, 40], [178, 40], [214, 76], [214, 180], [178, 216], [78, 216], [42, 180], [42, 76]];
  p.seam([[0, 0], [78, 40]]);
  p.seam([[256, 0], [178, 40]]);
  p.seam([[256, 256], [178, 216]]);
  p.seam([[0, 256], [78, 216]]);
  p.recess(o, 0.56);
  p.recess([[96, 70], [160, 70], [176, 86], [176, 170], [160, 186], [96, 186], [80, 170], [80, 86]], 0.36);
  p.slats(86, 80, 84, 98, 10);
  [[60, 60], [196, 60], [196, 196], [60, 196]].forEach(([x, y]) => p.bolt(x, y, 4));
}

/** Recessed channel carrying two pipes, riveted plates either side. */
function sidePipes(p: Painter): void {
  base(p, 0.66);
  p.plate([[0, 0], [70, 0], [70, 256], [0, 256]], 0.72);
  p.plate([[190, 0], [256, 0], [256, 256], [190, 256]], 0.7);
  p.plate([[70, 0], [190, 0], [190, 256], [70, 256]], 0.36);
  p.pipe(104, 36, [64, 192]);
  p.pipe(158, 22, [128]);
  p.seam([[70, -2], [70, 258]]);
  p.seam([[190, -2], [190, 258]]);
  p.seam([[0, 128], [70, 128]]);
  p.seam([[190, 96], [214, 120], [256, 120]]);
  for (let y = 14; y < 256; y += 28) {
    p.bolt(12, y, 3);
    p.bolt(244, y + 14, 3);
  }
  p.light(204, 200, 40);
}

/** Stacked tech plates with diagonal cuts and a hatch. */
function sideTech(p: Painter): void {
  base(p, 0.7);
  p.plate([[0, 0], [256, 0], [256, 84], [0, 84]], 0.62);
  p.plate([[0, 84], [96, 84], [128, 116], [128, 256], [0, 256]], 0.75);
  p.seam([[0, 84], [96, 84], [128, 116], [128, 258]]);
  p.seam([[96, 84], [256, 84]]);
  p.seam([[0, 196], [128, 196]]);
  p.recess([[150, 112], [234, 112], [234, 214], [150, 214]], 0.6);
  p.seam([[150, 112], [234, 214]], false, 0.6);
  p.recess([[20, 22], [176, 22], [190, 36], [190, 62], [20, 62]], 0.5);
  p.slats(26, 28, 160, 32, 8);
  p.light(212, 32, 30);
  p.light(212, 50, 30);
  [[16, 100], [104, 100], [16, 212], [112, 240], [142, 236], [242, 236]].forEach(([x, y]) => p.bolt(x, y, 3.6));
}

/** Open grating over a dark void, on a frame. */
function sideGrate(p: Painter): void {
  base(p, 0.66);
  p.recess([[24, 24], [232, 24], [232, 232], [24, 232]], 0.3);
  for (let x = 36; x < 232; x += 16) p.seam([[x, 26], [x, 230]], false, 1.6);
  for (let y = 40; y < 232; y += 32) p.seam([[26, y], [230, y]], false, 0.8);
  [[12, 12], [244, 12], [12, 244], [244, 244]].forEach(([x, y]) => p.bolt(x, y, 4));
}

/** Vertical ribs, like the inside of a hull frame. */
function sideRibbed(p: Painter): void {
  base(p, 0.6);
  for (let x = 8; x < 256; x += 48) {
    p.plate([[x, 0], [x + 26, 0], [x + 26, 256], [x, 256]], 0.78);
    p.seam([[x + 26, -2], [x + 26, 258]], false, 1.2);
  }
  p.seam([[0, 92], [256, 92]]);
  p.seam([[0, 188], [256, 188]]);
  for (let x = 21; x < 256; x += 48) {
    p.bolt(x, 80, 3);
    p.bolt(x, 176, 3);
  }
}

/** A panel with a band of hazard stripes along the bottom. */
function sideHazard(p: Painter): void {
  base(p, 0.7);
  p.plate([[0, 0], [256, 0], [256, 176], [0, 176]], 0.74);
  p.recess([[30, 40], [226, 40], [226, 140], [30, 140]], 0.58);
  p.slats(40, 52, 176, 76, 12);
  // Stripes: dark diagonals across a light band.
  p.plate([[0, 186], [256, 186], [256, 244], [0, 244]], 0.86);
  for (let x = -60; x < 256; x += 36) p.plate([[x, 244], [x + 18, 244], [x + 76, 186], [x + 58, 186]], 0.22);
  p.seam([[0, 186], [256, 186]]);
  p.seam([[0, 244], [256, 244]]);
  [[16, 16], [240, 16], [16, 160], [240, 160]].forEach(([x, y]) => p.bolt(x, y, 3.6));
}

/** Small square panels in a grid, a couple of them lit screens. */
function sidePanels(p: Painter): void {
  base(p, 0.64);
  for (let y = 0; y < 256; y += 64) {
    for (let x = 0; x < 256; x += 64) {
      const tone = 0.62 + ((x * 7 + y * 3) % 5) * 0.03;
      p.plate([[x + 4, y + 4], [x + 60, y + 4], [x + 60, y + 60], [x + 4, y + 60]], tone);
      p.seam([[x + 4, y + 4], [x + 60, y + 4], [x + 60, y + 60], [x + 4, y + 60]], true);
    }
  }
  p.recess([[72, 136], [120, 136], [120, 180], [72, 180]], 0.3);
  p.light(76, 150, 40);
  p.light(76, 162, 30);
  p.recess([[200, 72], [248, 72], [248, 116], [200, 116]], 0.3);
  p.light(204, 92, 40);
}

const SIDES = [sideAngular, sideOctagon, sidePipes, sideTech, sideGrate, sideRibbed, sideHazard, sidePanels];

function drawSide(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size * SIDE_VARIANTS;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = rand(7);
  SIDES.forEach((draw, v) => {
    const p = new Painter(ctx, v * size, 0, size, r);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x0, 0, size, size);
    ctx.clip();
    draw(p);
    weather(p);
    // Horizontal seam on the tile edge marks each stacked section.
    p.seam([[-2, 0.5], [258, 0.5]]);
    // Darken the vertical cell edges so block corners read.
    ctx.fillStyle = grey(0, 0.3);
    ctx.fillRect(p.x0, 0, 4 * p.k, size);
    ctx.fillRect(p.x0 + size - 4 * p.k, 0, 4 * p.k, size);
    ctx.restore();
  });
  return canvas;
}

/** Floor plates: octagon hatch, tread plate, grating, big plates with a stripe. */
function drawTop(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size * TOP_VARIANTS;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = rand(19);
  [topHatch, topTread, topGrating, topStriped].forEach((draw, v) => {
    const p = new Painter(ctx, v * size, 0, size, r);
    ctx.save();
    ctx.beginPath();
    ctx.rect(p.x0, 0, size, size);
    ctx.clip();
    draw(p);
    weather(p, 0.8);
    // Rim
    ctx.fillStyle = grey(0, 0.35);
    ctx.fillRect(p.x0, 0, size, 5 * p.k);
    ctx.fillRect(p.x0, 0, 5 * p.k, size);
    ctx.fillRect(p.x0, size - 5 * p.k, size, 5 * p.k);
    ctx.fillRect(p.x0 + size - 5 * p.k, 0, 5 * p.k, size);
    ctx.restore();
  });
  return canvas;
}

/** Diamond tread plate. */
function topTread(p: Painter): void {
  base(p, 0.7);
  for (let y = 10; y < 256; y += 24) {
    for (let x = (y / 24) % 2 ? 22 : 10; x < 256; x += 24) {
      p.plate([[x, y - 6], [x + 3, y - 6], [x + 9, y + 6], [x + 6, y + 6]], 0.82);
    }
  }
}

/** Floor grating on beams. */
function topGrating(p: Painter): void {
  base(p, 0.62);
  p.recess([[16, 16], [240, 16], [240, 240], [16, 240]], 0.28);
  for (let x = 24; x < 240; x += 12) p.seam([[x, 18], [x, 238]], false, 1.4);
  p.plate([[0, 120], [256, 120], [256, 136], [0, 136]], 0.7);
  [[8, 8], [248, 8], [8, 248], [248, 248], [8, 128], [248, 128]].forEach(([x, y]) => p.bolt(x, y, 3.4));
}

/** Big plain plates with a painted guide stripe. */
function topStriped(p: Painter): void {
  base(p, 0.74);
  p.seam([[128, -2], [128, 258]]);
  p.seam([[0, 128], [256, 128]]);
  p.plate([[56, 0], [72, 0], [72, 256], [56, 256]], 0.9);
  [[16, 16], [240, 16], [16, 240], [240, 240], [112, 112], [144, 144]].forEach(([x, y]) => p.bolt(x, y, 3.2));
}

function topHatch(p: Painter): void {
  base(p, 0.72);
  // Geometric plate: octagon hatch with seams to the corners.
  p.plate([[0, 0], [256, 0], [176, 80], [80, 80]], 0.78);
  p.plate([[0, 256], [256, 256], [176, 176], [80, 176]], 0.64);
  const o: Pt[] = [[96, 60], [160, 60], [196, 96], [196, 160], [160, 196], [96, 196], [60, 160], [60, 96]];
  p.seam([[0, 0], [80, 80]]);
  p.seam([[256, 0], [176, 80]]);
  p.seam([[256, 256], [176, 176]]);
  p.seam([[0, 256], [80, 176]]);
  p.recess(o, 0.6);
  p.recess([[110, 92], [146, 92], [164, 110], [164, 146], [146, 164], [110, 164], [92, 146], [92, 110]], 0.45);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    p.bolt(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52, 3.4);
  }
}

function toTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

export function createBlockTextures(maxAnisotropy: number) {
  const b = CONFIG.blocks;
  const aniso = Math.min(b.anisotropy, maxAnisotropy);
  return {
    side: toTexture(drawSide(b.textureSize), aniso),
    top: toTexture(drawTop(b.textureSize), aniso),
  };
}

/**
 * Replace the box's UVs with world-scale ones so textures tile per block unit
 * instead of stretching: tall blocks repeat panels upwards, wide hull plates
 * repeat them sideways. Side faces pick an atlas cell per instance from its
 * scale, which is stable for the instance's lifetime (indices are not).
 * `top` marks the material used for the top/bottom faces (separate texture);
 * `topScale` < 1 makes those plates larger (0.5 = one plate per 2 units).
 */
export function patchBlockMaterial(mat: MeshBasicMaterial, top: boolean, topScale = 1): void {
  const cube = CONFIG.field.cubeSize.toFixed(4);
  const variants = SIDE_VARIANTS.toFixed(1);
  const tops = TOP_VARIANTS.toFixed(1);
  mat.onBeforeCompile = (shader) => {
    const decl = 'varying vec2 vBlockUv;\nvarying float vBlockCell;\nvarying float vTopCell;\n';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${decl}\nattribute float aStyle;`)
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  {
    vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    float seed = fract(sc.y * 7.137 + sc.x * 3.71 + sc.z * 1.93);
    vec3 p = position * sc / ${cube};
    // aStyle: which floor plate (0-3), and the room family's half of the wall atlas.
    vTopCell = mod(aStyle, ${tops});
    float wallSet = floor(aStyle / ${tops});
    vBlockCell = wallSet > 0.5 ? mod(floor(seed * 4.0) + 4.0 * mod(wallSet - 1.0, 2.0), ${variants}) : floor(seed * ${variants});
    if (abs(normal.y) > 0.5) {
      vBlockUv = p.xz * ${topScale.toFixed(3)} + 0.5;
    } else {
      float across = abs(normal.x) > 0.5 ? p.z * sign(normal.x) : -p.x * sign(normal.z);
      // 0.9999 keeps one-unit faces strictly inside a single tile.
      vBlockUv = vec2(across * 0.9999 + 0.5, p.y + floor(seed * 5.0));
    }
  }
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${decl}`)
      .replace(
        '#include <map_fragment>',
        top
          ? `#ifdef USE_MAP
  {
    vec2 tile = vec2((fract(vBlockUv.x) + vTopCell) / ${tops}, vBlockUv.y);
    vec2 g = vec2(1.0 / ${tops}, 1.0);
    diffuseColor *= textureGrad(map, tile, dFdx(vBlockUv) * g, dFdy(vBlockUv) * g);
  }
#endif`
          : `#ifdef USE_MAP
  {
    vec2 tile = vec2((clamp(fract(vBlockUv.x), 0.005, 0.995) + vBlockCell) / ${variants}, vBlockUv.y);
    // Gradients from the continuous coordinate, so tile seams don't pick a tiny mip.
    vec2 g = vec2(1.0 / ${variants}, 1.0);
    diffuseColor *= textureGrad(map, tile, dFdx(vBlockUv) * g, dFdy(vBlockUv) * g);
  }
#endif`,
      );
  };
  mat.customProgramCacheKey = () => (top ? `block-uv-top-${topScale}` : 'block-uv-side');
}