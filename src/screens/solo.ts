import { COURSES, type Environment, ENVIRONMENTS } from '../world/courses';
import { envStatus, nextEnvironment, newlyOpened } from '../progression/unlocks';
import type { Game } from '../core/game';
import { formatTime } from '../ui/format';

export class SoloScreen {
  constructor(private readonly g: Game) {}

  /** A ranked or endless run reached `level`: remember it, and say so when it opens a solo environment. */
  noteReached(level: number): void {
    const before = this.g.progress.reachedLevel(level);
    const opened = newlyOpened(before, level);
    if (opened.length > 0) this.g.ui.showNotice(`solo unlocked: ${opened.map((e) => e.name).join(', ')}`);
  }

  /** Is this solo environment open to fly? */
  envOpen(env: Environment): boolean {
    return this.g.allOpen || envStatus(env, this.g.progress.furthest).open;
  }

  /** Solo: pick an environment (endless in it, with a high score each) or a set level. */
  openSolo(): void {
    const furthest = this.g.progress.furthest;
    const next = this.g.allOpen ? null : nextEnvironment(furthest);
    this.g.ui.renderEnvironments(
      ENVIRONMENTS.map((e, i) => {
        const st = envStatus(e, furthest);
        const locked = !this.envOpen(e);
        return {
          index: i,
          name: e.name,
          best: this.g.progress.envBest[e.id] ?? 0,
          locked,
          need: locked ? `reach level ${st.level} in ranked or endless` : '',
          toGo: locked ? `${st.toGo} level${st.toGo === 1 ? '' : 's'} to go` : '',
          fraction: st.fraction,
        };
      }),
      next
        ? `next to unlock: ${next.env.name}, ${next.status.toGo} level${next.status.toGo === 1 ? '' : 's'} to go. environments open as you reach them in ranked or endless (you're furthest at level ${furthest}).`
        : 'every environment is open. pick a place and see how far you get: it stays there and keeps getting harder.',
    );
    this.openCourses();
    this.g.openInfo('solo');
  }

  private openCourses(): void {
    const tiles = COURSES.map((c, i) => {
      const r = this.g.progress.course(c.id);
      const prev = i === 0 ? null : this.g.progress.course(COURSES[i - 1].id);
      const locked = !(i === 0 || (prev && prev.stars & 1)) && !this.g.allOpen;
      return {
        index: i,
        name: c.name,
        stars: r.stars,
        time: locked ? `finish ${COURSES[i - 1].name}` : r.time > 0 ? formatTime(r.time) : '',
        locked,
      };
    });
    const stars = COURSES.reduce((n, c) => n + [1, 2, 4].filter((b) => this.g.progress.course(c.id).stars & b).length, 0);
    this.g.ui.renderCourses(tiles, `${stars} of ${COURSES.length * 3} stars`);
  }
}
