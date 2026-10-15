import { CONFIG } from '../core/config';
import { type Controls, TIPS, type TipId, tipText } from './hints';
import { storage } from '../core/storage';

// First launch: choose how to steer (a card for each way, with a small moving
// diagram), a short practice run that can't be failed (six lessons, one at a
// time, each with an indicator on screen: steering, obstacles, near misses, a
// pickup, the power-ups and boost), a recap of the pickups and power-ups, then
// "how did that feel?" (keep the controls, or try another for a few seconds and
// come back), then dress the ship from a small starter set. The pilot name
// waits until the leaderboard. It resumes after a restart, can be replayed from
// settings, and players who had already played skip it.

export type OnboardStep = 'controls' | 'practice' | 'feel' | 'trial' | 'dress' | 'done';

/** What moves onboarding on: a button, or the end of a run. */
export type OnboardEvent = 'practice' | 'skip' | 'finished' | 'quit' | 'keep' | 'try' | 'done' | 'replay';

/**
 * The step after `step` when `ev` happens (the same step if it doesn't apply there):
 * controls -practice-> practice -finished-> feel -keep-> dress -done-> done, with
 * feel -try-> trial -finished/skip/quit-> feel as often as wanted. Skipping the
 * tutorial (on the controls or in the practice run) ends it; leaving the practice
 * run starts it again; replay (settings) goes back to the start from anywhere.
 */
export function nextStep(step: OnboardStep, ev: OnboardEvent): OnboardStep {
  if (ev === 'replay') return 'controls';
  switch (step) {
    case 'controls':
      return ev === 'practice' ? 'practice' : ev === 'skip' ? 'done' : step;
    case 'practice':
      return ev === 'finished' ? 'feel' : ev === 'skip' ? 'done' : ev === 'quit' ? 'controls' : step;
    case 'feel':
      return ev === 'keep' ? 'dress' : ev === 'try' ? 'trial' : step;
    case 'trial':
      return ev === 'finished' || ev === 'skip' || ev === 'quit' ? 'feel' : step;
    case 'dress':
      return ev === 'done' || ev === 'skip' ? 'done' : step;
    case 'done':
      return step;
  }
}

/** The practice run's course: always the same, and checked by the fairness tests. */
export const PRACTICE_SEED = 20261006;

export type ControlId = Controls;

/** The ways to steer this device offers: tilt only with a touch screen that can tell its lean; keys only without a touch screen. */
export function controlChoices(env: { touch: boolean; tilt: boolean }): ControlId[] {
  const list: ControlId[] = env.touch ? [] : ['keys'];
  list.push('drag', 'sides');
  if (env.touch && env.tilt) list.push('tilt');
  return list;
}

export interface ControlCard {
  name: string;
  /** How it works, in one line. */
  line: string;
  good: string;
}

export const CONTROL_CARDS: Record<ControlId, ControlCard> = {
  drag: { name: 'drag', line: 'slide a thumb anywhere. most precise', good: 'good for tight gaps' },
  sides: { name: 'tap sides', line: 'hold the left or right half. simplest', good: 'good for one thumb' },
  tilt: { name: 'tilt', line: 'lean your phone. no thumbs on the glass', good: 'good for seeing it all' },
  keys: { name: 'keys', line: '← → or a / d. hold space to boost', good: 'good for a keyboard' },
};

/** The lessons, in order: the same six as the first-run tips, so each lesson stands in for its tip. */
export type Lesson = TipId;
export const LESSONS: Lesson[] = TIPS;

/** What a lesson asks, for the controls chosen. Steering and boost are worded as their tips are. */
export function lessonText(l: Lesson, controls: ControlId, how: Parameters<typeof tipText>[2] = {}): string {
  switch (l) {
    case 'steer':
    case 'boost':
      return tipText(l, controls, how);
    case 'avoid':
      return "steer through the gaps. one hit ends a real run. here you can't crash";
    case 'nearMiss':
      return `fly close without touching. chain them for up to x${CONFIG.score.nearMiss.maxCombo}`;
    case 'pickup':
      return 'fly through the glowing pickup';
    case 'power':
      return 'three power-ups next. fly through each';
  }
}

/** A lesson not done in this long moves on anyway (no one gets stuck in practice). */
export const LESSON_SECONDS: Record<Lesson, number> = {
  steer: 14,
  avoid: 12,
  nearMiss: 20,
  pickup: 20,
  power: 50,
  boost: 14,
};

/** "try another": a steering-only run this long with the new controls. */
export const TRIAL_SECONDS = 15;

/** Steering this long each way counts as having steered both ways. */
export const STEER_EACH_WAY = 0.4;

/** What the player has done since the lesson began. */
export interface LessonState {
  t: number;
  /** Seconds steered left, and right. */
  left: number;
  right: number;
  /** Obstacles flown past. */
  passed: number;
  nearMisses: number;
  pickups: number;
  powers: number;
  /** Seconds boosted. */
  boostT: number;
}

export function freshLesson(): LessonState {
  return { t: 0, left: 0, right: 0, passed: 0, nearMisses: 0, pickups: 0, powers: 0, boostT: 0 };
}

/** Has the player done what the lesson asks? */
export function lessonMet(l: Lesson, s: LessonState): boolean {
  switch (l) {
    case 'steer':
      return s.left >= STEER_EACH_WAY && s.right >= STEER_EACH_WAY;
    case 'avoid':
      return s.passed >= 2;
    case 'nearMiss':
      return s.nearMisses >= 1;
    case 'pickup':
      return s.pickups >= 1;
    case 'power':
      return s.powers >= 3;
    case 'boost':
      return s.boostT >= 0.6;
  }
}

/** Done, or out of time: the lesson moves on. */
export function lessonOver(l: Lesson, s: LessonState): boolean {
  return lessonMet(l, s) || s.t > LESSON_SECONDS[l];
}

/** The starter set to dress the ship from: "slot:id" keys, three to a slot. */
export const STARTER: Record<'hull' | 'paint' | 'engine', string[]> = {
  hull: ['hull:dart', 'hull:wing', 'hull:needle'],
  paint: ['paint:standard', 'paint:scout', 'paint:rust'],
  engine: ['engine:standard', 'engine:cold', 'engine:warm'],
};

const KEY = 'endless.onboarding';
/** On a computer: steering with the keys rather than the mouse ('1' or '0'; unset follows the device). */
const KEYS_KEY = 'endless.keys';
const STEPS: OnboardStep[] = ['controls', 'practice', 'feel', 'trial', 'dress', 'done'];

export class Onboarding {
  step: OnboardStep = 'controls';
  /** Keys chosen over the mouse (null: not chosen, so keys on a computer). */
  keys: boolean | null = null;

  /** `played`: the save already has runs (it skips onboarding). */
  async load(played: boolean): Promise<void> {
    const raw = await storage.get(KEY);
    if (raw && (STEPS as string[]).includes(raw)) this.step = raw as OnboardStep;
    else if (played) this.set('done');
    // A run cut short: a practice run starts again from the controls, a trial goes back to "how did that feel?".
    if (this.step === 'practice') this.step = 'controls';
    if (this.step === 'trial') this.step = 'feel';
    const k = await storage.get(KEYS_KEY);
    this.keys = k === '1' ? true : k === '0' ? false : null;
  }

  set(step: OnboardStep): void {
    this.step = step;
    void storage.set(KEY, step);
  }

  /** Move on for `ev` (see nextStep); returns the new step. */
  go(ev: OnboardEvent): OnboardStep {
    this.set(nextStep(this.step, ev));
    return this.step;
  }

  setKeys(on: boolean): void {
    this.keys = on;
    void storage.set(KEYS_KEY, on ? '1' : '0');
  }

  get done(): boolean {
    return this.step === 'done';
  }
}

/** A touch screen (a phone or tablet), rather than a mouse and keyboard. */
export function hasTouch(): boolean {
  return typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}
