import { CONFIG } from './config';

// Difficulty as smooth, capped functions of score. Each one approaches its
// max asymptotically, so the game scales forever without becoming impossible.

function ramp(score: number, points: number): number {
  return 1 - Math.exp(-Math.max(0, score) / points);
}

export function speedAt(score: number): number {
  const s = CONFIG.speed;
  return s.base + (s.max - s.base) * ramp(score, s.rampPoints);
}

export function densityAt(score: number): number {
  const f = CONFIG.field;
  return f.densityStart + (f.densityMax - f.densityStart) * ramp(score, f.densityRampPoints);
}

export function lateralSpeedAt(speed: number): number {
  const st = CONFIG.steering;
  return st.maxLateralSpeed * Math.pow(Math.max(1, speed / CONFIG.speed.base), st.lateralSpeedExponent);
}
