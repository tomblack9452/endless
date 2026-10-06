import { CONFIG } from './config';
import type { LookItem, Slot } from './looks';

// Season looks, made by code from the season number: no drawing and no app
// update for a new season, and the same looks for everyone (and the server).
//
// Each season has a theme (a name and a base hue that steps round the colour
// wheel by the golden angle, so neighbouring seasons never look alike) and a
// palette from a colour harmony the season picks. From it:
//   premium track  a paint (tier 10), an engine colour (15), a wing decal (20),
//                  a two-tone paint (30)
//   free track     a paint (tier 25)
//   shop           two paints and two engine colours for credits, 2,000 to
//                  20,000, which the daily shop features during the season
// Season 1's pass was hand-made, so it only gets the shop looks.
//
// Ids name the season ("paint:s4-p1"), so a look stays in the catalogue for good
// once its season has come. Colours keep clear of the hand-made paints (a colour
// difference check), and CONFIG.seasons.overrides can rename, recolour or veto
// any of them.

type Kind = 'p1' | 'p2' | 'e1' | 'd1' | 'f1' | 'c1' | 'c2' | 'c3' | 'c4';

const SLOT_OF: Record<Kind, Slot> = { p1: 'paint', p2: 'paint', e1: 'engine', d1: 'decal', f1: 'paint', c1: 'paint', c2: 'paint', c3: 'engine', c4: 'engine' };
const SHOP_KINDS: Kind[] = ['c1', 'c2', 'c3', 'c4'];

const ADJ = ['solar', 'glacier', 'velvet', 'static', 'hollow', 'silent', 'lunar', 'storm', 'tidal', 'violet', 'wild', 'echo', 'faded', 'polar', 'quiet', 'distant', 'bright', 'deep', 'rising', 'sunken', 'stray', 'woven', 'burnt', 'pale', 'electric', 'sleeping', 'restless', 'broken', 'gilded', 'hidden'];
const NOUN = ['drift', 'signal', 'orbit', 'tide', 'vector', 'current', 'horizon', 'harbour', 'relay', 'cinder', 'flare', 'wake', 'shard', 'reef', 'spire', 'halo', 'ridge', 'bloom', 'haze', 'wave', 'field', 'gate', 'arc', 'beacon', 'canyon', 'delta', 'ember', 'meridian', 'zenith', 'lantern'];

/** Small seeded generator (mulberry32): the same season always gives the same numbers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- colour --------------------------------------------------------------------------------------

function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round(Math.max(0, Math.min(1, v + m)) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** CIE Lab of a hex colour (D65), for comparing colours as eyes do. */
export function lab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

export function colourDistance(a: string, b: string): number {
  const p = lab(a);
  const q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** How far apart (Lab distance) a season colour stays from every hand-made one. */
export const MIN_DISTANCE = 12;

// --- the decal --------------------------------------------------------------------------------------

const OUTER = [
  '<circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" stroke-width="2"/>',
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2.4l8.2 3v6.3c0 4.9-3.4 8.4-8.2 10-4.8-1.6-8.2-5.1-8.2-10V5.4z"/>',
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2l10 10-10 10L2 12z"/>',
  '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z"/>',
];
const MARK = [
  '<path fill="currentColor" d="M12 6.2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L12 15.5l-3.7 2 .8-4.1-3.1-2.9 4.2-.5z"/>',
  '<path fill="currentColor" d="M6.5 10.5L12 15l5.5-4.5V13L12 17.5 6.5 13zM6.5 6.5L12 11l5.5-4.5V9L12 13.5 6.5 9z"/>',
  '<path fill="currentColor" d="M13.2 5.5l-5.2 7h3.4l-1 6 5.6-7.5h-3.6z"/>',
  '<circle cx="12" cy="12" r="3.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  '<path fill="currentColor" d="M12 9.5l1.2 2.5-1.2 4-1.2-4zM5.5 9.5c2.5 0 4.5.8 5.6 2.6l-.5 1.4c-1.6-1.2-3.4-1.9-5.1-2zM18.5 9.5c-2.5 0-4.5.8-5.6 2.6l.5 1.4c1.6-1.2 3.4-1.9 5.1-2z"/>',
  '<path fill="currentColor" d="M10.8 6.5h2.4v4.3h4.3v2.4h-4.3v4.3h-2.4v-4.3H6.5v-2.4h4.3z"/>',
];
const PIPS = ['', '<circle cx="7" cy="17" r="1.1" fill="currentColor"/><circle cx="17" cy="17" r="1.1" fill="currentColor"/>', '<circle cx="12" cy="4.8" r="1.1" fill="currentColor"/>'];

/** The season's wing decal: an outline, a mark and maybe pips, as 24 x 24 SVG like the hand-made ones. */
export function seasonDecalSvg(season: number): string {
  const r = rng(season * 7919 + 17);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${pick(OUTER)}${pick(MARK)}${pick(PIPS)}</svg>`;
}

/** The season of a generated look's id ("s4-p1" is season 4), or null for a hand-made one. */
export function seasonOf(id: string): number | null {
  const m = /^s(\d+)-[a-z]\d$/.exec(id);
  return m ? Number(m[1]) : null;
}

/** Decal art for a generated decal id, or null. */
export function seasonDecal(id: string): string | null {
  const n = seasonOf(id);
  return n !== null && id.endsWith('-d1') ? seasonDecalSvg(n) : null;
}

// --- the season ------------------------------------------------------------------------------------

export interface SeasonTheme {
  season: number;
  name: string;
  hue: number;
  harmony: 'analogous' | 'split' | 'triad';
}

export function seasonTheme(season: number): SeasonTheme {
  const r = rng(season * 104729 + 3);
  const harmony = (['analogous', 'split', 'triad'] as const)[Math.floor(r() * 3)];
  return { season, name: `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[Math.floor(r() * NOUN.length)]}`, hue: (season * 137.508 + 40) % 360, harmony };
}

function harmonyHues(t: SeasonTheme): [number, number, number] {
  const h = t.hue;
  if (t.harmony === 'analogous') return [h, h + 32, h - 32];
  if (t.harmony === 'split') return [h, h + 150, h + 210];
  return [h, h + 120, h + 240];
}

type SeasonOverride = { name?: string; colors?: [string, string]; veto?: boolean };

/**
 * One season's looks. `base` is the hand-made catalogue (colours keep clear of
 * it; names don't repeat it); `taken` collects names used so far, so seasons
 * don't repeat each other either.
 */
export function seasonLooks(season: number, base: readonly LookItem[], taken = new Set(base.map((l) => `${l.slot}:${l.name}`))): LookItem[] {
  if (season < 1) return [];
  const t = seasonTheme(season);
  const r = rng(season * 15485863 + 11);
  const [h0, h1, h2] = harmonyHues(t);
  const baseColours = (slot: Slot) => base.filter((l) => l.slot === slot && l.colors).map((l) => l.colors![0]);
  const made: string[] = [];
  const clear = (slot: Slot, colour: string) => [...baseColours(slot), ...made].every((c) => colourDistance(c, colour) >= MIN_DISTANCE);
  // A colour, nudged round the wheel until it stands apart from the rest.
  const colour = (slot: Slot, hue: number, s: number, l: number): string => {
    let c = hsl(hue, s, l);
    for (let i = 1; i <= 24 && !clear(slot, c); i++) c = hsl(hue + i * 13, s, l + (i % 2 ? 0.04 : -0.04));
    made.push(c);
    return c;
  };
  const name = (slot: Slot, first: string): string => {
    let n = first;
    for (let i = 0; taken.has(`${slot}:${n}`); i++) n = `${ADJ[(season + i) % ADJ.length]} ${NOUN[(season * 3 + i) % NOUN.length]}`;
    taken.add(`${slot}:${n}`);
    return n;
  };
  const [adj, noun] = t.name.split(' ');
  const word = () => NOUN[Math.floor(r() * NOUN.length)];
  const sat = () => 0.38 + r() * 0.26; // paints stay a little muted, like the hand-made ones
  const light = () => 0.45 + r() * 0.15;

  const paint = (kind: Kind, label: string, hue: number, shadeHue: number): LookItem => {
    const s = sat();
    const l = light();
    const top = colour('paint', hue, s, l);
    // The shade sits clearly darker than the top, whatever its hue.
    let dark = l - 0.2;
    let shade = hsl(shadeHue, s, dark);
    while (lab(shade)[0] > lab(top)[0] - 12 && dark > 0.08) shade = hsl(shadeHue, s, (dark -= 0.04));
    return { slot: 'paint', id: `s${season}-${kind}`, name: name('paint', label), unlock: { by: 'reward', from: 'pass' }, colors: [top, shade] };
  };
  const engine = (kind: Kind, label: string, hue: number, tipHue: number): LookItem => ({
    slot: 'engine',
    id: `s${season}-${kind}`,
    name: name('engine', label),
    unlock: { by: 'reward', from: 'pass' },
    colors: [colour('engine', hue, 0.85, 0.58), hsl(tipHue, 0.9, 0.7)],
  });
  const priced = (item: LookItem, low: number, high: number): LookItem => ({ ...item, unlock: { by: 'credits', cost: Math.round((low + r() * (high - low)) / 500) * 500 } });

  const out: LookItem[] = [];
  if (season >= 2) {
    out.push(paint('p1', t.name, h0, h0 + 8));
    out.push(engine('e1', `${noun} flame`, h1, h0));
    out.push({ slot: 'decal', id: `s${season}-d1`, name: name('decal', `${noun} crest`), unlock: { by: 'reward', from: 'pass' } });
    out.push(paint('p2', `${adj} ${word()}`, h0, h2));
    out.push(paint('f1', `${ADJ[(season * 5) % ADJ.length]} ${noun}`, h2, h2 + 8));
  }
  out.push(priced(paint('c1', `${adj} ${word()}`, h1, h1 + 8), 2000, 5000));
  out.push(priced(paint('c2', `${word()} ${noun === 'haze' ? 'mist' : 'haze'}`, h2 + 18, h1), 6000, 10000));
  out.push(priced(engine('c3', `${word()} burner`, h2, h1), 8000, 12000));
  out.push(priced(engine('c4', `${adj} burner`, h0 + 180, h0), 14000, 20000));

  const overrides = CONFIG.seasons.overrides as Record<string, SeasonOverride>;
  return out
    .filter((l) => !overrides[`${l.slot}:${l.id}`]?.veto)
    .map((l) => {
      const o = overrides[`${l.slot}:${l.id}`];
      return o ? { ...l, name: o.name ?? l.name, colors: o.colors ?? l.colors } : l;
    });
}

/** Every season's looks from 1 to `through`, in order. */
export function seasonLooksThrough(through: number, base: readonly LookItem[]): LookItem[] {
  const taken = new Set(base.map((l) => `${l.slot}:${l.name}`));
  const out: LookItem[] = [];
  for (let s = 1; s <= through; s++) out.push(...seasonLooks(s, base, taken));
  return out;
}

/** The pass's look keys for a season (null where it's vetoed), by tier. */
export function seasonPassKeys(season: number): { p1: string; e1: string; d1: string; p2: string; f1: string } {
  const key = (k: Kind) => `${SLOT_OF[k]}:s${season}-${k}`;
  return { p1: key('p1'), e1: key('e1'), d1: key('d1'), p2: key('p2'), f1: key('f1') };
}

/** True for a generated look sold in the shop during its season. */
export function isSeasonShopLook(item: LookItem, season: number): boolean {
  const n = seasonOf(item.id);
  return n === season && SHOP_KINDS.some((k) => item.id.endsWith(`-${k}`));
}

