// The launch splash (index.html, drawn before any script loads): it lifts once
// the game has drawn its first frame behind it, and stays at least a moment so
// it never just flashes.

const MIN_MS = 700;

/** Fade the splash out over the game, then remove it; `onGone` runs after. */
export function liftSplash(onGone: () => void = () => undefined): void {
  const el = document.getElementById('splash');
  if (!el) {
    onGone();
    return;
  }
  let done = false;
  const gone = (): void => {
    if (done) return;
    done = true;
    el.remove();
    onGone();
  };
  // Two frames: the game's first frame is on screen behind the splash.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      setTimeout(() => {
        el.classList.add('done');
        el.addEventListener('transitionend', (e) => e.target === el && gone());
        setTimeout(gone, 800); // no transition to wait for (reduce motion, a hidden tab)
      }, Math.max(0, MIN_MS - performance.now()));
    }),
  );
}

/** True while the splash is up (the system bars stay light-on-dark over it). */
export function splashUp(): boolean {
  return document.getElementById('splash') !== null;
}
