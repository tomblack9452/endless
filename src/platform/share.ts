import { Capacitor } from '@capacitor/core';

// The share card: a picture of a new best (or a ranked run) in the store art's
// dusk: a deep sky warming to amber at the horizon, a ringed planet, dark
// ridges, the lane glowing towards the ship, and the pilot's own ship on it,
// with the score, the mode or board, and a small "endless space" wordmark.
// Sent through the phone's share sheet where there is one (the Web Share API),
// otherwise saved as a picture on the web.

export interface ShareCard {
  score: string;
  /** The mode or board: "ranked · week of 12 oct", "daily · 15 oct", "solo · ice field", "endless". */
  mode: string;
  /** Above the score: "new best", or "" */
  kicker: string;
  /** Under the mode: rank, league, streak... (two at most fit) */
  lines: string[];
  /** The ship as the pilot has it on (a picture's data URL; src/ship/portrait.ts), or null. */
  ship: string | null;
}

export const SHARE_W = 1080;
export const SHARE_H = 1350;

/** The store art's dusk (docs/store-assets/feature-graphic.png). */
const DUSK = {
  top: '#1f1d2e',
  mid: '#3a3350',
  glow: '#e8a265',
  horizon: '#f3c48e',
  ground: '#1a1820',
  ridge: '#2a2533',
  planet: '#f4e3c9',
  planetShade: '#e3c9a4',
  ring: '#fff3df',
  ink: '#f1ede4',
  wordmark: '#e8a265',
};

/** A seeded scatter, so the stars sit in the same places on every card. */
function stars(n: number, seed = 7): [number, number, number][] {
  let a = seed;
  const r = () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
  return Array.from({ length: n }, () => [r(), r(), r()] as [number, number, number]);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((done) => {
    const img = new Image();
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = src;
  });
}

/** Draw the card. */
export async function drawShareCard(c: ShareCard): Promise<HTMLCanvasElement> {
  const W = SHARE_W;
  const H = SHARE_H;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d')!;
  const horizon = H * 0.66;

  // Sky: deep at the top, warming to amber at the horizon.
  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, DUSK.top);
  sky.addColorStop(0.55, DUSK.mid);
  sky.addColorStop(0.86, '#8a6a6a');
  sky.addColorStop(1, DUSK.horizon);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, horizon);

  // Stars, fewer and fainter towards the glow.
  for (const [x, y, s] of stars(90)) {
    const yy = y * horizon * 0.62;
    if (x * W < 800 && yy > 90 && yy < 640) continue; // clear of the words
    g.globalAlpha = 0.25 + 0.6 * s * (1 - yy / (horizon * 0.62));
    g.fillStyle = DUSK.ink;
    g.beginPath();
    g.arc(x * W, yy, 1.2 + s * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  // A couple of four-point sparkles, as in the store art.
  g.globalAlpha = 0.9;
  for (const [x, y, r] of [
    [0.84, 0.1, 16],
    [0.58, 0.06, 11],
  ] as const) {
    const cx = x * W;
    const cy = y * H;
    g.beginPath();
    g.moveTo(cx, cy - r);
    g.quadraticCurveTo(cx, cy, cx + r, cy);
    g.quadraticCurveTo(cx, cy, cx, cy + r);
    g.quadraticCurveTo(cx, cy, cx - r, cy);
    g.quadraticCurveTo(cx, cy, cx, cy - r);
    g.fill();
  }
  g.globalAlpha = 1;

  // The ringed planet, sitting on the horizon, right of centre.
  const px = W * 0.66;
  const py = horizon - 70;
  const pr = 150;
  const ring = (front: boolean) => {
    g.save();
    g.translate(px, py);
    g.rotate(-0.18);
    g.strokeStyle = DUSK.ring;
    g.lineWidth = 10;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.ellipse(0, 0, pr * 1.75, pr * 0.38, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.stroke();
    g.restore();
  };
  ring(false);
  const planet = g.createLinearGradient(px - pr, 0, px + pr, 0);
  planet.addColorStop(0, DUSK.planet);
  planet.addColorStop(0.7, DUSK.planet);
  planet.addColorStop(1, DUSK.planetShade);
  g.fillStyle = planet;
  g.beginPath();
  g.arc(px, py, pr, 0, Math.PI * 2);
  g.fill();
  ring(true);

  // Dark ridges along the horizon.
  g.fillStyle = DUSK.ridge;
  g.beginPath();
  g.moveTo(0, horizon);
  const ridge = [0, 0.04, 0.1, 0.17, 0.24, 0.3, 0.38, 0.47, 0.55, 0.63, 0.72, 0.8, 0.88, 0.95, 1];
  const lift = [70, 40, 95, 60, 110, 45, 30, 55, 20, 35, 60, 100, 70, 85, 55];
  ridge.forEach((x, i) => g.lineTo(x * W, horizon - lift[i]));
  g.lineTo(W, horizon);
  g.closePath();
  g.fill();

  // Glow along the horizon line.
  const glow = g.createLinearGradient(0, horizon - 40, 0, horizon + 30);
  glow.addColorStop(0, 'rgba(243,196,142,0)');
  glow.addColorStop(0.6, 'rgba(243,196,142,0.55)');
  glow.addColorStop(1, 'rgba(243,196,142,0)');
  g.fillStyle = glow;
  g.fillRect(0, horizon - 40, W, 70);

  // The ground, and the lane's edges glowing out towards you.
  const ground = g.createLinearGradient(0, horizon, 0, H);
  ground.addColorStop(0, '#2c2630');
  ground.addColorStop(1, DUSK.ground);
  g.fillStyle = ground;
  g.fillRect(0, horizon, W, H - horizon);
  g.strokeStyle = DUSK.glow;
  g.lineWidth = 5;
  g.globalAlpha = 0.85;
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(W / 2 + side * 26, horizon);
    g.lineTo(W / 2 + side * 520, H);
    g.stroke();
  }
  g.globalAlpha = 0.35;
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    const y = horizon + (H - horizon) * t * t;
    g.beginPath();
    g.moveTo(W / 2, y);
    g.lineTo(W / 2, y + 18 + 30 * t);
    g.stroke();
  }
  g.globalAlpha = 1;

  // The ship on the lane, with a warm glow under its engine.
  const ship = c.ship ? await loadImage(c.ship) : null;
  if (ship) {
    const sw = 600;
    const sh = (sw * ship.height) / ship.width;
    const sy = H - sh - 40;
    // A pool of warm light on the ground, so a dark ship still stands out.
    g.save();
    g.translate(W / 2, sy + sh * 0.62);
    g.scale(1, 0.42);
    const halo = g.createRadialGradient(0, 0, 10, 0, 0, 380);
    halo.addColorStop(0, 'rgba(243,196,142,0.85)');
    halo.addColorStop(0.45, 'rgba(232,162,101,0.4)');
    halo.addColorStop(1, 'rgba(232,162,101,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, 380, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.drawImage(ship, W / 2 - sw / 2, sy, sw, sh);
  }

  // Words: the wordmark, then what the run was.
  const font = (px: number, weight = 400) => `${weight} ${px}px "Geist Mono", ui-monospace, monospace`;
  g.textAlign = 'left';
  g.fillStyle = DUSK.wordmark;
  g.font = font(30, 500);
  spaced(g, 'ENDLESS SPACE', 96, 150, 9);
  g.fillStyle = DUSK.ink;
  if (c.kicker) {
    g.font = font(38, 500);
    g.globalAlpha = 0.85;
    g.fillText(c.kicker, 96, 290);
    g.globalAlpha = 1;
  }
  g.font = font(c.score.length > 7 ? 150 : 180, 300);
  g.fillText(c.score, 88, 460);
  g.font = font(40);
  g.fillText(c.mode, 96, 540);
  g.font = font(32);
  g.globalAlpha = 0.72;
  c.lines.slice(0, 2).forEach((l, i) => g.fillText(l, 96, 600 + i * 50));
  g.globalAlpha = 0.55;
  g.font = font(24);
  g.textAlign = 'center';
  g.fillText('tomblack9452.github.io/endless', W / 2, H - 28);
  g.globalAlpha = 1;
  return canvas;
}

/** Text with letters spread apart, the store art's wordmark. */
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, gap: number): void {
  for (const ch of text) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + gap;
  }
}

/**
 * Can this device share the card? The web always can (the share sheet, or
 * saving the picture); the app only where its web view has the Web Share API
 * (Android's doesn't yet, and no share plugin is added), so there the button
 * stays hidden rather than offering something that can't work.
 */
export function shareAvailable(): boolean {
  return !Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
}

/** What happened: shared, saved as a picture (the web), or neither works here. */
export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'unavailable';

/** Share the card through the share sheet, or save it where the device can't share pictures. */
export async function shareCard(c: ShareCard): Promise<ShareOutcome> {
  const canvas = await drawShareCard(c);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return 'unavailable';
  const file = new File([blob], 'endless-space.png', { type: 'image/png' });
  const data = { files: [file], title: 'Endless Space', text: `${c.score} · ${c.mode}` };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // Not allowed: fall through to saving it.
    }
  }
  // The app's web view can't save a download; only the web can.
  if (Capacitor.isNativePlatform()) return 'unavailable';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'endless-space.png';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'saved';
}
