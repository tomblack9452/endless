import { CONFIG } from '../core/config';

// Colour-blind mode (settings > display): hazards, pickups and power-ups in a
// palette that reads with any kind of colour vision, built on blue against
// orange: what helps you is blue (or white), what ends a run is orange. Colour
// is never the only signal: each power-up also takes its own shape (the shield
// tall, the magnet a flat disc, slow-mo round, phase long, double points wide
// and low), and hazards keep their rings,
// crusts and glow. The world and the pickup cards both read from here.

export type ItemId = 'pickup' | 'shield' | 'magnet' | 'slow' | 'phase' | 'double';

/** The safe palette (after Okabe and Ito's). */
export const SAFE = {
  pickup: '#2f7fe0',
  shield: '#56b4e9',
  magnet: '#f2f2f2',
  slow: '#0d4f9e',
  phase: '#b8e2fb',
  double: '#22409a',
  hazard: '#ff7a00', // lava, molten metal, lava bombs, laser beams and warning lights
  mark: '#ffa53a', // where a lava bomb will land
} as const;

/** Each power-up's shape in colour-blind mode, by PowerKind (0 shield, 1 magnet, 2 slow-mo, 3 phase, 4 double points): its gem scaled [across, up, along]. */
export const SAFE_SHAPES: readonly (readonly [number, number, number])[] = [
  [0.68, 1.7, 0.68],
  [1.6, 0.5, 1.6],
  [1, 1, 1],
  [0.6, 0.6, 2.1],
  [1.9, 0.8, 0.55],
];

let safe = false;

/** Turn the safe palette on or off (applySettings). */
export function setSafeColours(on: boolean): void {
  safe = on;
}

export function safeColours(): boolean {
  return safe;
}

/** An item's colour as the game draws it now. */
export function itemColour(id: ItemId): string {
  if (safe) return SAFE[id];
  if (id === 'pickup') return CONFIG.boost.pickup.color;
  return CONFIG.powers[id].color;
}
