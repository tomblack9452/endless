import { CONFIG } from './config';
import { label, type SettingKey, type Settings } from './settings';

export type ScreenName = 'title' | 'paused' | 'over' | 'settings' | 'stats' | 'missions' | 'hangar' | 'record';

/** Everything the service record screen shows. */
export interface RecordView {
  icon: string; // insignia SVG
  rank: string;
  next: string;
  xpFraction: number; // 0..1 towards the next rank
  rows: [string, string][];
  runs: [string, string][];
  ladder: { icon: string; name: string; needs: string; state: 'done' | 'current' | 'locked' }[];
}

/** The rank block on the game-over screen. */
export interface RankResultView {
  icon: string;
  rank: string;
  promoted: boolean;
  xpFraction: number;
  lines: string[];
}

const fmt = new Intl.NumberFormat('en-US');

export function formatScore(n: number): string {
  return fmt.format(Math.floor(n));
}

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

export class UI {
  private readonly hud = $('hud');
  private readonly hudScore = $('hud-score');
  private readonly hudLevel = $('hud-level');
  private readonly hudProgress = $('hud-progress');
  private readonly banner = $('level-banner');
  private readonly bannerNum = $('banner-num');
  private readonly bannerTheme = $('banner-theme');
  private readonly roomLabel = $('room-label');
  private readonly notice = $('notice');
  private readonly hint = $('hint');
  readonly boostControl = $('hud-boost');
  private readonly combo = $('combo');
  private readonly comboCount = $('combo-count');
  private readonly comboLabel = $('combo-label');
  private readonly overStats = $('over-stats');
  private readonly boostBar = $('boost-bar');
  private readonly boostFill = $('boost-fill');
  private readonly boostPct = $('boost-pct');
  private shownFull = false;
  private shownBoost = -1;
  private shownReady = false;
  private shownActive = false;
  private shownProgress = -1;
  readonly pauseButton = $('hud-pause');
  readonly startButton = $('title-start');
  private readonly screens: Record<ScreenName, HTMLElement> = {
    title: $('screen-title'),
    paused: $('screen-paused'),
    over: $('screen-over'),
    settings: $('screen-settings'),
    stats: $('screen-stats'),
    missions: $('screen-missions'),
    hangar: $('screen-hangar'),
    record: $('screen-record'),
  };
  private readonly hudMode = $('hud-mode');
  private readonly overMode = $('over-mode');
  private readonly overRank = $('over-rank');
  readonly titleRank = $('title-rank');
  private readonly missionsRows = $('missions-rows');
  private readonly missionsNext = $('missions-next');
  private readonly hangarCount = $('hangar-count');
  private readonly overMissions = $('over-missions');
  private readonly hudPower = $('hud-power');
  private shownPower = '';
  private readonly statsRows = $('stats-rows');
  private readonly overExtra = $('over-extra');
  readonly titleSettings = $('title-settings');
  private readonly titleBest = $('title-best');
  private readonly overScore = $('over-score');
  private readonly overBest = $('over-best');

  private shownScore = -1;
  private shownLevel = -1;
  private textColor = '';

  constructor() {
    document.documentElement.style.setProperty('--fade', `${CONFIG.ui.fadeMs}ms`);
  }

  setTextColor(css: string): void {
    if (css === this.textColor) return;
    this.textColor = css;
    document.documentElement.style.setProperty('--text', css);
  }

  /** Colour of the margins beside the play column on wide screens. */
  setPageColor(css: string): void {
    document.body.style.backgroundColor = css;
  }

  show(screen: ScreenName | null): void {
    for (const key of Object.keys(this.screens) as ScreenName[]) {
      this.screens[key].classList.toggle('on', key === screen);
    }
    // Every screen but the title is a menu panel: the HUD hides behind it.
    document.getElementById('ui')?.classList.toggle('menu-open', screen !== null && screen !== 'title');
  }

  showHud(on: boolean): void {
    this.hud.classList.toggle('on', on);
  }

  setScore(score: number): void {
    const s = Math.floor(score);
    if (s === this.shownScore) return;
    this.shownScore = s;
    this.hudScore.textContent = fmt.format(s);
  }

  setLevel(level: number): void {
    if (level === this.shownLevel) return;
    this.shownLevel = level;
    this.hudLevel.textContent = String(level);
  }

  /** 0..1 progress through the current level. Only touches the DOM in 1% steps. */
  setProgress(p: number): void {
    const q = Math.floor(p * 100);
    if (q === this.shownProgress) return;
    this.shownProgress = q;
    this.hudProgress.style.transform = `scaleX(${q / 100})`;
  }

  /** Boost meter 0..1; `ready` = enough to start; `active` = boosting. */
  setBoost(meter: number, ready: boolean, active: boolean): void {
    const q = Math.floor(meter * 100);
    if (q !== this.shownBoost) {
      this.shownBoost = q;
      this.boostFill.style.transform = `scaleX(${q / 100})`;
      this.boostPct.textContent = `boost ${q}`;
      const full = q >= 100;
      if (full !== this.shownFull) {
        this.shownFull = full;
        this.boostBar.classList.toggle('full', full);
      }
    }
    if (ready !== this.shownReady) {
      this.shownReady = ready;
      this.boostControl.classList.toggle('ready', ready);
      this.boostBar.classList.toggle('ready', ready);
    }
    if (active !== this.shownActive) {
      this.shownActive = active;
      this.boostBar.classList.toggle('active', active);
    }
  }

  flashBoost(): void {
    this.boostBar.classList.remove('flash');
    void this.boostBar.offsetWidth; // restart the animation
    this.boostBar.classList.add('flash');
  }

  /** Show a near-miss chain of `count` that just paid `points`. */
  showCombo(count: number, points: number): void {
    this.comboCount.textContent = `x${count}`;
    this.comboLabel.textContent = `near miss +${points}`;
    this.combo.classList.add('on');
    this.combo.classList.remove('pop');
    void this.combo.offsetWidth; // restart the animation
    this.combo.classList.add('pop');
  }

  /**
   * Wire the pause menu and settings screen. `onAction` gets resume /
   * settings / menu / back; `onSetting` gets the tapped setting. Taps here
   * never reach the game's tap-to-start handler.
   */
  bindMenus(onAction: (action: string) => void, onSetting: (key: SettingKey) => void): void {
    const stop = (e: Event) => e.stopPropagation();
    for (const el of document.querySelectorAll<HTMLElement>('[data-action]')) {
      el.addEventListener('pointerdown', stop);
      el.addEventListener('click', () => onAction(el.dataset.action ?? ''));
    }
    for (const el of document.querySelectorAll<HTMLElement>('[data-setting]')) {
      el.addEventListener('pointerdown', stop);
      el.addEventListener('click', () => onSetting(el.dataset.setting as SettingKey));
    }
    this.titleSettings.addEventListener('pointerdown', stop);
    this.titleSettings.addEventListener('click', () => onAction('settings'));
  }

  renderSettings(s: Settings): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-setting]')) {
      const value = el.querySelector('.value');
      if (value) value.textContent = label(s, el.dataset.setting as SettingKey);
    }
  }
  /** Display settings that live on the page: text size, boost side, reduce motion. */
  setDisplay(textScale: number, boostLeft: boolean, reduceMotion: boolean): void {
    document.documentElement.style.setProperty('--ui-scale', String(textScale));
    document.body.classList.toggle('boost-left', boostLeft);
    document.body.classList.toggle('reduce-motion', reduceMotion);
  }

  /** Title links (start-from, daily run, stats). Taps on them never start a normal run. */
  bindTitleLinks(onLink: (name: string) => void): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-title]')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => onLink(el.dataset.title ?? ''));
    }
  }

  setTitleLink(name: string, text: string): void {
    const el = document.querySelector<HTMLElement>(`[data-title="${name}"]`);
    if (el) el.textContent = text;
  }

  renderStats(rows: [string, string][]): void {
    this.fillRows(this.statsRows, rows);
  }

  /** Missions screen: each mission with its progress, and what the next one unlocks. */
  renderMissions(rows: [string, string][], next: string): void {
    this.fillRows(this.missionsRows, rows);
    this.missionsNext.textContent = next;
  }

  /** Run mode under the level number and above the game-over score. */
  setMode(text: string): void {
    this.hudMode.textContent = text;
    this.overMode.textContent = text;
  }

  /** Rank badge on the title screen. */
  setTitleRank(icon: string, name: string, credits: string): void {
    $('title-rank-icon').innerHTML = icon;
    $('title-rank-name').textContent = name;
    $('title-credits').textContent = credits;
  }

  renderRecord(v: RecordView): void {
    $('record-icon').innerHTML = v.icon;
    $('record-rank').textContent = v.rank;
    $('record-next').textContent = v.next;
    $('record-xp').style.transform = `scaleX(${Math.max(0, Math.min(1, v.xpFraction))})`;
    this.fillRows($('record-rows'), v.rows);
    this.fillRows($('record-runs'), v.runs);
    $('record-ladder').replaceChildren(
      ...v.ladder.map((l) => {
        const row = document.createElement('div');
        row.className = `ladder-row ${l.state === 'locked' ? 'locked' : l.state === 'current' ? 'current' : ''}`;
        const icon = document.createElement('span');
        icon.className = 'insignia small';
        icon.innerHTML = l.icon;
        const name = document.createElement('span');
        name.className = 'label ladder-name';
        name.textContent = l.name;
        const needs = document.createElement('span');
        needs.className = 'label dim';
        needs.textContent = l.needs;
        row.append(icon, name, needs);
        return row;
      }),
    );
  }

  /** Rank result on the game-over screen (null clears it, e.g. solo runs). */
  setGameOverRank(v: RankResultView | null): void {
    this.overRank.classList.remove('promoted');
    if (!v) {
      this.overRank.replaceChildren();
      return;
    }
    const head = document.createElement('div');
    head.className = 'over-rank-head';
    const icon = document.createElement('span');
    icon.className = 'insignia';
    icon.innerHTML = v.icon;
    const text = document.createElement('div');
    text.style.textAlign = 'left';
    if (v.promoted) {
      const p = document.createElement('div');
      p.className = 'promoted-label';
      p.textContent = 'promoted';
      text.append(p);
    }
    const name = document.createElement('div');
    name.className = 'label';
    name.textContent = v.rank;
    text.append(name);
    head.append(icon, text);
    const track = document.createElement('div');
    track.className = 'xp-track';
    const fill = document.createElement('div');
    fill.className = 'xp-fill';
    track.append(fill);
    const lines = v.lines.map((l) => {
      const d = document.createElement('div');
      d.className = 'label dim';
      d.textContent = l;
      return d;
    });
    this.overRank.replaceChildren(head, track, ...lines);
    void this.overRank.offsetWidth;
    if (v.promoted) this.overRank.classList.add('promoted');
    // Fill after layout so the bar animates up.
    requestAnimationFrame(() => (fill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.xpFraction))})`));
  }

  /** Active power-up line in the HUD ('' hides it). */
  setPower(text: string): void {
    if (text === this.shownPower) return;
    this.shownPower = text;
    this.hudPower.textContent = text;
  }

  /** Mission progress under the game-over score. */
  setGameOverMissions(rows: [string, string][]): void {
    this.overMissions.replaceChildren(
      ...rows.map(([text, prog]) => {
        const line = document.createElement('div');
        line.className = 'over-mission';
        const a = document.createElement('span');
        a.textContent = text;
        const b = document.createElement('span');
        b.className = 'over-mission-progress';
        b.textContent = prog;
        line.append(a, b);
        return line;
      }),
    );
  }

  bindHangar(onPick: (kind: 'ship' | 'trail' | 'palette') => void): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-hangar]')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => onPick(el.dataset.hangar as 'ship' | 'trail' | 'palette'));
    }
  }

  /** Hangar values; a choice with only one option unlocked is shown dimmed. */
  renderHangar(values: Record<'ship' | 'trail' | 'palette', [string, number]>, count: string): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-hangar]')) {
      const [name, options] = values[el.dataset.hangar as 'ship' | 'trail' | 'palette'];
      const value = el.querySelector('.value');
      if (value) value.textContent = options > 1 ? `${name} (${options})` : name;
      el.classList.toggle('locked', options < 2);
    }
    this.hangarCount.textContent = count;
  }

  fillRows(into: HTMLElement, rows: [string, string][]): void {
    into.replaceChildren(
      ...rows.map(([k, v]) => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        const a = document.createElement('span');
        a.className = 'label';
        a.textContent = k;
        const b = document.createElement('span');
        b.className = 'label stat-value';
        b.textContent = v;
        row.append(a, b);
        return row;
      }),
    );
  }

  /** Extra line on the game-over screen (daily run, checkpoint). */
  setGameOverExtra(text: string): void {
    this.overExtra.textContent = text;
  }

  setSkyColor(css: string): void {
    document.documentElement.style.setProperty('--sky', css);
  }

  /** A short notice low on screen for a few seconds. */
  showNotice(text: string): void {
    this.notice.textContent = text;
    this.notice.classList.remove('show');
    void this.notice.offsetWidth; // restart the animation
    this.notice.classList.add('show');
  }

  /** A first-run hint in the middle of the screen. */
  showHint(text: string): void {
    this.hint.textContent = text;
    this.hint.classList.remove('show');
    void this.hint.offsetWidth; // restart the animation
    this.hint.classList.add('show');
  }

  /** Briefly show the name of the room just entered. */
  showRoom(name: string): void {
    this.roomLabel.textContent = name;
    this.roomLabel.classList.remove('show');
    void this.roomLabel.offsetWidth; // restart the animation
    this.roomLabel.classList.add('show');
  }

  hideCombo(): void {
    this.combo.classList.remove('on');
  }

  announceLevel(level: number, theme: string): void {
    this.bannerNum.textContent = String(level);
    this.bannerTheme.textContent = theme;
    this.banner.classList.remove('show');
    void this.banner.offsetWidth; // restart the animation
    this.banner.classList.add('show');
  }

  hideBanner(): void {
    this.banner.classList.remove('show');
  }

  setBest(best: number): void {
    const text = best > 0 ? `best ${formatScore(best)}` : '';
    this.titleBest.textContent = text;
  }

  setGameOver(score: number, best: number, isNewBest: boolean, nearMisses: number, bestCombo: number, seed: number): void {
    this.overStats.textContent =
      (nearMisses > 0 ? `near misses ${nearMisses}, best chain x${bestCombo}` : 'no near misses') +
      (import.meta.env.DEV ? ` · seed ${seed}` : ''); // dev builds: for reporting a layout
    this.overScore.textContent = formatScore(score);
    this.overBest.textContent = isNewBest ? 'new best' : `best ${formatScore(best)}`;
  }
}
