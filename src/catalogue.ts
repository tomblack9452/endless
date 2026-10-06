import type { LookItem, Slot, Unlock } from './looks';
import { seasonAt } from './season';
import { seasonLooksThrough } from './seasonLooks';

// Every look in the game, and how to get each. Purely cosmetic (every hull
// shares one hitbox), so all of it is allowed in ranked.
//
// Ways to get one:
//   free        you start with it
//   credits     bought with credits (earned in play)
//   cores       bought with cores (the premium currency)
//   rank        reaching a rank
//   league      reaching a league
//   stars       earning set level stars
//   achievement finishing a goal (src/achievements.ts)
//   reward      the login calendar or the season pass
//   vault       sold for a month at a time in the shop, then away for a while
//
// On top of these hand-made looks, every season adds generated ones (seasonLooks.ts).

const free: Unlock = { by: 'free' };
const credits = (cost: number): Unlock => ({ by: 'credits', cost });
const cores = (cost: number): Unlock => ({ by: 'cores', cost });
const rank = (r: number): Unlock => ({ by: 'rank', rank: r });
const stars = (n: number): Unlock => ({ by: 'stars', stars: n });
const league = (l: number): Unlock => ({ by: 'league', league: l });
const goal = (id: string): Unlock => ({ by: 'achievement', id });
const pass: Unlock = { by: 'reward', from: 'pass' };
const login: Unlock = { by: 'reward', from: 'login' };
const vault = (cost: number): Unlock => ({ by: 'vault', cost });

const hull = (id: string, name: string, unlock: Unlock): LookItem => ({ slot: 'hull', id, name, unlock });
const paint = (id: string, name: string, unlock: Unlock, top: string, shade: string): LookItem => ({ slot: 'paint', id, name, unlock, colors: [top, shade] });
const mark = (id: string, name: string, unlock: Unlock): LookItem => ({ slot: 'markings', id, name, unlock });
const fin = (id: string, name: string, unlock: Unlock): LookItem => ({ slot: 'fins', id, name, unlock });
const engine = (id: string, name: string, unlock: Unlock, a: string, b = a): LookItem => ({ slot: 'engine', id, name, unlock, colors: [a, b] });
const decal = (id: string, name: string, unlock: Unlock): LookItem => ({ slot: 'decal', id, name, unlock });
const trail = (id: string, name: string, unlock: Unlock): LookItem => ({ slot: 'trail', id, name, unlock });

const HAND_MADE: readonly LookItem[] = [
  // --- hulls ----------------------------------------------------------------------------------
  hull('dart', 'dart', free),
  hull('wing', 'wing', goal('runs-5')),
  hull('needle', 'needle', goal('near-25')),
  hull('manta', 'manta', goal('level-4')),
  hull('arrow', 'arrow', credits(1500)),
  hull('talon', 'talon', credits(4000)),
  hull('viper', 'viper', credits(6000)),
  hull('nova', 'nova', cores(400)),
  hull('phantom', 'phantom', cores(650)),
  hull('raptor', 'raptor', pass),
  hull('kite', 'kite', goal('level-25')),
  hull('comet', 'comet', goal('dist-500k')),

  // --- paints: credits (earned in play) ----------------------------------------------------------
  { slot: 'paint', id: 'standard', name: 'standard', unlock: free }, // the palette's own colours
  paint('slate', 'slate', credits(200), '#66707a', '#454c54'),
  paint('ash', 'ash', credits(250), '#9aa0a6', '#6b7075'),
  paint('crimson', 'crimson', credits(300), '#b8403c', '#812a28'),
  paint('cobalt', 'cobalt', credits(300), '#3f63b8', '#2a4482'),
  paint('olive', 'olive', credits(300), '#717f3e', '#4e582a'),
  paint('teal', 'teal', credits(300), '#3f9d97', '#2a6b67'),
  paint('plum', 'plum', credits(300), '#8a4f86', '#5c3359'),
  paint('brick', 'brick', credits(300), '#a5503f', '#74352a'),
  paint('amber', 'amber', credits(350), '#d79a3b', '#a06a1e'),
  paint('forest', 'forest', credits(350), '#3f7a4e', '#294f33'),
  paint('sand', 'sand', credits(400), '#cdb68d', '#9d8a64'),
  paint('navy', 'navy', credits(400), '#2c4a7d', '#1b2f52'),
  paint('coral', 'coral', credits(450), '#e07b6a', '#a8503f'),
  paint('white', 'white', credits(500), '#efefeb', '#bfc0bb'),
  paint('lavender', 'lavender', credits(500), '#b9a6e0', '#8470b0'),
  paint('lemon', 'lemon', credits(500), '#e8dc6a', '#b0a43e'),
  paint('mint', 'mint', credits(600), '#8fd3b6', '#5b9c82'),
  paint('carbon', 'carbon', credits(800), '#2e2e31', '#1a1a1c'),
  paint('rose', 'rose gold', credits(900), '#e2a99a', '#a8706a'),

  // --- paints: ranks, leagues and stars ---------------------------------------------------------
  paint('copper', 'copper', rank(10), '#c0794b', '#8a4f2d'),
  paint('jade', 'jade', rank(16), '#4fb58a', '#2f7a5c'),
  paint('indigo', 'indigo', rank(19), '#4b4fb0', '#2f3278'),
  paint('scarlet', 'scarlet', rank(22), '#d6392f', '#942018'),
  paint('gunmetal', 'gunmetal', rank(25), '#4c525b', '#30343a'),
  paint('obsidian', 'obsidian', rank(28), '#2b2a33', '#15141a'),
  paint('chrome', 'chrome', rank(31), '#dde1e6', '#9ba3ac'),
  paint('pearl', 'pearl', rank(34), '#eee9f4', '#b9b2c6'),
  // One paint for reaching each league above bronze.
  paint('silver', 'silver', league(1), '#c5cad0', '#8f959d'),
  paint('gold', 'gold', league(2), '#d9ab3d', '#a17b24'),
  paint('platinum', 'platinum', league(3), '#cfe4e5', '#90b2b5'),
  paint('diamond', 'diamond', league(4), '#aac8f1', '#6e92c5'),
  paint('champion', 'champion', league(5), '#ab8ce2', '#7458ac'),
  paint('supernova', 'supernova', league(6), '#e8684f', '#a83f30'),
  paint('dawn', 'dawn', stars(5), '#f2b27a', '#c06e4a'),
  paint('dusk', 'dusk', stars(20), '#8f6bc4', '#4f3a86'),
  paint('prism', 'prism', stars(40), '#9be0ff', '#c28cff'),

  // --- paints: cores ----------------------------------------------------------------------------
  paint('midnight', 'midnight', cores(100), '#253a6e', '#121c38'),
  paint('nebula', 'nebula', cores(120), '#7a4fb8', '#3d2a6e'),
  paint('abyss', 'abyss', cores(130), '#10304a', '#071a2a'),
  paint('glacier', 'glacier', cores(140), '#a6dcef', '#4f8fb3'),
  paint('candy', 'candy', cores(140), '#f5a1cf', '#c25a98'),
  paint('solar', 'solar', cores(150), '#f0b23a', '#c2541e'),
  paint('sunset', 'sunset', cores(160), '#f0825a', '#a53f7d'),
  paint('toxic', 'toxic', cores(170), '#b4e03a', '#5f8a1a'),
  paint('viridian', 'viridian', cores(180), '#2fbf8f', '#16705a'),
  paint('void', 'void', cores(200), '#1c1d2b', '#0b0b12'),
  paint('lava', 'lava', cores(200), '#ff6a2a', '#8f2a10'),
  paint('royal', 'royal', cores(220), '#5a3fb8', '#2c1f70'),
  paint('ghost', 'ghost', cores(250), '#e9eef2', '#a9b4be'),

  // --- paints: rewards and goals --------------------------------------------------------------------
  paint('aurora', 'aurora', login, '#5fd6a8', '#3a6fb0'),
  paint('frost', 'frost', pass, '#d8eef6', '#8fbcd4'),
  paint('ember', 'ember', pass, '#d4522f', '#5a1c14'),
  paint('ivory', 'ivory', goal('runs-1000'), '#f3ead2', '#c4b88f'),
  paint('sky', 'sky', goal('dist-5k'), '#7fb8e6', '#4f84b5'),
  paint('nightfall', 'nightfall', goal('time-20h'), '#2b2f66', '#14173a'),
  paint('neon', 'neon', goal('chain-15'), '#6bff9c', '#1fa65a'),
  paint('scrap', 'scrap', goal('crashes-500'), '#8a7a6a', '#5a4d41'),
  paint('daybreak', 'daybreak', goal('level-6'), '#ffc46b', '#d9783a'),
  paint('permafrost', 'permafrost', goal('level-10'), '#cfe9f5', '#7fa9c2'),
  paint('asteroid', 'asteroid', goal('level-13'), '#7d7b80', '#4c4a50'),
  paint('basalt', 'basalt', goal('level-19'), '#4b3f40', '#2b2223'),
  paint('meadow', 'meadow', goal('env-ground'), '#8bd06a', '#4f8f3a'),
  paint('dune', 'dune', goal('env-canyon'), '#e0c08a', '#b08a4f'),
  paint('plating', 'plating', goal('env-ship'), '#9aa6b0', '#5d6a76'),
  paint('ion', 'ion', goal('endless-5k'), '#7fe8ff', '#2f9fd0'),
  paint('sovereign', 'sovereign', goal('endless-30k'), '#d4af37', '#7a5f12'),
  paint('finish', 'finish line', goal('courses-9'), '#f2f2f2', '#2b2b2b'),
  paint('signal', 'signal', goal('stars-10'), '#6fc3e0', '#2e7aa0'),
  paint('gilt', 'gilt', goal('looks-25'), '#e0c36a', '#8f7a2f'),
  // From the vault.
  paint('eclipse', 'eclipse', vault(600), '#2a1748', '#0d0719'),
  paint('opal', 'opal', vault(500), '#e8f0f4', '#c9a6e0'),

  // --- markings -------------------------------------------------------------------------------------
  mark('none', 'none', free),
  mark('stripe', 'stripe', credits(250)),
  mark('twin', 'twin stripes', credits(400)),
  mark('split', 'split', credits(600)),
  mark('hazard', 'hazard', credits(900)),
  mark('dots', 'dots', cores(60)),
  mark('rings', 'rings', cores(80)),
  mark('chevron', 'chevron', stars(10)),
  mark('twotone', 'two-tone', stars(25)),
  mark('spine', 'spine', goal('runs-250')),
  mark('tips', 'wing tips', goal('near-1k')),
  mark('checker', 'checker', goal('chain-10')),
  mark('nose', 'nose cap', goal('upgrades-10')),

  // --- fins -----------------------------------------------------------------------------------------
  fin('none', 'none', free),
  fin('tail', 'tail fin', credits(300)),
  fin('winglets', 'winglets', credits(800)),
  fin('crest', 'crest', credits(1200)),
  fin('twin', 'twin fins', stars(15)),
  fin('blade', 'blade', goal('dist-25k')),
  fin('swept', 'swept fins', goal('stars-30')),

  // --- engine colours -------------------------------------------------------------------------------
  { slot: 'engine', id: 'standard', name: 'standard', unlock: free }, // the default flame
  engine('amber', 'amber', credits(150), '#e2a64e'),
  engine('cyan', 'cyan', credits(150), '#4fc3d9'),
  engine('violet', 'violet', credits(250), '#a07ae0'),
  engine('green', 'green', credits(250), '#6ccf7c'),
  engine('magenta', 'magenta', credits(300), '#ff4fd8'),
  engine('sky', 'sky blue', credits(300), '#7fd0ff'),
  engine('ice', 'ice', credits(350), '#bfeaff'),
  engine('white', 'white', credits(400), '#f4f4f0'),
  engine('ember', 'ember', cores(60), '#ff5a3a', '#ffb24a'),
  engine('plasma', 'plasma', cores(60), '#ff5fd2', '#7a6bff'),
  engine('nebula', 'nebula', cores(70), '#b04fff', '#ff6fd0'),
  engine('gold', 'gold', cores(80), '#ffcf4a'),
  engine('abyss', 'abyss', cores(80), '#2f6bff', '#4fffe0'),
  engine('red', 'red', rank(7), '#e0503f'),
  engine('solar', 'solar', pass, '#ffd25a', '#ff7a2e'),
  engine('orange', 'orange', goal('runs-50'), '#ff8c3a'),
  engine('lime', 'lime', goal('time-1h'), '#b4ff4f'),
  engine('blue', 'blue', goal('near-100'), '#4f7dff'),
  engine('sunrise', 'sunrise', goal('pickups-200'), '#ffd27a', '#ff9a4a'),
  engine('rose', 'rose', goal('courses-6'), '#ff9fb8'),
  engine('mint', 'mint', goal('stars-5'), '#9fffd6'),
  engine('aurora', 'aurora', goal('courses-1'), '#4fffa0', '#4f8fff'),
  engine('frostfire', 'frostfire', goal('env-ice'), '#bfeaff', '#7f8fff'),
  engine('stardust', 'stardust', goal('env-belt'), '#fff2c0', '#9fb0ff'),
  engine('magma', 'magma', goal('env-lava'), '#ff4a1f', '#ffd24a'),
  engine('prism', 'prism', vault(400), '#ff6a6a', '#6a9fff'),

  // --- wing decals ----------------------------------------------------------------------------------
  decal('none', 'none', free),
  decal('rank', 'rank insignia', free),
  decal('league', 'league emblem', free),
  decal('flame', 'flame', credits(500)),
  decal('wing', 'wings', credits(500)),
  decal('rocket', 'rocket', credits(600)),
  decal('star', 'star', goal('runs-10')),
  decal('moon', 'moon', goal('time-5h')),
  decal('target', 'target', goal('near-10k')),
  decal('crown', 'crown', goal('pickups-2k')),
  decal('skull', 'skull', goal('crashes-100')),
  decal('bolt', 'bolt', goal('courses-3')),
  decal('laurel', 'laurel', goal('endless-15k')),
  decal('atom', 'atom', goal('upgrades-30')),
  decal('planet', 'planet', goal('looks-60')),
  decal('phoenix', 'phoenix', vault(450)),

  // --- trails (engine flames) -----------------------------------------------------------------------
  trail('none', 'glow only', free),
  trail('line', 'line', goal('pickups-50')),
  trail('dashes', 'dashes', goal('chain-3')),
  trail('ion', 'ion', goal('time-15m')),
  trail('triple', 'triple', credits(800)),
  trail('wide', 'wide', cores(100)),
  trail('long', 'long', goal('dist-100k')),
  trail('twin', 'twin', goal('chain-6')),
  trail('pulse', 'pulse', goal('endless-60k')),
  trail('ribbon', 'ribbon', vault(500)),
];

/** Every look: the hand-made ones, then each season's generated ones up to the current season. */
export const LOOKS: readonly LookItem[] = [...HAND_MADE, ...seasonLooksThrough(seasonAt(Date.now()).season, HAND_MADE)];

/** Looks by slot, in the order the hangar shows them. */
export const SLOT_ORDER: Slot[] = ['hull', 'paint', 'markings', 'fins', 'engine', 'decal', 'trail'];

// --- sets ---------------------------------------------------------------------------------------------
// A themed set of looks that can all be bought. One is featured in the shop each
// week, as a bundle at a discount; finishing a set (owning all of it) pays a bonus.

export interface LookSet {
  id: string;
  name: string;
  items: string[]; // "slot:id"
  bonusCores: number; // paid once, when you own the whole set
}

export const SETS: readonly LookSet[] = [
  { id: 'forge', name: 'ember forge', items: ['paint:lava', 'engine:ember', 'markings:hazard', 'decal:flame', 'trail:wide'], bonusCores: 40 },
  { id: 'deep', name: 'deep sea', items: ['paint:abyss', 'engine:abyss', 'markings:rings', 'decal:wing', 'fins:crest'], bonusCores: 40 },
  { id: 'neon', name: 'neon night', items: ['paint:candy', 'engine:magenta', 'markings:dots', 'decal:rocket', 'trail:triple'], bonusCores: 40 },
  { id: 'royal', name: 'royal guard', items: ['paint:royal', 'engine:gold', 'markings:split', 'fins:winglets'], bonusCores: 30 },
  { id: 'toxic', name: 'toxic waste', items: ['paint:toxic', 'engine:green', 'markings:twin', 'fins:tail'], bonusCores: 30 },
  { id: 'sunset', name: 'sunset strip', items: ['paint:sunset', 'engine:amber', 'markings:stripe', 'decal:flame'], bonusCores: 30 },
];

/** The vault: looks sold one at a time for a month, then away until their turn comes round again. */
export const VAULT_ORDER: string[] = ['paint:eclipse', 'engine:prism', 'decal:phoenix', 'paint:opal', 'trail:ribbon'];
