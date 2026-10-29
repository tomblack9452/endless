import { CONFIG } from './config';

// The crash moment: outside ranked, a crash plays out in slow motion
// for a second, on what you hit, before the game-over screen. Reduce motion
// and its own setting leave it out. The revive offer waits for the moment to
// end and then gets its whole timer: the moment never eats into it.

/** Does this crash get the moment? Not in ranked, the practice run or zen; not with reduce motion or the setting off. */
export function crashMomentOn(o: { setting: boolean; reduceMotion: boolean; ranked: boolean; practice: boolean; zen: boolean }): boolean {
  return o.setting && !o.reduceMotion && !o.ranked && !o.practice && !o.zen;
}

/** How fast the crash plays `realMs` after it: slowed through the moment, then at full speed. */
export function crashTimeScale(realMs: number, moment: boolean): number {
  return moment && realMs < CONFIG.crashMoment.ms ? CONFIG.crashMoment.timeScale : 1;
}

/**
 * Is it time for what comes after the crash (the revive offer or the game-over
 * screen)? `sceneMs` is the crash's own (slowed) clock. Without the moment,
 * as before: once the crash has played for CONFIG.crash.overDelayMs. With it:
 * as soon as the moment is over.
 */
export function crashOverReady(realMs: number, sceneMs: number, moment: boolean): boolean {
  return moment ? realMs >= CONFIG.crashMoment.ms : sceneMs >= CONFIG.crash.overDelayMs;
}
