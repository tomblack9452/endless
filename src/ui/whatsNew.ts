// "What's new": a small card on the first launch after an update, with a few
// lines about the version. Never on a fresh install (the tutorial covers that)
// and never twice; settings > help > what's new shows it again.
// The lines for each version live here, newest first.

export const WHATS_NEW: Readonly<Record<string, readonly string[]>> = {
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
