import type { Biome } from './biomes';
import { CONFIG } from '../core/config';
import type { EventKind } from './events';
import type { ThemeId } from './world';

// Set levels ("courses"): hand-built runs with a finish line. Each is a script
// of sections; the generator follows it instead of the endless plan, with a
// fixed seed for the in-between detail, so a course is the same every time
// you play it and can be learned.
//
// A section sets the area (theme and biome), how the generator behaves there
// (`sub`: the flavour a theme has at its first, second or third level), how
// hard it is (`difficulty`: the score whose speed and density it uses), and
// optionally a set piece laid over it, a run of rooms, or an event.

type Overlay = 'slalom' | 'gates' | 'pickups' | 'arches';

export interface Section {
  name: string; // shown as you reach it
  theme: ThemeId;
  biome?: Biome;
  length: number; // world units
  sub: 0 | 1 | 2;
  difficulty: number;
  rooms?: string[]; // interior: these rooms (piece ids, or room families), in order, with corridors between
  overlay?: Overlay;
  event?: EventKind;
}

export interface Course {
  id: string;
  name: string;
  blurb: string;
  seed: number;
  target: number; // score for the third star
  sections: Section[];
}

const land = (name: string, length: number, sub: 0 | 1 | 2, difficulty: number, extra: Partial<Section> = {}): Section => ({
  name,
  theme: 'land',
  length,
  sub,
  difficulty,
  ...extra,
});
const canyon = (name: string, length: number, sub: 0 | 1 | 2, difficulty: number, extra: Partial<Section> = {}): Section => ({
  name,
  theme: 'canyon',
  length,
  sub,
  difficulty,
  ...extra,
});
const ship = (name: string, rooms: string[], length: number, difficulty: number, extra: Partial<Section> = {}): Section => ({
  name,
  theme: 'interior',
  rooms,
  length,
  sub: 1,
  difficulty,
  ...extra,
});

export const COURSES: readonly Course[] = [
  // --- open ground ---------------------------------------------------------------
  {
    id: 'first-light',
    name: 'first light',
    blurb: 'a gentle run across the plains, under the arches and into the forest',
    seed: 1101,
    target: 7000,
    sections: [
      land('the plains', 1200, 0, 0),
      land('arch run', 900, 0, 800, { overlay: 'arches' }),
      land('pickup trail', 700, 0, 1400, { overlay: 'pickups' }),
      land('the forest path', 1600, 2, 2000),
    ],
  },
  {
    id: 'stone-garden',
    name: 'stone garden',
    blurb: 'rock spires to weave through, then gates of stone across the hills',
    seed: 2202,
    target: 8500,
    sections: [
      land('the meadow', 900, 0, 1500),
      land('spire slalom', 1500, 1, 2500, { overlay: 'slalom' }),
      land('stone gates', 1500, 1, 3500, { overlay: 'gates' }),
      land('the rockfields', 1400, 1, 4500, { event: 'meteors' }),
    ],
  },
  {
    id: 'frost-and-fire',
    name: 'frost and fire',
    blurb: 'across the ice, through a frozen forest, onto the burning plain',
    seed: 3303,
    target: 9600,
    sections: [
      land('ice field', 1500, 0, 3500, { biome: 'ice' }),
      land('frozen forest', 1700, 2, 4500, { biome: 'ice' }),
      land('the burning plain', 1600, 1, 6000, { biome: 'volcanic', overlay: 'gates' }),
      land('meteor storm', 1200, 1, 7000, { biome: 'volcanic', event: 'meteors' }),
    ],
  },
  // --- canyons -------------------------------------------------------------------
  {
    id: 'dry-river',
    name: 'dry river',
    blurb: 'follow the old river bed down into the canyon',
    seed: 4404,
    target: 9000,
    sections: [
      land('the riverbank', 700, 0, 3000),
      canyon('the gorge', 1800, 0, 4000),
      canyon('rockfall', 1600, 1, 5000),
      canyon('the narrows', 1500, 2, 6000),
    ],
  },
  {
    id: 'twin-gorge',
    name: 'twin gorge',
    blurb: 'the canyon splits and splits again: pick your side',
    seed: 5505,
    target: 11200,
    sections: [
      canyon('the fork', 2200, 1, 6000),
      canyon('sandstorm', 1600, 1, 7000, { event: 'sandstorm' }),
      canyon('pillar run', 1800, 2, 8000, { overlay: 'slalom' }),
      canyon('the last split', 1400, 1, 9000),
    ],
  },
  {
    id: 'asteroid-run',
    name: 'asteroid run',
    blurb: 'out into the asteroid belt, through the rockfalls and the pillars',
    seed: 6606,
    target: 11400,
    sections: [
      canyon('the belt', 2000, 0, 8000, { biome: 'asteroids' }),
      canyon('debris field', 1900, 1, 9500, { biome: 'asteroids' }),
      canyon('meteor shower', 1500, 1, 10500, { biome: 'asteroids', event: 'meteors' }),
      canyon('the gauntlet', 1700, 2, 11500, { biome: 'asteroids', overlay: 'slalom' }),
    ],
  },
  // --- the ship ----------------------------------------------------------------------
  {
    id: 'maintenance-deck',
    name: 'maintenance deck',
    blurb: 'a tour below decks: cargo, servers, laser gates and the coolant plant',
    seed: 7707,
    target: 8500,
    sections: [
      land('the landing pad', 600, 0, 6000),
      ship('maintenance deck', ['cargo-1', 'servers-1', 'lasers-1', 'coolant-1', 'hydroponics-1', 'hangar-2'], 4700, 7500),
    ],
  },
  {
    id: 'red-alert',
    name: 'red alert',
    blurb: 'power failure: steam vents, broken floors and the foundry',
    seed: 8808,
    target: 8800,
    sections: [
      land('the approach', 600, 0, 8000),
      ship('red alert', ['vents-1', 'gantry-1', 'engine-1', 'foundry-1', 'breach-1', 'chicane-1', 'flooded-1'], 4900, 9500, { event: 'redAlert' }),
    ],
  },
  {
    id: 'core-breach',
    name: 'core breach',
    blurb: 'across the burning plain, down the gorge, into the ship and out through the hangar',
    seed: 9909,
    target: 12600,
    sections: [
      land('the burning plain', 1500, 1, 9000, { biome: 'volcanic' }),
      canyon('the gorge', 1800, 1, 10500),
      ship('core breach', ['lasers-2', 'reactor-2', 'dropshaft-1', 'engine-2', 'reactor-1', 'collapse-1', 'hangar-1'], 4600, 12000, { event: 'redAlert' }),
    ],
  },
];

/** Total length of a course in world units. */
export function courseLength(c: Course): number {
  return c.sections.reduce((n, s) => n + s.length, 0);
}

// --- the weekly ranked level ---------------------------------------------------------
// One hand-built-style level a week, the same for everyone, new every Monday.
// It's assembled from the section library below, seeded by the week, starting
// in a different environment each week and running on through the next two.

/** The environments a run can be set in (solo picks one; the weekly level starts in one). */
export interface Environment {
  id: string;
  name: string;
  theme: ThemeId;
  biome: Biome;
  /**
   * The sector (a theme's three levels, in the endless order) that opens it in
   * solo. Reaching that sector in ranked or endless unlocks the environment; see unlocks.ts.
   */
  sector: number;
}

export const ENVIRONMENTS: readonly Environment[] = [
  { id: 'open-ground', name: 'open ground', theme: 'land', biome: 'alien', sector: 0 },
  { id: 'canyon', name: 'canyon', theme: 'canyon', biome: 'canyon', sector: 1 },
  { id: 'ship', name: 'ship interior', theme: 'interior', biome: 'interior', sector: 2 },
  { id: 'ice', name: 'ice field', theme: 'land', biome: 'ice', sector: 3 },
  { id: 'asteroids', name: 'asteroid belt', theme: 'canyon', biome: 'asteroids', sector: 4 },
  { id: 'volcanic', name: 'volcanic plain', theme: 'land', biome: 'volcanic', sector: 6 },
];

/**
 * This week's ranked run: endless from the start on the week's own seed, so
 * it's the same course for everyone all week, and new every Monday (UTC).
 * `target` is the score the rank and league pars are measured against.
 */
export interface WeeklyRun {
  id: string; // "ranked-2026-10-05"
  name: string; // "week of 5 oct"
  seed: number;
  target: number;
}

export function weeklyRun(monday: string): WeeklyRun {
  let h = 0x811c9dc5;
  for (const ch of `endless-week-${monday}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  const label = new Date(`${monday}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
  return { id: `ranked-${monday}`, name: `week of ${label}`, seed: h >>> 0, target: CONFIG.score.rankedTarget };
}

// --- the daily challenge -------------------------------------------------------------
// One short course a day with a finish line, the same for everyone: built like
// the weekly run, from a seed that belongs to the day (the server's UTC day),
// but laid out as a set level, so it ends. Three or four sections from the
// areas below, getting harder towards the line, CONFIG.daily.length long.

/** An area a daily course can visit: its section names by flavour, the set pieces and event that suit it. */
interface DailyArea {
  theme: ThemeId;
  biome?: Biome;
  names: [string, string, string];
  overlays: Overlay[];
  event: EventKind;
}

const DAILY_AREAS: readonly DailyArea[] = [
  { theme: 'land', names: ['the plains', 'the rockfields', 'the forest path'], overlays: ['arches', 'slalom', 'gates', 'pickups'], event: 'meteors' },
  { theme: 'land', biome: 'ice', names: ['ice field', 'the drifts', 'frozen forest'], overlays: ['pickups'], event: 'meteors' },
  { theme: 'land', biome: 'volcanic', names: ['the burning plain', 'ash fields', 'the lava run'], overlays: ['gates', 'pickups'], event: 'meteors' },
  { theme: 'canyon', names: ['the gorge', 'rockfall', 'the narrows'], overlays: ['slalom', 'pickups'], event: 'sandstorm' },
  { theme: 'canyon', biome: 'asteroids', names: ['the belt', 'debris field', 'the gauntlet'], overlays: ['slalom', 'pickups'], event: 'meteors' },
];

/** Today's challenge: its course and what it's called. */
export interface DailyRun {
  id: string; // "daily-2026-10-15"
  day: string; // "2026-10-15"
  name: string; // "15 oct"
  course: Course;
}

/** A seed from some text (FNV-1a, as the weekly run's). */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The day's own picks (mulberry32), apart from the course generator's rand() so laying it out can't shift the course. */
function dayPicker(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The daily challenge for `day` (a UTC date, "2026-10-15"): the same course for everyone that day. */
export function dailyRun(day: string): DailyRun {
  const seed = seedOf(`endless-day-${day}`);
  const pick = dayPicker(seed);
  const one = <T>(list: readonly T[]): T => list[Math.floor(pick() * list.length)];
  const D = CONFIG.daily;
  const outdoor = (a: DailyArea, sub: 0 | 1 | 2, length: number): Section => ({
    name: a.names[sub],
    theme: a.theme,
    ...(a.biome ? { biome: a.biome } : {}),
    length,
    sub,
    difficulty: 0,
  });
  const start = one(DAILY_AREAS);
  // The shape of the day: one area all the way, open ground into another
  // biome or the canyon, or out there and into the ship to finish.
  const shape = one(['one', 'onwards', 'ship'] as const);
  let sections: Section[];
  if (shape === 'one') {
    sections = [outdoor(start, 0, 1200), outdoor(start, 1, 1200), outdoor(start, 2, 1200)];
  } else if (shape === 'onwards') {
    // From open ground the way leads anywhere; from the canyon or the belt, on through it.
    const next = start.theme === 'land' ? one(DAILY_AREAS.filter((a) => a !== start)) : start;
    sections = [outdoor(start, 0, 1200), outdoor(start, 1, 1100), outdoor(next, next === start ? 2 : 1, 1300)];
  } else {
    sections = [outdoor(start, 0, 1300), outdoor(start, 1, 1100), { name: 'into the ship', theme: 'interior', rooms: [], length: 1200, sub: 1, difficulty: 0 }];
  }
  // Harder towards the line, in steps of 100.
  sections.forEach((s, i) => (s.difficulty = Math.round((D.difficulty[0] + ((D.difficulty[1] - D.difficulty[0]) * i) / (sections.length - 1)) / 100) * 100));
  // A set piece in the middle now and then, and the area's event near the end.
  const middle = sections[1];
  const area = DAILY_AREAS.find((a) => a.theme === middle.theme && a.biome === middle.biome) ?? start;
  if (pick() < 0.7) middle.overlay = one(area.overlays);
  const last = sections[sections.length - 1];
  if (pick() < 0.4)
    last.event = last.theme === 'interior' ? 'redAlert' : (DAILY_AREAS.find((a) => a.theme === last.theme && a.biome === last.biome) ?? start).event;
  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).toLowerCase();
  return { id: `daily-${day}`, day, name: label, course: { id: `daily-${day}`, name: `daily · ${label}`, blurb: '', seed, target: 0, sections } };
}
