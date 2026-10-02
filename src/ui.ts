import { CONFIG } from './config';
import { label, type SettingKey, type Settings } from './settings';

export type ScreenName = 'title' | 'paused' | 'over' | 'settings';

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
  };
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

  setGameOver(score: number, best: number, isNewBest: boolean, nearMisses: number, bestCombo: number): void {
    this.overStats.textContent =
      nearMisses > 0 ? `near misses ${nearMisses}, best chain x${bestCombo}` : 'no near misses';
    this.overScore.textContent = formatScore(score);
    this.overBest.textContent = isNewBest ? 'new best' : `best ${formatScore(best)}`;
  }
}
