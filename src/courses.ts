import type { Biome } from './biomes';
import type { EventKind } from './events';
import type { RoomId } from './interior';
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

export type Overlay = 'slalom' | 'gates' | 'pickups' | 'arches';

export interface Section {
  name: string; // shown as you reach it
  theme: ThemeId;
  biome?: Biome;
  length: number; // world units
  sub: 0 | 1 | 2;
  difficulty: number;
  rooms?: RoomId[]; // interior: these rooms, in order, with corridors between
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
const ship = (name: string, rooms: RoomId[], length: number, difficulty: number, extra: Partial<Section> = {}): Section => ({
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
      ship('maintenance deck', ['cargo', 'servers', 'lasers', 'coolant', 'hydroponics', 'hangar'], 4700, 7500),
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
      ship('red alert', ['vents', 'gantry', 'pistons', 'foundry', 'breach', 'chicane', 'vents'], 4900, 9500, { event: 'redAlert' }),
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
      ship('core breach', ['lasers', 'vents', 'gantry', 'foundry', 'pistons', 'collapse', 'hangar'], 4600, 12000, { event: 'redAlert' }),
    ],
  },
];

/** Total length of a course in world units. */
export function courseLength(c: Course): number {
  return c.sections.reduce((n, s) => n + s.length, 0);
}

export function findCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
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
}

export const ENVIRONMENTS: readonly Environment[] = [
  { id: 'open-ground', name: 'open ground', theme: 'land', biome: 'alien' },
  { id: 'canyon', name: 'canyon', theme: 'canyon', biome: 'canyon' },
  { id: 'ship', name: 'ship interior', theme: 'interior', biome: 'interior' },
  { id: 'ice', name: 'ice field', theme: 'land', biome: 'ice' },
  { id: 'asteroids', name: 'asteroid belt', theme: 'canyon', biome: 'asteroids' },
  { id: 'volcanic', name: 'volcanic plain', theme: 'land', biome: 'volcanic' },
];

type Template = Omit<Section, 'length' | 'difficulty' | 'theme' | 'biome'>;

const LAND_SECTIONS: Template[] = [
  { name: 'the plains', sub: 0 },
  { name: 'arch run', sub: 0, overlay: 'arches' },
  { name: 'pickup trail', sub: 0, overlay: 'pickups' },
  { name: 'spire slalom', sub: 1, overlay: 'slalom' },
  { name: 'stone gates', sub: 1, overlay: 'gates' },
  { name: 'the rockfields', sub: 1 },
  { name: 'meteor field', sub: 1, event: 'meteors' },
  { name: 'the forest path', sub: 2 },
];

const CANYON_SECTIONS: Template[] = [
  { name: 'the gorge', sub: 0 },
  { name: 'rockfall', sub: 1 },
  { name: 'stone gates', sub: 1, overlay: 'gates' },
  { name: 'the narrows', sub: 2 },
  { name: 'pillar run', sub: 2, overlay: 'slalom' },
];

const SHIP_ROOMS: RoomId[] = [
  'cargo',
  'servers',
  'lasers',
  'coolant',
  'hydroponics',
  'vents',
  'gantry',
  'pistons',
  'foundry',
  'breach',
  'chicane',
  'reactor',
  'hangar',
  'junction',
  'fork',
  'islands',
];

const WEEK_MS = 7 * 24 * 3600 * 1000;

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded random source, separate from the world's. */
function seeded(n: number): () => number {
  let s = n >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The weekly ranked level for the week starting `monday` ("2026-10-05"). */
export function weeklyCourse(monday: string): Course {
  const [y, m, d] = monday.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const week = Math.floor(start.getTime() / WEEK_MS);
  const seed = hash(`endless-week-${monday}`);
  const rnd = seeded(seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)];
  const first = ((week % ENVIRONMENTS.length) + ENVIRONMENTS.length) % ENVIRONMENTS.length;
  // Three areas: this week's environment, then the next two in the cycle.
  const areas = [0, 1, 2].map((k) => ENVIRONMENTS[(first + k) % ENVIRONMENTS.length]);
  const lengths = [2600, 2200, 1900];
  const sections: Section[] = [];
  let difficulty = 4000;
  const step = 5000 / 5; // ramps from 4,000 to about 9,000 across the level
  areas.forEach((env, a) => {
    if (env.theme === 'interior') {
      // A run of ship rooms, in a fixed order for the week.
      const rooms: RoomId[] = [];
      while (rooms.length < 5) {
        const r = pick(SHIP_ROOMS);
        if (rooms[rooms.length - 1] !== r) rooms.push(r);
      }
      sections.push({ name: 'the ship', theme: 'interior', biome: 'interior', rooms, length: lengths[a], sub: 1, difficulty, event: rnd() < 0.35 ? 'redAlert' : undefined });
      difficulty += step * 2;
      return;
    }
    const library = env.theme === 'land' ? LAND_SECTIONS : CANYON_SECTIONS;
    // Two sections per area, the second a little harder.
    const one = pick(library);
    let two = pick(library);
    while (two.name === one.name) two = pick(library);
    for (const [k, t] of [one, two].entries()) {
      const event = env.biome === 'asteroids' && t.event === undefined && rnd() < 0.25 ? 'meteors' : t.event;
      sections.push({ ...t, name: k === 0 && a > 0 ? `${env.name}: ${t.name}` : t.name, theme: env.theme, biome: env.biome, length: Math.round(lengths[a] / 2), difficulty, event });
      difficulty += step;
    }
  });
  const length = sections.reduce((n, s) => n + s.length, 0);
  const label = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase();
  return {
    id: `week-${monday}`,
    name: `week of ${label}`,
    blurb: `starts in the ${areas[0].name}, then the ${areas[1].name} and the ${areas[2].name}`,
    seed,
    target: Math.round((length * 1.6) / 100) * 100,
    sections,
  };
}
