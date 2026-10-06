import { storage } from './storage';

// First launch: choose controls, a short practice run that can't be failed (it
// teaches steering, a near miss, a pickup and boost, one at a time), then dress
// the ship from a small starter set. The pilot name waits until the leaderboard.
// It resumes after a restart, can be replayed from settings, and players who
// had already played skip it.

export type OnboardStep = 'controls' | 'practice' | 'dress' | 'done';

/** The practice run's course: always the same, and checked by the fairness tests. */
export const PRACTICE_SEED = 20261006;

export type Lesson = 'steer' | 'nearMiss' | 'pickup' | 'boost';
export const LESSONS: Lesson[] = ['steer', 'nearMiss', 'pickup', 'boost'];

/** What a lesson asks, for the controls chosen. */
export function lessonText(l: Lesson, controls: 'drag' | 'sides' | 'tilt', how: { keys?: boolean; doubleTap?: boolean } = {}): string {
  const keys = how.keys ? ' (or the arrow keys)' : '';
  switch (l) {
    case 'steer':
      return (controls === 'tilt' ? 'tilt your phone to steer' : controls === 'sides' ? 'hold the left or right side to steer' : 'drag left and right to steer') + keys;
    case 'nearMiss':
      return 'fly close past a rock: a near miss scores extra';
    case 'pickup':
      return 'fly through a glowing pickup';
    case 'boost':
      if (how.keys) return 'hold space, or the boost button, to boost';
      return how.doubleTap === false ? 'hold the boost button to boost' : 'hold the boost button, or double-tap and hold, to boost';
  }
}

/** A lesson that isn't done in this long moves on anyway (no one gets stuck in practice). */
export const LESSON_SECONDS = 20;

/** The starter set to dress the ship from: "slot:id" keys, three to a slot. */
export const STARTER: Record<'hull' | 'paint' | 'engine', string[]> = {
  hull: ['hull:dart', 'hull:wing', 'hull:needle'],
  paint: ['paint:standard', 'paint:scout', 'paint:rust'],
  engine: ['engine:standard', 'engine:cold', 'engine:warm'],
};

const KEY = 'endless.onboarding';

export class Onboarding {
  step: OnboardStep = 'controls';

  /** `played`: the save already has runs (it skips onboarding). */
  async load(played: boolean): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw === 'controls' || raw === 'practice' || raw === 'dress' || raw === 'done') this.step = raw;
    else if (played) this.set('done');
    // A practice run cut short starts again from the controls.
    if (this.step === 'practice') this.step = 'controls';
  }

  set(step: OnboardStep): void {
    this.step = step;
    void storage.set(KEY, step);
  }

  get done(): boolean {
    return this.step === 'done';
  }
}

/** A touch screen (a phone or tablet), rather than a mouse and keyboard. */
export function hasTouch(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}
