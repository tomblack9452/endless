import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LOOKS } from '../src/ship/catalogue';
import { CONFIG } from '../src/core/config';
import { chainNote, ITEMS, itemCard, itemIcon, POWER_ITEMS, powerItem, PRACTICE_ITEMS } from '../src/ui/guide';
import { TIPS, tipText } from '../src/ui/hints';
import {
  CONTROL_CARDS,
  controlChoices,
  freshLesson,
  type LessonState,
  LESSON_SECONDS,
  LESSONS,
  lessonMet,
  lessonOver,
  lessonText,
  nextStep,
  Onboarding,
  type OnboardStep,
  STARTER,
  STEER_EACH_WAY,
  TRIAL_SECONDS,
} from '../src/ui/onboarding';
import { controlArt } from '../src/ui/controlArt';
import { byKey } from '../src/ship/looks';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: () => null,
    length: 0,
  };
});
afterEach(() => delete (globalThis as { localStorage?: unknown }).localStorage);

const loaded = async (played: boolean): Promise<Onboarding> => {
  const o = new Onboarding();
  await o.load(played);
  return o;
};

describe('the onboarding steps', () => {
  it('goes controls, practice, how did that feel, dress, done', () => {
    let step: OnboardStep = 'controls';
    for (const [ev, want] of [
      ['practice', 'practice'],
      ['finished', 'feel'],
      ['keep', 'dress'],
      ['done', 'done'],
    ] as const) {
      step = nextStep(step, ev);
      expect(step).toBe(want);
    }
  });

  it('loops through "try another" as often as wanted, then on to the dress step', () => {
    let step: OnboardStep = 'feel';
    for (let i = 0; i < 3; i++) {
      step = nextStep(step, 'try');
      expect(step).toBe('trial');
      step = nextStep(step, i === 1 ? 'skip' : 'finished');
      expect(step).toBe('feel');
    }
    expect(nextStep('trial', 'quit')).toBe('feel'); // left from the pause menu
    expect(nextStep(step, 'keep')).toBe('dress');
  });

  it('ends on skip, starts again on leaving the practice run, and replays from anywhere', () => {
    expect(nextStep('controls', 'skip')).toBe('done');
    expect(nextStep('practice', 'skip')).toBe('done');
    expect(nextStep('practice', 'quit')).toBe('controls');
    for (const s of ['controls', 'practice', 'feel', 'trial', 'dress', 'done'] as const) expect(nextStep(s, 'replay')).toBe('controls');
  });

  it('ignores what does not apply to a step', () => {
    expect(nextStep('controls', 'keep')).toBe('controls');
    expect(nextStep('feel', 'done')).toBe('feel');
    expect(nextStep('done', 'practice')).toBe('done');
    expect(nextStep('dress', 'try')).toBe('dress');
  });
});

describe('onboarding saves', () => {
  it('starts new players at the controls, and skips players who have played', async () => {
    expect((await loaded(false)).step).toBe('controls');
    data.clear();
    expect((await loaded(true)).done).toBe(true);
  });

  it('never shows again to a player who finished it, unless replayed', async () => {
    const a = await loaded(false);
    a.go('practice');
    a.go('finished');
    a.go('keep');
    a.go('done');
    for (const played of [false, true]) expect((await loaded(played)).done).toBe(true);
    // A save from before 1.0.6, finished: still finished.
    data.clear();
    data.set('endless.onboarding', 'done');
    expect((await loaded(false)).done).toBe(true);
    const b = await loaded(true);
    b.go('replay');
    expect((await loaded(true)).step).toBe('controls');
  });

  it('resumes where it stopped; a cut-short practice run starts again, a cut-short trial goes back to how did that feel', async () => {
    const a = await loaded(false);
    a.set('dress');
    expect((await loaded(false)).step).toBe('dress');
    a.set('practice');
    expect((await loaded(false)).step).toBe('controls');
    a.set('trial');
    expect((await loaded(false)).step).toBe('feel');
    a.set('feel');
    expect((await loaded(false)).step).toBe('feel');
  });

  it('starts over on a value it does not know', async () => {
    data.set('endless.onboarding', 'recap?');
    expect((await loaded(false)).step).toBe('controls');
  });

  it('remembers keys over the mouse on a computer', async () => {
    expect((await loaded(false)).keys).toBeNull();
    (await loaded(false)).setKeys(false);
    expect((await loaded(false)).keys).toBe(false);
    (await loaded(false)).setKeys(true);
    expect((await loaded(false)).keys).toBe(true);
  });
});

describe('the controls offered', () => {
  it('shows drag, tap sides and tilt on a phone that can tell its lean', () => {
    expect(controlChoices({ touch: true, tilt: true })).toEqual(['drag', 'sides', 'tilt']);
  });

  it('leaves tilt out where there is none', () => {
    expect(controlChoices({ touch: true, tilt: false })).toEqual(['drag', 'sides']);
    expect(controlChoices({ touch: false, tilt: true })).not.toContain('tilt');
  });

  it('offers the keys first on a computer', () => {
    expect(controlChoices({ touch: false, tilt: false })).toEqual(['keys', 'drag', 'sides']);
  });

  it('gives every card a name, a line, what it is good for, and a diagram', () => {
    for (const id of ['drag', 'sides', 'tilt', 'keys'] as const) {
      const c = CONTROL_CARDS[id];
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.line.length).toBeGreaterThan(10);
      expect(c.good).toMatch(/^good for /);
      expect(c.line).toBe(c.line.toLowerCase());
      const svg = controlArt(id);
      expect(svg).toMatch(/^<svg[^>]*aria-hidden="true"/);
      expect(svg).toContain('art-ship');
      expect(svg).toContain('art-rm'); // the still version's arrows
    }
  });
});

describe('lessons', () => {
  it('are the six first-run tips, in their order', () => {
    expect(LESSONS).toEqual(TIPS);
    expect(LESSONS.length).toBe(6);
  });

  it('teach each lesson in words for every way to steer', () => {
    for (const l of LESSONS) for (const c of ['drag', 'sides', 'tilt', 'keys'] as const) expect(lessonText(l, c).length).toBeGreaterThan(8);
  });

  it('word steering and boost exactly as the tips do', () => {
    for (const c of ['drag', 'sides', 'tilt', 'keys'] as const) expect(lessonText('steer', c)).toBe(tipText('steer', c));
    for (const how of [{}, { keys: true }, { doubleTap: false }, { side: 'left' as const }]) expect(lessonText('boost', 'drag', how)).toBe(tipText('boost', 'drag', how));
  });

  it('word them for a keyboard, for boost without double-tap, and say where the boost button is', () => {
    expect(lessonText('steer', 'keys')).toMatch(/arrow keys/);
    expect(lessonText('boost', 'drag', { keys: true })).toMatch(/space/);
    expect(lessonText('boost', 'drag', { doubleTap: false })).not.toMatch(/double-tap/);
    expect(lessonText('boost', 'drag', { side: 'left' })).toContain('bottom left');
  });

  it('give the chain limit from CONFIG', () => {
    expect(lessonText('nearMiss', 'drag')).toContain(`x${CONFIG.score.nearMiss.maxCombo}`);
  });

  const did = (patch: Partial<LessonState>): LessonState => ({ ...freshLesson(), ...patch });

  it('move on once the player has done the thing', () => {
    expect(lessonMet('steer', did({ left: STEER_EACH_WAY, right: STEER_EACH_WAY }))).toBe(true);
    expect(lessonMet('steer', did({ left: 3 }))).toBe(false); // one way only
    expect(lessonMet('avoid', did({ passed: 2 }))).toBe(true);
    expect(lessonMet('avoid', did({ passed: 1 }))).toBe(false);
    expect(lessonMet('nearMiss', did({ nearMisses: 1 }))).toBe(true);
    expect(lessonMet('pickup', did({ pickups: 1 }))).toBe(true);
    expect(lessonMet('power', did({ powers: 2 }))).toBe(false);
    expect(lessonMet('power', did({ powers: 3 }))).toBe(true);
    expect(lessonMet('boost', did({ boostT: 0.6 }))).toBe(true);
    for (const l of LESSONS) expect(lessonMet(l, freshLesson())).toBe(false);
  });

  it('time out gently, so nobody is stuck', () => {
    for (const l of LESSONS) {
      expect(LESSON_SECONDS[l]).toBeGreaterThanOrEqual(10);
      expect(lessonOver(l, did({ t: LESSON_SECONDS[l] - 0.1 }))).toBe(false);
      expect(lessonOver(l, did({ t: LESSON_SECONDS[l] + 0.1 }))).toBe(true);
    }
    // Three power-ups need longer than the rest.
    expect(LESSON_SECONDS.power).toBeGreaterThan(LESSON_SECONDS.pickup);
    expect(TRIAL_SECONDS).toBeGreaterThanOrEqual(10);
    expect(TRIAL_SECONDS).toBeLessThanOrEqual(20);
  });
});

describe('pickup and power-up cards', () => {
  it('cover the boost pickup and every power-up, in the world order', () => {
    expect(ITEMS).toEqual(['pickup', 'shield', 'magnet', 'slow', 'phase', 'double']);
    expect([0, 1, 2, 3, 4].map((k) => powerItem(k as 0 | 1 | 2 | 3 | 4))).toEqual(POWER_ITEMS);
    // The practice run teaches the first four; phase and double points are met in play (the recap has them all).
    expect(PRACTICE_ITEMS).toEqual(['pickup', 'shield', 'magnet', 'slow']);
  });

  it('take their numbers from CONFIG', () => {
    const P = CONFIG.powers;
    const B = CONFIG.boost.pickup;
    expect(itemCard('pickup').does).toContain(`${Math.round(B.amount * 100)}%`);
    expect(itemCard('pickup').does).toContain(`+${CONFIG.score.pickupPoints}`);
    expect(itemCard('shield').does).toContain(`${P.shield.graceSeconds} s`);
    expect(itemCard('shield').does).toContain('one hit');
    expect(itemCard('magnet').does).toContain(`${P.magnet.seconds} s`);
    expect(itemCard('slow').does).toContain(`${Math.round(P.slow.factor * 100)}%`);
    expect(itemCard('slow').does).toContain(`${P.slow.seconds} s`);
    expect(itemCard('phase').does).toContain(`${P.phase.seconds} s`);
    expect(itemCard('phase').does).toContain('next thing it hits');
    expect(itemCard('double').does).toContain(`x${P.double.factor}`);
    expect(itemCard('double').does).toContain(`${P.double.seconds} s`);
    expect(chainNote()).toContain(`+${CONFIG.score.nearMiss.points}`);
    expect(chainNote()).toContain(`x${CONFIG.score.nearMiss.maxCombo}`);
  });

  it('follow CONFIG when it changes', () => {
    const was = CONFIG.powers.magnet.seconds;
    try {
      (CONFIG.powers.magnet as { seconds: number }).seconds = 12;
      expect(itemCard('magnet').does).toContain('12 s');
      expect(itemCard('magnet').on).toContain('12 s');
    } finally {
      (CONFIG.powers.magnet as { seconds: number }).seconds = was;
    }
  });

  it('confirm the effect when picked up, and wear the game colour', () => {
    expect(itemCard('shield').on).toBe('shield on: one free hit');
    expect(itemCard('pickup').color).toBe(CONFIG.boost.pickup.color);
    expect(itemCard('shield').color).toBe(CONFIG.powers.shield.color);
    expect(itemCard('magnet').color).toBe(CONFIG.powers.magnet.color);
    expect(itemCard('slow').color).toBe(CONFIG.powers.slow.color);
    expect(itemCard('phase').color).toBe(CONFIG.powers.phase.color);
    expect(itemCard('double').color).toBe(CONFIG.powers.double.color);
    for (const id of ITEMS) {
      const c = itemCard(id);
      expect(c.on.length).toBeGreaterThan(4);
      expect(c.does).toBe(c.does.toLowerCase());
      expect(itemIcon(id)).toContain(c.color);
    }
  });
});

describe('the starter set', () => {
  it('offers real looks, three to a slot, with free paints and engines', () => {
    for (const keys of Object.values(STARTER)) {
      expect(keys.length).toBe(3);
      for (const k of keys) expect(byKey(k), k).toBeDefined();
    }
    for (const k of [...STARTER.paint, ...STARTER.engine]) expect(byKey(k)!.unlock.by).toBe('free');
    expect(LOOKS.length).toBeGreaterThan(150);
  });
});
