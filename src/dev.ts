import { CONFIG } from './config';
import type { Game } from './game';
import { ROOM_IDS, type RoomId } from './interior';
import { PIECE_IDS } from './pieces';
import { themeForLevel } from './world';

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

/** Small FPS / render scale / draw call readout, bottom-left above the boost text. */
function installFps(game: Game): void {
  const el = document.createElement('div');
  el.className = 'label dev-fps';
  document.getElementById('ui')?.appendChild(el);
  let frames = 0;
  let last = performance.now();
  const tick = (now: number) => {
    frames++;
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      const s = game.devStats();
      el.textContent = `${fps} fps  x${s.ratio.toFixed(2)}  ${s.calls} calls`;
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}