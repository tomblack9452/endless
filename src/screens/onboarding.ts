import { saveSettings } from '../core/settings';
import {
  CONTROL_CARDS,
  controlChoices,
  type ControlId,
  freshLesson,
  hasTouch,
  type Lesson,
  lessonMet,
  lessonOver,
  LESSONS,
  lessonText,
  PRACTICE_SEED,
  STARTER,
  TRIAL_SECONDS,
} from '../ui/onboarding';
import { itemCard, powerItem } from '../ui/guide';
import { analytics } from '../platform/analytics';
import type { Mark } from '../ui/tutorialView';
import { Vector3 } from 'three';
import { googleAvailable } from '../platform/account';
import { byKey, type Slot } from '../ship/looks';
import type { PowerKind } from '../world/world';
import type { Game } from '../core/game';

/** The practice run puts each pickup and power-up this far ahead (about 2.5 s at its speed). */
const ITEM_AHEAD = 95;

/** How long a picked-up item's "on" line stays before the next. */
const CONFIRM_SECONDS = 1.8;

/** After the practice magnet: pickups this far ahead, this far to the side of the lane, for it to pull in. */
const MAGNET_DEMO: [number, number][] = [
  [36, 1.6],
  [50, -1.6],
  [64, 1.6],
];

export class FirstLaunch {
  constructor(private readonly g: Game) {}

  private readonly markV = new Vector3();

  /** The ways to steer this device offers (tilt where the phone can tell its lean). */
  private controlChoices(): ControlId[] {
    return controlChoices({ touch: hasTouch(), tilt: typeof DeviceOrientationEvent !== 'undefined' });
  }

  /** The welcome screen, on the step onboarding is at (choosing controls, "how did that feel?", or dressing the ship). */
  openWelcome(): void {
    const step = this.g.onboarding.step === 'dress' ? 'dress' : this.g.onboarding.step === 'feel' ? 'feel' : 'controls';
    if (!hasTouch() && this.g.settings.tilt) {
      this.g.settings.tilt = false; // no tilt without a phone
      void saveSettings(this.g.settings);
    }
    const c = this.g.controlsNow();
    const used = this.g.feelUsed ?? c;
    const cards = this.controlChoices().map((id) => ({ id, on: id === c, used: step === 'feel' && id === used }));
    const name = (id: ControlId) => CONTROL_CARDS[id].name;
    const feel =
      step === 'feel'
        ? {
            note:
              c === used
                ? `you flew with ${name(used)}. keep it, or tap another card to try it for ${TRIAL_SECONDS} s.`
                : `${name(c)} it is. try it for ${TRIAL_SECONDS} s first, or keep it.`,
            tryLabel: c === used ? null : `try ${name(c)} · ${TRIAL_SECONDS} s`,
            keepLabel: `keep ${name(c)}`,
          }
        : null;
    const eq = this.g.looks.equipped;
    const chips = (slot: 'hull' | 'paint' | 'engine'): [string, string, boolean][] =>
      STARTER[slot].map((key) => [key, byKey(key)?.name ?? key, `${slot}:${eq[slot]}` === key]);
    this.g.ui.renderWelcome(step, cards, { hull: chips('hull'), paint: chips('paint'), engine: chips('engine') }, feel);
    const google = document.getElementById('welcome-google');
    if (google) google.hidden = !(googleAvailable() && this.g.backend.online);
    this.g.player.reset();
    this.g.player.setVisible(true);
    this.g.trail.setVisible(true);
    this.g.openInfo('welcome');
  }

  /** A control card: saved to settings straight away. */
  chooseControls(id: string): void {
    if (!(this.controlChoices() as string[]).includes(id)) return;
    this.g.settings.tilt = id === 'tilt';
    this.g.settings.touch = id === 'sides' ? 1 : 0;
    if (!hasTouch()) this.g.onboarding.setKeys(id === 'keys');
    void saveSettings(this.g.settings);
    this.g.settingsScreen.applySettings();
    this.g.haptics.pickup();
    this.openWelcome();
  }

  /** The practice run: a fixed course you can't fail, one lesson at a time. */
  startPractice(): void {
    this.g.onboarding.go('practice');
    this.beginPractice('lessons');
  }

  /** "try another": a short steering-only run with the controls just picked. */
  startTrial(): void {
    this.g.onboarding.go('try');
    this.beginPractice('trial');
  }

  private beginPractice(kind: 'lessons' | 'trial'): void {
    this.g.ui.showGuide(null);
    this.g.infoOpen = null;
    this.g.practiceNext = true;
    this.g.beginRun(0, PRACTICE_SEED, 'endless');
    this.g.ui.hideBanner(); // the lesson card has the top band
    this.g.recorded = true; // nothing from it counts: no stats, no bests, no boards
    this.g.unlockable = false; // ...and no unlocks
    this.g.practice = { kind, lesson: 0, s: freshLesson(), control: this.g.controlsNow(), learned: [], item: null, coming: false, queue: [], confirmT: 0 };
    this.g.teach.show(true);
    this.showLesson();
  }

  /** Put the lesson (or the trial) up: the card in the top band and its indicator. */
  private showLesson(): void {
    const p = this.g.practice;
    if (!p) return;
    // Steering is worded for the controls chosen (keys only if the keys were); boost for the device.
    const keys = { keys: !hasTouch(), doubleTap: this.g.doubleTapOn(), side: this.g.settingsScreen.boostSide() };
    const steerHow = { ...keys, keys: false };
    if (p.kind === 'trial') {
      this.g.teach.setStep(`trying ${CONTROL_CARDS[p.control].name} · ${Math.max(0, Math.ceil(TRIAL_SECONDS - p.s.t))} s`, 0, 0);
      this.g.teach.setItem(null);
      this.g.teach.setText(lessonText('steer', p.control, steerHow));
      this.g.teach.point(null);
      return;
    }
    const lesson = LESSONS[p.lesson];
    if (lesson === 'boost') this.g.boostMeter = 1; // a full meter, so boost works straight away
    if (lesson === 'pickup') p.queue = ['pickup'];
    if (lesson === 'power') p.queue = [0, 1, 2];
    p.item = null;
    this.g.teach.setStep(`practice · ${p.lesson + 1} of ${LESSONS.length}`, p.lesson, LESSONS.length);
    this.g.teach.setItem(null);
    this.g.teach.setText(lessonText(lesson, p.control, lesson === 'boost' ? keys : steerHow));
    this.g.teach.point(lesson === 'nearMiss' ? 'score' : lesson === 'boost' ? 'boost' : null);
    this.g.teach.setArt(lesson === 'steer' ? p.control : null);
    this.g.teach.setMarks([]);
  }

  /** Has the player done what the lesson asks? Then the next, and after the last, the recap and "how did that feel?". */
  practiceTick(dt: number): void {
    const p = this.g.practice!;
    const s = p.s;
    s.t += dt;
    const steer = this.g.input.steering();
    if (steer < -0.35) s.left += dt;
    if (steer > 0.35) s.right += dt;
    if (this.g.boosting) s.boostT += dt;
    if (p.kind === 'trial') {
      this.g.teach.setArt(p.control, this.laneDir());
      this.showLesson(); // the countdown
      if (s.t >= TRIAL_SECONDS) this.endTrial();
      return;
    }
    const lesson: Lesson = LESSONS[p.lesson];
    if (lesson === 'steer') this.g.teach.setArt(p.control, this.laneDir());
    if (lesson === 'pickup' || lesson === 'power') this.runItems(dt);
    this.updateMarks(lesson);
    // An item's "on" line stays up for a moment before the lesson moves on.
    if (!lessonOver(lesson, s) || p.confirmT > 0) return;
    if (lessonMet(lesson, s)) {
      p.learned.push(lesson);
      this.g.sound.pickup();
      this.g.haptics.pickup();
    }
    p.lesson++;
    p.s = freshLesson();
    if (p.lesson < LESSONS.length) {
      this.showLesson();
      return;
    }
    this.finishPractice();
  }

  /** Which way the steering diagram leans: towards the safe lane a little ahead (0 when it's straight on). */
  private laneDir(): number {
    const off = this.g.world.laneOffset(26);
    return off === null || Math.abs(off) < 0.8 ? 0 : Math.sign(off);
  }

  /**
   * The pickup and power-up lessons: place the next one on the lane ahead, put
   * its card up as it comes, say what it did once it's picked up, and place it
   * again if it's missed.
   */
  private runItems(dt: number): void {
    const p = this.g.practice!;
    if (p.confirmT > 0) {
      p.confirmT -= dt;
      if (p.confirmT > 0) return;
      p.item = null;
    }
    if (p.item === null) {
      if (p.queue.length === 0) return;
      const next = p.queue[0];
      this.g.world.place(next, ITEM_AHEAD);
      p.item = next;
      p.coming = true;
      this.g.teach.setItem(next === 'pickup' ? 'pickup' : powerItem(next));
      this.g.teach.setText(itemCard(next === 'pickup' ? 'pickup' : powerItem(next)).does);
      return;
    }
    if (p.coming && !this.g.world.itemAhead(p.item, -2, ITEM_AHEAD + 40)) {
      // Flown past: another one.
      this.g.world.place(p.item, ITEM_AHEAD);
      this.g.teach.setText(`missed it. here's another. ${itemCard(p.item === 'pickup' ? 'pickup' : powerItem(p.item)).does}`);
    }
  }

  /** The practice run saw a pickup (or power-up) collected: say what it did. */
  practiceGot(item: 'pickup' | PowerKind): void {
    const p = this.g.practice;
    if (!p || p.kind === 'trial' || p.item !== item || !p.coming) return;
    p.coming = false;
    p.queue.shift();
    p.confirmT = CONFIRM_SECONDS;
    const id = item === 'pickup' ? 'pickup' : powerItem(item);
    this.g.teach.setText(itemCard(id).on);
    if (item === 'pickup') p.s.pickups++;
    else {
      p.s.powers++;
      // The magnet pulls in pickups: a few to the side of the lane show it.
      if (item === 1) for (const [ahead, side] of MAGNET_DEMO) this.g.world.place('pickup', ahead, side);
    }
  }

  /** Markers on the world: the next obstacle and the gap, or the item coming up. */
  private updateMarks(lesson: Lesson): void {
    const p = this.g.practice!;
    const marks: Mark[] = [];
    if (lesson === 'avoid') {
      const o = this.g.world.obstacleAhead(12, 70, 6);
      if (o) {
        const a = this.toScreen(o.x, o.y, o.z);
        const g = this.toScreen(o.gap, 1.4, o.z);
        if (a) marks.push({ ...a, label: 'obstacle', color: '' });
        if (g && Math.abs(o.gap - o.x) > 1.2) marks.push({ ...g, label: 'gap', color: '' });
      }
    } else if ((lesson === 'pickup' || lesson === 'power') && p.item !== null && p.coming) {
      const it = this.g.world.itemAhead(p.item, 6, ITEM_AHEAD + 40);
      const id = p.item === 'pickup' ? 'pickup' : powerItem(p.item);
      const at = it && this.toScreen(it.x, it.y + 0.7, it.z);
      if (at) marks.push({ ...at, label: itemCard(id).name, color: itemCard(id).color });
    }
    this.g.teach.setMarks(marks);
  }

  /** A point in the scene, in pixels over the play area; null if it's behind the camera or off screen. */
  private toScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const v = this.markV.set(x, y, z).project(this.g.stage.camera);
    if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) return null;
    const canvas = this.g.stage.renderer.domElement;
    return { x: ((v.x + 1) / 2) * canvas.clientWidth, y: ((1 - v.y) / 2) * canvas.clientHeight };
  }

  /** The last lesson done: the recap of the pickups and power-ups, then "how did that feel?". */
  private finishPractice(): void {
    const p = this.g.practice!;
    // The walkthrough needn't say any of it again (a lesson only timed out still showed what it's about).
    this.g.hints.learned(LESSONS);
    analytics.log('tutorial_complete', { controls: p.control });
    this.g.feelUsed = p.control;
    this.endPractice();
    this.g.onboarding.go('finished');
    this.openWelcome();
    this.g.ui.showGuide('next');
  }

  /** The trial's time is up (or skipped): back to "how did that feel?". */
  private endTrial(): void {
    const p = this.g.practice!;
    this.g.feelUsed = p.control;
    this.endPractice();
    this.g.onboarding.go('finished');
    this.openWelcome();
  }

  /** Off the practice course and its indicators, back to the title scene. */
  private endPractice(): void {
    this.g.teach.show(false);
    this.g.nav.toMainMenu();
    this.g.practice = null;
  }

  /** "skip" during the practice run ends the tutorial; during a trial it goes back to "how did that feel?". */
  skipPractice(): void {
    if (this.g.practice?.kind === 'trial') this.endTrial();
    else this.finishOnboarding();
  }

  /** "keep": on to dressing the ship. */
  keepControls(): void {
    this.g.feelUsed = null;
    this.g.onboarding.go('keep');
    this.openWelcome();
  }

  /** The recap's button: closes it (over "how did that feel?" or settings). */
  closeGuide(): void {
    this.g.ui.showGuide(null);
  }

  /** Try a look from the starter set on (owned or not; the hull chosen is given at the end). */
  pickStarter(key: string): void {
    const [slot, id] = key.split(':') as [Slot, string];
    this.g.looks.equip(slot, id);
    this.g.applyLooks();
    this.g.haptics.pickup();
    this.openWelcome();
  }

  /** Done (or skipped): keep the hull chosen, and on to the front page. */
  finishOnboarding(): void {
    if (this.g.practice) {
      if (this.g.practice.kind !== 'trial') analytics.log('tutorial_skip', { step: `lesson ${this.g.practice.lesson + 1}` });
      // Skipped part way: the tips still cover what the practice run didn't get to.
      this.g.hints.learned(this.g.practice.learned);
      this.endPractice();
    }
    this.g.ui.showGuide(null);
    this.g.feelUsed = null;
    const hull = `hull:${this.g.looks.equipped.hull}`;
    if (STARTER.hull.includes(hull) && !this.g.looks.owns(byKey(hull)!, this.g.owner())) this.g.looks.give(hull);
    this.g.onboarding.set('done');
    this.g.infoOpen = null;
    this.g.player.setVisible(false);
    this.g.trail.setVisible(false);
    this.g.ui.show('title');
    this.g.title.refreshTitle();
    this.g.claimLogin();
    void this.g.account.askName();
  }
}
