// New players see the game a little at a time, so the first screen isn't a
// wall of buttons. Everything is open for anyone who has played a while.
//
//   from the start      endless, the hangar, goals
//   after 5 runs        solo, the shop, the service record
//   after the tutorial  ranked, leagues and the leaderboard
//   and 5 runs
//
// Only runs that score at least CONFIG.reveal.validScore count (valid runs),
// so a few quick crashes don't open everything.
//
// Each stage opening is announced once.

import { CONFIG } from './config';

export type Feature = 'solo' | 'shop' | 'record' | 'ranked' | 'leaderboard';

export const STAGES: { runs: number; tutorial: boolean; features: Feature[]; name: string; plural: boolean; text: string }[] = [
  { runs: 5, tutorial: false, features: ['solo', 'shop', 'record'], name: 'solo, the shop and your service record', plural: true, text: 'solo, the shop and your service record are open' },
  { runs: 5, tutorial: true, features: ['ranked', 'leaderboard'], name: 'ranked', plural: false, text: "ranked is open: the week's run, leagues and the leaderboard" },
];

/** How many stages are open for a player with `runs` valid runs. */
export function stageFor(runs: number, tutorialDone: boolean): number {
  let n = 0;
  for (const s of STAGES) if (runs >= s.runs && (!s.tutorial || tutorialDone)) n++;
  return n;
}

export function isOpen(f: Feature, stage: number): boolean {
  return STAGES.slice(0, stage).some((s) => s.features.includes(f));
}

/** What the next stage needs, in words (for the line under the menu), or '' when everything is open. */
export function nextStageText(runs: number, tutorialDone: boolean): string {
  const s = STAGES[stageFor(runs, tutorialDone)];
  if (!s) return '';
  const left = Math.max(0, s.runs - runs);
  const verb = s.plural ? 'open' : 'opens';
  if (left > 0) return `${s.name} ${verb} after ${left} more run${left === 1 ? '' : 's'} of ${CONFIG.reveal.validScore.toLocaleString('en-US')}+`;
  return `${s.name} ${verb} after the tutorial`;
}
