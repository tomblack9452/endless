// "What's new": a small card on the first launch after an update, with a few
// lines about the version. Never on a fresh install (the tutorial covers that)
// and never twice; settings > help > what's new shows it again.
// The lines for each version live here, newest first.

export const WHATS_NEW: Readonly<Record<string, readonly string[]>> = {
  '1.0.14': [
    'your first pack of credits or cores is doubled',
    'a starter offer, and a deal each week',
    'free cores for an ad, once a day in the store',
    'try premium looks on: they glow in the hangar',
  ],
  '1.0.13': [
    'a new look: one fly button, pick your mode',
    'the end screen shows what your credits buy',
    'credit packs, and a way to top up when short',
    'share usage stats, only if you choose to',
  ],
  '1.0.12': ['a new full-screen splash as the game loads', 'tap steering: no more boosting by mistake', 'a cores spend is never charged twice'],
  '1.0.11': [
    'cores earned or spent offline are kept',
    'spending 100 cores or more asks first',
    'bigger tap areas; back closes every card',
    'lots of small fixes from a full check-up',
  ],
  '1.0.10': ['smoother on mid-range phones', 'graphics: auto, high or low in settings', 'auto turns to low by itself if needed'],
  '1.0.9': [
    'new power-ups: phase and double points',
    'risk lanes, gate runs and km milestones',
    'zen: fly with no score, crashes just fade',
    "run details, a crash moment, a rival's ghost",
    'share your best from the app',
  ],
  '1.0.8': [
    'a daily challenge: one short course for all',
    'fly it days in a row for credits and cores',
    'a today tab on the leaderboards',
    'comfort: vibration, left hand, colour-blind',
    'reminders if you want them; an offline mark',
  ],
  '1.0.7': [
    'report a pilot from their card on the boards',
    'quick retry: one tap after a crash flies again',
    'fairer ranked: the server checks leagues',
    'new season looks arrive on time',
    'fixes, and quiet error reports for the rest',
  ],
};

/** The version the player last saw the card for (kept on this device only, not in the cloud save). */
export const SEEN_KEY = 'endless.seenVersion';

/** The newest version with lines, at or below `version` (a build can have none of its own). */
export function latestNotes(version: string): { version: string; lines: readonly string[] } | null {
  const v = Object.keys(WHATS_NEW)
    .filter((k) => compareVersions(k, version) <= 0)
    .sort(compareVersions)
    .pop();
  return v ? { version: v, lines: WHATS_NEW[v] } : null;
}

/** -1, 0 or 1, comparing "1.0.10" with "1.0.9" as numbers. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/**
 * The lines to show on this launch, or null. `lastSeen`: the version the card
 * was last shown for (null if never); `fresh`: a new player, who hasn't
 * finished the tutorial yet. Either way the caller marks `version` seen.
 */
export function whatsNewOnLaunch(lastSeen: string | null, version: string, fresh: boolean): readonly string[] | null {
  if (fresh) return null;
  if (lastSeen !== null && compareVersions(lastSeen, version) >= 0) return null;
  const notes = latestNotes(version);
  // Only notes newer than what was seen: a build with no lines of its own shows nothing new.
  if (!notes || (lastSeen !== null && compareVersions(notes.version, lastSeen) <= 0)) return null;
  return notes.lines;
}
