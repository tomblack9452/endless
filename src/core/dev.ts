import { CONFIG } from './config';
import type { Game } from './game';
import { ROOM_IDS, type RoomId } from '../world/interior';
import { PIECE_IDS } from '../world/pieces';
import { themeForLevel } from '../world/world';

// Dev tools. Only loaded by the dev server (see main.ts), so they
// never ship in a production or Capacitor build.
//
// Title and game-over screens: "dev" opens a panel to start just before any level, plus
// toggles for invincibility and a full boost meter at the start of each run.

const LEVELS = CONFIG.themes.levelsPerTheme * 4; // four full theme loops
let forcedRoom: RoomId | null = null; // shared by both panels
let forcedPiece: string | null = null;
let showRoutes = false;

export function installDevPanel(game: Game): void {
  installFps(game);
  // On the title and on the game-over screen (there's no way back to the title after a crash).
  for (const id of ['screen-title', 'screen-over']) {
    const screen = document.getElementById(id);
    if (screen) install(game, screen);
  }
}

function install(game: Game, title: HTMLElement): void {
  const renders: (() => void)[] = []; // toggle labels, refreshed on open
  const link = document.createElement('span');
  link.className = 'label link dev-link';
  link.textContent = 'dev';
  title.appendChild(link);

  const panel = document.createElement('div');
  panel.className = 'dev-panel';
  panel.hidden = true;
  title.appendChild(panel);

  // Nothing in here should start a normal run.
  for (const el of [link, panel]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
  const show = (on: boolean) => {
    panel.hidden = !on;
    title.classList.toggle('dev-open', on);
    if (on) for (const r of renders) r();
  };
  link.addEventListener('click', () => show(panel.hidden === true));

  const heading = document.createElement('div');
  heading.className = 'label dim';
  heading.textContent = 'start just before';
  panel.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'dev-grid';
  panel.appendChild(grid);
  for (let level = 1; level <= LEVELS; level++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'label dev-level';
    b.textContent = `${level} ${themeForLevel(level).slice(0, 4)}`;
    b.addEventListener('click', () => {
      show(false);
      game.devStartAt(level);
    });
    grid.appendChild(b);
  }

  const toggle = (label: string, key: 'invincible' | 'fullBoost' | 'autopilot') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'label dev-toggle';
    const render = () => (b.textContent = `${label} ${game.dev[key] ? 'on' : 'off'}`);
    b.addEventListener('click', () => {
      game.dev[key] = !game.dev[key];
      render();
    });
    render();
    renders.push(render);
    panel.appendChild(b);
  };
  toggle('invincible', 'invincible');
  toggle('full boost', 'fullBoost');
  toggle('autopilot', 'autopilot');

  // Replay the last course exactly (same seed).
  const replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'label dev-toggle';
  const renderReplay = () => (replay.textContent = `replay seed ${game.seed}`);
  replay.addEventListener('click', () => {
    show(false);
    game.devReplay();
  });
  renderReplay();
  renders.push(renderReplay);
  panel.appendChild(replay);

  // Force one interior room type (pair with "7 inte") to test it.
  const rooms: (RoomId | null)[] = [null, ...ROOM_IDS.filter((r) => r !== 'corridor')];
  const roomBtn = document.createElement('button');
  roomBtn.type = 'button';
  roomBtn.className = 'label dev-toggle';
  const renderRoom = () => (roomBtn.textContent = `ship room ${forcedRoom ?? 'random'}`);
  roomBtn.addEventListener('click', () => {
    forcedRoom = rooms[(rooms.indexOf(forcedRoom) + 1) % rooms.length];
    game.devSetRoom(forcedRoom);
    for (const r of renders) r();
  });
  renderRoom();
  renders.push(renderRoom);
  panel.appendChild(roomBtn);

  // Force one hand-made section everywhere it fits (pair with "8 inte").
  const pieces: (string | null)[] = [null, ...PIECE_IDS];
  const pieceBtn = document.createElement('button');
  pieceBtn.type = 'button';
  pieceBtn.className = 'label dev-toggle';
  const renderPiece = () => (pieceBtn.textContent = `section ${forcedPiece ?? 'random'}`);
  pieceBtn.addEventListener('click', () => {
    forcedPiece = pieces[(pieces.indexOf(forcedPiece) + 1) % pieces.length];
    game.devSetPiece(forcedPiece);
    for (const r of renders) r();
  });
  renderPiece();
  renders.push(renderPiece);
  panel.appendChild(pieceBtn);

  // Draw sections' routes on the floor: main white, alt teal, risky amber.
  const routesBtn = document.createElement('button');
  routesBtn.type = 'button';
  routesBtn.className = 'label dev-toggle';
  const renderRoutes = () => (routesBtn.textContent = `show routes ${showRoutes ? 'on' : 'off'}`);
  routesBtn.addEventListener('click', () => {
    showRoutes = !showRoutes;
    game.devShowRoutes(showRoutes);
    for (const r of renders) r();
  });
  renderRoutes();
  renders.push(renderRoutes);
  panel.appendChild(routesBtn);

  // Unlock everything (saved, so it sticks in this browser) and the way back.
  const action = (text: string, run: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'label dev-toggle';
    b.textContent = text;
    b.addEventListener('click', run);
    panel.appendChild(b);
  };
  // Stand-ins for purchases until the store is in.
  action('add 500 cores', () => game.devAddCores(500));
  action('premium on/off', () => game.devTogglePremium());
  action('unlock all', () => {
    game.devUnlockAll();
    show(false);
  });
  action('reset all progress', () => {
    if (!window.confirm('reset all progress, ranks, credits and unlocks in this browser?')) return;
    for (const k of Object.keys(localStorage)) if (k.startsWith('endless.') && k !== 'endless.settings') localStorage.removeItem(k);
    location.reload();
  });
}

/**
 * Dev profiling readout: fps, average and 95th-percentile frame time over the
 * last half second, render scale, draw calls, triangles, textures and
 * geometries, and a graph of the last 120 frame times (the lines are 16.7 ms
 * and 33 ms). `window.__frameStats()` returns every frame time so far plus the
 * renderer numbers, for scripted profiling (see docs/development.md).
 */
function installFps(game: Game): void {
  const box = document.createElement('div');
  box.className = 'label dev-fps';
  const text = document.createElement('div');
  const graph = document.createElement('canvas');
  const W = 120;
  const H = 36;
  graph.width = W;
  graph.height = H;
  graph.style.cssText = `display:block;width:${W}px;height:${H}px;margin-top:2px;margin-left:auto;background:rgba(0,0,0,0.25)`;
  box.append(text, graph);
  document.getElementById('ui')?.appendChild(box);
  const g = graph.getContext('2d');
  const times = new Float32Array(W);
  let head = 0;
  let recent: number[] = [];
  let lastFrame = performance.now();
  let last = lastFrame;
  const all: number[] = [];
  (window as unknown as { __frameStats: () => unknown }).__frameStats = () => ({ frames: all.slice(), ...game.devStats() });
  const y = (ms: number) => H - Math.min(H, (ms / 50) * H);
  const draw = () => {
    if (!g) return;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, y(16.7), W, 1);
    g.fillRect(0, y(33.3), W, 1);
    for (let i = 0; i < W; i++) {
      const ms = times[(head + i) % W];
      g.fillStyle = ms > 33.3 ? '#e0533c' : ms > 16.7 ? '#e8b23a' : '#7ccf6a';
      g.fillRect(i, y(ms), 1, H - y(ms));
    }
  };
  const tick = (now: number) => {
    const ms = now - lastFrame;
    lastFrame = now;
    times[head] = ms;
    head = (head + 1) % W;
    recent.push(ms);
    all.push(ms);
    if (now - last >= 500) {
      const fps = Math.round((recent.length * 1000) / (now - last));
      const sorted = recent.slice().sort((a, b) => a - b);
      const avg = sorted.reduce((t, v) => t + v, 0) / sorted.length;
      const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
      const s = game.devStats();
      text.textContent =
        `${fps} fps  ${avg.toFixed(1)}/${p95.toFixed(1)} ms  x${s.ratio.toFixed(2)}${s.low ? ' low' : ''}\n` +
        `${s.calls} calls  ${(s.triangles / 1000).toFixed(1)}k tris  ${s.textures} tex  ${s.geometries} geo`;
      recent = [];
      last = now;
    }
    draw();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
