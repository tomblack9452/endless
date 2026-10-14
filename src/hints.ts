import { storage } from './storage';

// The first-run walkthrough: small prompts over the live run, each once, at
// the moment it's about (steer at the start, a pickup when one is coming up, a
// near miss when one happens...). They never stop or slow the run, and "skip
// tips" turns the rest off. Settings > replay tips brings them back.
//
// Only new players see them: a save that already had runs before the
// walkthrough existed starts with every tip seen. One more one-off hint
// ('pits', the gaps in the ship's floor) rides along, outside the order.

export type TipId = 'steer' | 'avoid' | 'nearMiss' | 'pickup' | 'power' | 'boost';
export type HintId = TipId | 'pits';

/** The walkthrough, in the order it's met. */
export const TIPS: TipId[] = ['steer', 'avoid', 'nearMiss', 'pickup', 'power', 'boost'];

/** A tip waits for the one it builds on: steering first, then the obstacles, then the rest as they come up. */
export const AFTER: Record<TipId, TipId | null> = {
  steer: null,
  avoid: 'steer',
  nearMiss: 'avoid',
  pickup: 'avoid',
  power: 'pickup',
  boost: 'pickup',
};

/** How long a hint is on screen, and the quiet gap before the next. */
export const SHOW_MS = 3600;
export const GAP_MS = 1400;

/** The ways to steer: three on a touch screen, and the keys on a computer. */
export type Controls = 'drag' | 'sides' | 'tilt' | 'keys';

/**
 * What a tip says, for the steering in use (`keys`: a keyboard rather than a
 * touch screen). The practice run's lessons use the same words (onboarding.ts),
 * so a tip and the lesson it stands in for never disagree.
 */
export function tipText(id: HintId, controls: Controls, how: { keys?: boolean; doubleTap?: boolean; side?: 'right' | 'left' | 'middle' } = {}): string {
  switch (id) {
    case 'steer':
      if (how.keys || controls === 'keys') return 'arrow keys or a / d to steer';
      return controls === 'tilt' ? 'tilt your phone to steer' : controls === 'sides' ? 'hold the left or right side to steer' : 'drag left and right to steer';
    case 'avoid':
      return 'steer clear of everything. one hit ends the run';
    case 'nearMiss':
      return 'near miss. fly close and chain them for more';
    case 'pickup':
      return 'grab the glowing pickups. they fill your boost';
    case 'power':
      return 'power-up ahead: shield, magnet or slow-mo. grab it';
    case 'boost':
      if (how.keys) return 'hold shift, space or up to boost';
      {
        const button = how.side ? `the boost button (bottom ${how.side})` : 'the boost button';
        return how.doubleTap === false ? `hold ${button} to boost` : `hold ${button}, or double-tap and hold, to boost`;
      }
    case 'pits':
      return 'gaps in the floor. stay over the deck';
  }
}

export interface TipState {
  seen: Set<HintId>;
  skipped: boolean;
}

/**
 * May hint `id` show now? Not twice, not over another (until `busyUntil`), not
 * after "skip tips", and a tip not before the one it builds on.
 */
export function mayShow(id: HintId, st: TipState, now: number, busyUntil: number): boolean {
  if (st.skipped || st.seen.has(id) || now < busyUntil) return false;
  if (id === 'pits') return true;
  const before = AFTER[id];
  return before === null || st.seen.has(before);
}

/** True once every tip has shown (or been skipped): the walkthrough is over. */
export function walkthroughDone(st: TipState): boolean {
  return st.skipped || TIPS.every((t) => st.seen.has(t));
}

const KEY = 'endless.tips';
/** Before the walkthrough: the one-off hints' seen list. */
const OLD_KEY = 'endless.hints';

export class Hints {
  private readonly st: TipState = { seen: new Set(), skipped: false };
  private busyUntil = 0;
  private loaded = false;

  /** `show(text, tip)`: put the text up; `tip` is true for a walkthrough tip (it gets "skip tips"). */
  constructor(private readonly show: (text: string, tip: boolean) => void) {}

  /** `played`: the save already has runs. Such a player never gets the walkthrough (unless replayed). */
  async load(played: boolean): Promise<void> {
    const raw = await storage.get(KEY);
    let known = false;
    if (raw) {
      try {
        const v = JSON.parse(raw) as { seen?: HintId[]; skipped?: boolean };
        for (const id of v.seen ?? []) this.st.seen.add(id);
        this.st.skipped = v.skipped === true;
        known = true;
      } catch {
        // Corrupt value: decided below, as if new.
      }
    }
    if (!known) {
      const old = await storage.get(OLD_KEY);
      try {
        if (old) for (const id of JSON.parse(old) as HintId[]) if (id === 'pits') this.st.seen.add(id);
      } catch {
        // Ignore.
      }
      if (played) for (const t of TIPS) this.st.seen.add(t);
      this.save();
    }
    this.loaded = true;
  }

  /** Show hint `id` if it may show now (see mayShow); `text` is what it says. Returns whether it showed. */
  offer(id: HintId, text: string): boolean {
    if (!this.loaded) return false;
    const now = performance.now();
    if (!mayShow(id, this.st, now, this.busyUntil)) return false;
    this.st.seen.add(id);
    this.busyUntil = now + SHOW_MS + GAP_MS;
    this.show(text, id !== 'pits');
    this.save();
    return true;
  }

  /** Is a walkthrough tip still to come? (Cheap check before working out a tip's moment.) */
  get active(): boolean {
    return this.loaded && !walkthroughDone(this.st);
  }

  /** "skip tips": no more of them. */
  skip(): void {
    this.st.skipped = true;
    this.save();
  }

  /** The practice run already taught these: their tips are seen. */
  learned(ids: TipId[]): void {
    for (const id of ids) this.st.seen.add(id);
    this.save();
  }

  /** Settings > replay tips: the walkthrough again from the start, on the next run. */
  replay(): void {
    for (const t of TIPS) this.st.seen.delete(t);
    this.st.skipped = false;
    this.busyUntil = 0;
    this.save();
  }

  private save(): void {
    void storage.set(KEY, JSON.stringify({ seen: [...this.st.seen], skipped: this.st.skipped }));
  }
}
