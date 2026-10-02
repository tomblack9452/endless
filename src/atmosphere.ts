import { Color } from 'three';
import { CONFIG } from './config';
import type { LivePalette } from './palette';

// Day/night cycle. Takes the level's base palette and writes a time-of-day
// tinted version into the live palette the materials read. No allocations
// per call.

interface Key {
  sky: Color;
  fog: Color;
  mix: number;
  light: number;
  blocks: number;
}

const A = CONFIG.atmosphere;
const KEYS: Key[] = A.keys.map((k) => ({
  sky: new Color(k.sky),
  fog: new Color(k.fog),
  mix: k.mix,
  light: k.light,
  blocks: k.blocks,
}));
const NIGHT_TEXT = new Color(A.nightText);
const NIGHT_SHIP = new Color(A.nightShip);
const T = CONFIG.themes;
const CANYON_GROUND = new Color(T.canyon.ground);
const CANYON_ROCK = new Color(T.canyon.rock);
const CANYON_OBSTACLE = new Color(T.canyon.obstacle);
const INTERIOR_SKY = new Color(T.interior.sky);
const INTERIOR_FOG = new Color(T.interior.fog);
const INTERIOR_LIGHT = Math.pow(T.interior.light, 2.2);
const lit = new Color();
const WHITE = new Color(1, 1, 1);
const BLACK = new Color(0.02, 0.02, 0.025);
const SPACE_SKY = new Color(CONFIG.space.sky);
const SPACE_FOG = new Color(CONFIG.space.fog);

const skyA = new Color();
const skyB = new Color();
const fogA = new Color();
const fogB = new Color();

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Perceptual (sRGB-ish) brightness of a linear colour. */
function brightness(c: Color): number {
  return Math.pow(0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b, 1 / 2.2);
}

/** 0 when `c` is bright enough for dark text, 1 when it needs light text. */
function darkness(c: Color, from: number, to: number): number {
  const t = (from - brightness(c)) / (from - to);
  return smooth(t < 0 ? 0 : t > 1 ? 1 : t);
}

/**
 * `levelProgress` is score / levelLength (level 1 = 0..1). `canyon` and
 * `interior` (0..1) blend in the theme looks. Writes the result into `out`.
 */
export function applyAtmosphere(
  base: LivePalette,
  out: LivePalette,
  levelProgress: number,
  canyon: number,
  interior: number,
  space = 0,
  contrast = false,
): void {
  out.copy(base);
  out.ground.lerp(CANYON_GROUND, canyon);
  out.rock.copy(CANYON_ROCK);
  out.obstacle.copy(CANYON_OBSTACLE);
  out.light.setRGB(1, 1, 1);
  if (A.enabled) applyTimeOfDay(base, out, levelProgress);
  applyInterior(base, out, interior);
  // Observation deck: deep space overhead.
  if (space > 0) {
    out.sky.lerp(SPACE_SKY, space);
    out.fog.lerp(SPACE_FOG, space * 0.8);
  }
  if (contrast) highContrast(out);
  flipForeground(out);
}

/**
 * High-contrast option: push the ground and everything you can hit apart in
 * brightness (whatever the time of day), so obstacles stand out by lightness
 * alone, not by hue.
 */
function highContrast(out: LivePalette): void {
  const groundLight = brightness(out.ground) > 0.45;
  out.ground.lerp(groundLight ? WHITE : BLACK, 0.35);
  const target = groundLight ? BLACK : WHITE;
  out.obstacle.lerp(target, 0.65);
  out.rock.lerp(target, 0.45);
  out.cubeLight.lerp(target, 0.4);
  out.cubeMid.lerp(target, 0.4);
  out.cubeDark.lerp(target, 0.4);
  out.light.lerp(groundLight ? BLACK : WHITE, 0.25);
}

function applyTimeOfDay(base: LivePalette, out: LivePalette, levelProgress: number): void {

  const n = KEYS.length;
  const t = ((levelProgress % n) + n) % n;
  const i = Math.floor(t);
  const a = KEYS[i];
  const b = KEYS[(i + 1) % n];
  const f = smooth(t - i);

  // Sky and fog: blend the palette towards each key, then between keys.
  skyA.copy(base.sky).lerp(a.sky, a.mix);
  skyB.copy(base.sky).lerp(b.sky, b.mix);
  out.sky.copy(skyA).lerp(skyB, f);
  fogA.copy(base.fog).lerp(a.fog, a.mix);
  fogB.copy(base.fog).lerp(b.fog, b.mix);
  out.fog.copy(fogA).lerp(fogB, f);

  // Light values are perceptual; colours are stored linear, so convert.
  const ground = Math.pow(a.light + (b.light - a.light) * f, 2.2);
  const blocks = Math.pow(a.blocks + (b.blocks - a.blocks) * f, 2.2);
  out.ground.multiplyScalar(ground);
  // Ground fades towards the fog colour as it darkens, so night isn't muddy.
  out.ground.lerp(out.fog, (1 - ground) * A.groundFogTint);
  out.cubeLight.multiplyScalar(blocks);
  out.cubeMid.multiplyScalar(blocks);
  out.cubeDark.multiplyScalar(blocks);
  out.rock.multiplyScalar(blocks);
  // Obstacles darken less than the walls so they keep reading at night.
  out.obstacle.multiplyScalar(Math.sqrt(blocks));
  out.light.multiplyScalar(Math.sqrt(blocks)); // props stay readable at night too
}

/** Inside the ship: own sky/fog and steady lighting regardless of time of day. */
function applyInterior(base: LivePalette, out: LivePalette, k: number): void {
  if (k <= 0) return;
  out.sky.lerp(INTERIOR_SKY, k);
  out.fog.lerp(INTERIOR_FOG, k);
  out.cubeLight.lerp(lit.copy(base.cubeLight).multiplyScalar(INTERIOR_LIGHT), k);
  out.cubeMid.lerp(lit.copy(base.cubeMid).multiplyScalar(INTERIOR_LIGHT), k);
  out.cubeDark.lerp(lit.copy(base.cubeDark).multiplyScalar(INTERIOR_LIGHT), k);
  out.ground.lerp(INTERIOR_FOG, k);
}

function flipForeground(out: LivePalette): void {
  // UI text sits on the sky; the ship sits on the ground.
  out.text.lerp(NIGHT_TEXT, darkness(out.sky, A.flipFrom, A.flipTo));
  const shipFlip = darkness(out.ground, A.shipFlipFrom, A.shipFlipTo);
  out.ship.lerp(NIGHT_SHIP, shipFlip);
  out.shipShade.lerp(NIGHT_SHIP, shipFlip * 0.6);
}
