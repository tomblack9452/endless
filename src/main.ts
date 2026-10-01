import '@fontsource/jetbrains-mono/300.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './style.css';
import { Game } from './game';

// Block browser gestures that fight the game.
const block = (e: Event) => e.preventDefault();
document.addEventListener('contextmenu', block);
document.addEventListener('gesturestart', block);
document.addEventListener('dblclick', block);
document.addEventListener('selectstart', block);
document.addEventListener('touchmove', block, { passive: false });

const canvas = document.getElementById('scene') as HTMLCanvasElement;

// Wait for the font so the first frame of UI text doesn't swap.
void document.fonts.ready.then(() => {
  const game = new Game(canvas);
  game.start();
  // Exposed for debugging from the console during development only.
  if (import.meta.env.DEV) {
    (window as unknown as { game: Game }).game = game;
    // Dev panel (level skip etc). Stripped from production builds.
    void import('./dev').then((m) => m.installDevPanel(game));
  }
});
