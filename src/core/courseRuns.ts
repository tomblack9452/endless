import { CONFIG } from './config';
import { speedAt } from '../world/difficulty';
import { rewardText } from '../economy/reward';
import { COURSES, courseLength } from '../world/courses';
import { streakReward } from '../progression/challenge';
import { formatScore } from '../ui/ui';
import { type Game, formatTime, musicForArea, musicFor } from './game';

/** The daily challenge: a flag at the finish line. */
const FLAG_ICON =
  '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"><path d="M16 58V8"/><path d="M16 10h34l-7 10 7 10H16"/><path d="M27 10v20M38 10v20M16 20h34"/></svg>';

export class CourseRuns {
  constructor(private readonly g: Game) {}

  /** The daily challenge: today's course (by the trusted clock), the standard ship, one board for everyone. */
  startDaily(): void {
    this.g.turnDay(this.g.now());
    this.g.beginRun(0, this.g.today.course.seed, 'solo', this.g.today.course, null, this.g.today);
  }

  /** A set level, each frame: section changes (banner, event), progress, look, and the finish. */
  updateCourse(): void {
    const c = this.g.course!;
    // The section the ship is in now (it may have just moved into the next one this frame).
    const i = this.g.world.sectionIndexAt(this.g.world.distance);
    const section = c.sections[i];
    if (i !== this.g.sectionIdx) {
      const prev = this.g.sectionIdx >= 0 ? c.sections[this.g.sectionIdx] : null;
      const areaChange = !prev || prev.theme !== section.theme || (prev.biome ?? '') !== (section.biome ?? '');
      this.g.sectionIdx = i;
      if (prev) {
        this.g.ui.showRoom(section.name);
        this.g.sound.level(areaChange, musicForArea(section.theme, section.biome));
        this.g.haptics.level(areaChange);
      } else this.g.sound.setTheme(musicForArea(section.theme, section.biome));
      if (section.event) {
        // For the whole section (at its speed), not the usual 22 seconds.
        this.g.events.start(section.event, section.length / speedAt(section.difficulty) + 2);
        this.g.ui.showNotice(section.name);
      }
    }
    const length = courseLength(c);
    const done = (this.g.world.distance - this.g.world.finishAt + length) / length;
    this.g.ui.setProgress(Math.max(0, Math.min(1, done)));
    // Time of day comes from how hard the section is: later levels run into evening.
    this.g.applyLook(section.difficulty / CONFIG.score.levelLength);
    if (this.g.world.distance >= this.g.world.finishAt) this.finishCourse();
  }

  /** Crossed the finish line of a set level (or the daily challenge). */
  private finishCourse(): void {
    const c = this.g.course!;
    if (this.g.dailyRunNow) {
      this.finishDaily();
      return;
    }
    this.g.state = 'finished';
    this.g.ghost.stop();
    this.g.finishMs = 0;
    this.g.input.enabled = false;
    this.g.boosting = false;
    this.g.sound.level(true, musicFor(1));
    this.g.haptics.level(true);
    let stars = 1;
    if (!this.g.hitThisRun && !this.g.assisted) stars |= 2;
    if (!this.g.assisted && this.g.score >= c.target) stars |= 4;
    const time = this.g.runTime;
    const before = this.g.progress.course(c.id).score;
    const res = this.g.progress.recordCourse(c.id, stars, time, this.g.score);
    const starCredits = res.newStars * CONFIG.courses.starCredits;
    const best = this.g.progress.course(c.id);
    this.g.ui.setOverHeading('level complete');
    this.g.ui.setGameOver(this.g.score, best.score, this.g.score >= best.score, this.g.nearMissCount, this.g.bestChain, this.g.seed);
    this.g.fillSummary(false);
    const extra = this.g.finishRun(null);
    this.g.connection.offerShare(this.g.score > before);
    this.g.wallet.add(starCredits);
    const starText = [1, 2, 4].map((b) => (stars & b ? '★' : '☆')).join('');
    const lines = [`${starText}  ${formatTime(time)}${res.bestTime ? ' (best)' : ` · best ${formatTime(best.time)}`}`];
    if (starCredits > 0) lines.push(`+${starCredits} credits for new stars`);
    if (!(stars & 2)) lines.push('hit something: no second star');
    if (!(stars & 4)) lines.push(`score ${formatScore(c.target)} for the third star`);
    lines.push(extra);
    this.g.ui.setGameOverExtra(lines.join(' · '));
    this.g.title.refreshTitle();
  }

  /** Crossed the daily challenge's finish line. */
  private finishDaily(): void {
    this.g.state = 'finished';
    this.g.ghost.stop();
    this.g.finishMs = 0;
    this.g.input.enabled = false;
    this.g.boosting = false;
    this.g.sound.level(true, musicFor(1));
    this.g.haptics.level(true);
    const { best, isNew } = this.g.recordBest(true);
    this.g.ui.setOverHeading('finished');
    this.g.ui.setGameOver(this.g.score, best, isNew, this.g.nearMissCount, this.g.bestChain, this.g.seed);
    this.g.fillSummary(false);
    const extra = this.g.finishRun(null);
    this.g.connection.offerShare(isNew);
    this.g.ui.setGameOverExtra([formatTime(this.g.runTime), this.g.dailyLine, extra].filter(Boolean).join(' · '));
    this.g.title.refreshTitle();
  }

  /** The daily run as it ended: today's best and the streak, and the streak's reward on a new day. */
  recordDaily(finished: boolean): { best: number; isNew: boolean } {
    const d = this.g.dailyRunNow!;
    const counts = finished || this.g.runTime >= CONFIG.daily.countsAfter;
    const r = this.g.challenge.record(d.day, this.g.score, counts);
    void this.g.reminders.planReminders(); // today's done: no reminder today
    this.g.dailyLine = r.streak > 0 ? `${r.streak} day streak` : '';
    if (r.reward) {
      const lines = this.g.grant(r.reward); // on the card that follows, not the end screen as well
      this.g.ui.celebrate([
        {
          kicker: `${r.streak} day${r.streak === 1 ? '' : 's'} in a row`,
          icon: FLAG_ICON,
          name: 'daily streak',
          lines: [
            ...lines,
            r.streak < CONFIG.daily.streak.length ? `tomorrow: ${rewardText(streakReward(r.streak + 1))}` : 'the top of the ladder: keep it going',
          ],
        },
      ]);
    }
    return { best: r.best, isNew: r.isNew };
  }

  /** Coast on for a moment after the finish, then show the results. */
  updateFinished(dt: number): void {
    this.g.finishMs += dt * 1000;
    this.g.speed *= 1 - Math.min(1, dt * 1.5);
    this.g.world.advance(dt, this.g.speed, 0);
    this.g.world.sync();
    this.g.trail.update(dt, 0, this.g.player.engineHalfSpan);
    this.g.player.update(dt, 0, 0, 0);
    this.g.feedAudio(dt, false, this.g.speed);
    if (!this.g.overShown && this.g.finishMs > 900) {
      this.g.overShown = true;
      this.g.ui.showHud(false);
      this.g.ui.hideBanner();
      this.g.ui.show('over');
    }
  }

  startCourse(index: number): void {
    const c = COURSES[index];
    if (!c) return;
    this.g.beginRun(0, c.seed, 'solo', c);
  }
}
