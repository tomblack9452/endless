// The hub's one fly button flies the mode on show; the chips under it pick one.

export const HUB_MODES = ['ranked', 'solo', 'endless', 'daily', 'zen'] as const;
export type HubMode = (typeof HUB_MODES)[number];

export const LAST_MODE_KEY = 'endless.lastMode';
export const LAST_SOLO_KEY = 'endless.lastSolo';

/** The mode to show: the one picked last if it's still open, else ranked, else endless (open from the start). */
export function hubMode(saved: string | null, open: (m: HubMode) => boolean): HubMode {
  const m = HUB_MODES.find((x) => x === saved);
  if (m && (m === 'endless' || open(m))) return m;
  return open('ranked') ? 'ranked' : 'endless';
}
