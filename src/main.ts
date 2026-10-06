// Latin only: the UI is all lowercase English, so the other scripts would be dead weight.
import '@fontsource/jetbrains-mono/latin-300.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './style.css';
import { Capacitor } from '@capacitor/core';
import { Game } from './game';

// Block browser gestures that fight the game.
const block = (e: Event) => e.preventDefault();
document.addEventListener('contextmenu', block);
document.addEventListener('gesturestart', block);
document.addEventListener('dblclick', block);
document.addEventListener('selectstart', block);
document.addEventListener(
  'touchmove',
  (e) => {
    // Settings lists and the title screen (in a short window) are the only things that scroll.
    if (!(e.target instanceof Element && e.target.closest('.settings, #screen-title'))) e.preventDefault();
  },
  { passive: false },
);

const canvas = document.getElementById('scene') as HTMLCanvasElement;
// Which build is running, at the bottom of settings (handy for telling an old cached copy from a new one).
document.getElementById('build')!.textContent = `version ${__BUILD__}`;

// Offline support and add-to-home-screen, in real builds only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js'));
}

// Wait for the font so the first frame of UI text doesn't swap.
void document.fonts.ready.then(() => {
  const game = new Game(canvas);
  game.start();
  // Exposed for debugging from the console during development only.
  if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  // Android's back button steps back through the game, and leaves from the title screen.
  if (Capacitor.getPlatform() === 'android')
    void import('@capacitor/app').then(({ App }) => App.addListener('backButton', () => (game.back() ? undefined : void App.exitApp())));
  // Dev panel (level skip, unlock all etc), on the dev server only (npm run dev).
  if (import.meta.env.DEV) void import('./dev').then((m) => m.installDevPanel(game));
});
