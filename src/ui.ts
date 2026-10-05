import { CONFIG } from './config';
import { label, type SettingKey, type Settings } from './settings';

export type ScreenName = 'title' | 'paused' | 'over' | 'settings' | 'stats' | 'missions' | 'hangar' | 'record' | 'solo' | 'league' | 'shop' | 'pass' | 'daily';

/** Everything the league screen shows. */
/** The service record and league screens share one layout. */
export interface ProgressView {
  icon: string;
  name: string;
  /** The headline: how much is left to the next step. */
  big: string; // e.g. "1,240"
  goal: string; // e.g. "xp to sergeant"
  fraction: number; // 0..1 along the bar
  detail: string; // e.g. "250 / 1,490 xp"
  /** Other things the next step needs, each met or not. */
  checks: { label: string; value: string; met: boolean }[];
  /** What the next steps give. */
  gives: { title: string; items: string[] }[];
  /** Recent runs, oldest first (xp earned, or lp won and lost). */
  trend: { title: string; values: number[]; summary: string; unit: string };
  rows: [string, string][];
  ladder: { icon: string; name: string; needs: string; gives: string; state: 'done' | 'current' | 'locked' }[];
}

/** A promotion, shown big over the end-of-run screen. */
export interface Celebration {
  kicker: string; // "promoted"
  icon: string;
  name: string;
  lines: string[];
  color?: string; // league colour for the glow
}

/** One row on the hangar's ship tab. */
export interface LookRow {
  key: string;
  label: string;
  value: string;
  locked: boolean;
  note: string; // how to unlock, when locked
}

/** One row on the upgrades tab. */
export interface UpgradeRow {
  id: string;
  name: string;
  effect: string;
  tier: number;
  max: number;
  button: string;
  canBuy: boolean;
  on: boolean | null; // switch state once bought, null before
}

/** One tile on the set levels grid. */
export interface CourseTile {
  index: number;
  name: string;
  stars: number;
  time: string;
  locked: boolean;
}

/** One tile on the sector map. */
export interface SectorTile {
  index: number;
  name: string;
  levels: string;
  stars: number; // star bits
  locked: boolean;
}

/** Everything the service record screen shows. */
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
    solo: $('screen-sectors'),
    league: $('screen-league'),
    shop: $('screen-shop'),
    pass: $('screen-pass'),
    daily: $('screen-daily'),
  };
  readonly titleLeague = $('title-league');
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
  private readonly rankedSub = $('title-ranked-sub');
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
      this.boostPct.textContent = String(q);
      this.boostControl.style.setProperty('--meter', String(q / 100));
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
      this.boostControl.classList.toggle('active', active);
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
  setDisplay(textScale: number, boostSide: 'right' | 'left' | 'middle', reduceMotion: boolean): void {
    document.documentElement.style.setProperty('--ui-scale', String(textScale));
    document.body.classList.toggle('boost-left', boostSide === 'left');
    document.body.classList.toggle('boost-middle', boostSide === 'middle');
    document.body.classList.toggle('reduce-motion', reduceMotion);
  }

  /** Title links (start-from, daily run, stats). Taps on them never start a normal run. */
  bindTitleLinks(onLink: (name: string) => void): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-title]')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => onLink(el.dataset.title ?? ''));
    }
  }

  /** The line under the ranked button: this week's level and your best on it. */
  setRankedSub(text: string): void {
    this.rankedSub.textContent = text;
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

  bindHangarTabs(onTab: (tab: 'ship' | 'upgrades') => void): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tab]')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => onTab(el.dataset.tab as 'ship' | 'upgrades'));
    }
  }

  /** Show a hangar tab. The ship tab leaves the lower screen clear to see the ship. */
  setHangarTab(tab: 'ship' | 'upgrades', credits: string): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-tab]')) el.classList.toggle('on', el.dataset.tab === tab);
    for (const el of document.querySelectorAll<HTMLElement>('[data-pane]')) el.hidden = el.dataset.pane !== tab;
    this.screens.hangar.classList.toggle('top', tab === 'ship');
    $('hangar-credits').textContent = credits;
  }

  bindUpgrades(onBuy: (id: string) => void, onToggle: (id: string) => void): void {
    const rows = $('upgrade-rows');
    rows.addEventListener('pointerdown', (e) => e.stopPropagation());
    rows.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const toggle = target.closest<HTMLButtonElement>('button[data-toggle]');
      if (toggle) {
        onToggle(toggle.dataset.toggle ?? '');
        return;
      }
      const b = target.closest<HTMLButtonElement>('button[data-upgrade]');
      if (b && !b.disabled) onBuy(b.dataset.upgrade ?? '');
    });
  }

  renderUpgrades(rows: UpgradeRow[]): void {
    $('upgrade-rows').replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement('div');
        row.className = 'upgrade-row';
        const info = document.createElement('div');
        info.className = 'upgrade-info';
        const name = document.createElement('div');
        name.className = 'label';
        name.textContent = r.name;
        const effect = document.createElement('div');
        effect.className = 'label dim upgrade-effect';
        effect.textContent = r.effect;
        const pips = document.createElement('div');
        pips.className = 'pips';
        pips.textContent = '●'.repeat(r.tier) + '○'.repeat(r.max - r.tier);
        info.append(name, pips, effect);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `pill small${r.canBuy ? ' primary' : ''}`;
        b.dataset.upgrade = r.id;
        b.disabled = !r.canBuy;
        b.textContent = r.button;
        row.append(info);
        if (r.on !== null) {
          const t = document.createElement('button');
          t.type = 'button';
          t.className = `pill small toggle${r.on ? ' on' : ''}`;
          t.dataset.toggle = r.id;
          t.textContent = r.on ? 'on' : 'off';
          t.setAttribute('aria-pressed', String(r.on));
          row.append(t);
        }
        if (r.button !== 'maxed') row.append(b); // a maxed system just shows its full pips
        if (r.on === false) row.classList.add('switched-off');
        return row;
      }),
    );
  }

  bindSolo(onCourse: (index: number) => void, onEnv: (index: number) => void): void {
    const envs = $('env-grid');
    envs.addEventListener('pointerdown', (e) => e.stopPropagation());
    envs.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.course-tile');
      if (tile) onEnv(Number(tile.dataset.env));
    });
    for (const el of document.querySelectorAll<HTMLElement>('[data-solotab]')) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', () => this.setSoloTab(el.dataset.solotab as 'levels' | 'envs'));
    }
    const grid = $('courses-grid');
    grid.addEventListener('pointerdown', (e) => e.stopPropagation());
    grid.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.course-tile');
      if (tile && !tile.classList.contains('locked')) onCourse(Number(tile.dataset.course));
    });
  }

  /** Solo environments: a tile each with its high score. */
  renderEnvironments(tiles: { index: number; name: string; best: number }[]): void {
    const grid = document.createElement('div');
    grid.className = 'course-grid';
    for (const t of tiles) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'course-tile';
      b.dataset.env = String(t.index);
      const name = document.createElement('span');
      name.className = 'course-name';
      name.textContent = t.name;
      const best = document.createElement('span');
      best.className = 'course-time';
      best.textContent = t.best > 0 ? `best ${formatScore(t.best)}` : 'no runs yet';
      b.append(name, best);
      grid.append(b);
    }
    $('env-grid').replaceChildren(grid);
  }

  setSoloTab(tab: 'levels' | 'envs'): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-solotab]')) el.classList.toggle('on', el.dataset.solotab === tab);
    for (const el of document.querySelectorAll<HTMLElement>('[data-solopane]')) el.hidden = el.dataset.solopane !== tab;
  }

  renderCourses(tiles: CourseTile[], summary: string): void {
    $('courses-summary').textContent = summary;
    const grid = document.createElement('div');
    grid.className = 'course-grid';
    for (const t of tiles) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `course-tile${t.locked ? ' locked' : ''}`;
      b.dataset.course = String(t.index);
      const num = document.createElement('span');
      num.className = 'course-num';
      num.textContent = String(t.index + 1);
      const name = document.createElement('span');
      name.className = 'course-name';
      name.textContent = t.locked ? 'locked' : t.name;
      const stars = document.createElement('span');
      stars.className = 'sector-stars';
      stars.textContent = [1, 2, 4].map((bit) => (t.stars & bit ? '★' : '☆')).join('');
      const time = document.createElement('span');
      time.className = 'course-time';
      time.textContent = t.time;
      b.append(num, name, stars, time);
      grid.append(b);
    }
    $('courses-grid').replaceChildren(grid);
  }

  setOverHeading(text: string): void {
    $('over-heading').textContent = text;
  }

  /** Taps on unlocked sector tiles call `onPick` with the sector index. */
  bindSectors(onPick: (sector: number) => void): void {
    const grid = $('sectors-grid');
    grid.addEventListener('pointerdown', (e) => e.stopPropagation());
    grid.addEventListener('click', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.sector');
      if (tile && !tile.classList.contains('locked')) onPick(Number(tile.dataset.sector));
    });
  }

  renderSectors(tiles: SectorTile[], summary: string): void {
    $('sectors-summary').textContent = summary;
    const rows: HTMLElement[] = [];
    for (let i = 0; i < tiles.length; i += 3) {
      const head = document.createElement('div');
      head.className = 'settings-group sector-loop';
      head.textContent = `loop ${i / 3 + 1}`;
      const row = document.createElement('div');
      row.className = 'sector-row';
      for (const t of tiles.slice(i, i + 3)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `sector${t.locked ? ' locked' : ''}`;
        b.dataset.sector = String(t.index);
        const name = document.createElement('span');
        name.className = 'sector-name';
        name.textContent = t.locked ? 'locked' : t.name;
        const levels = document.createElement('span');
        levels.className = 'sector-levels';
        levels.textContent = t.levels;
        const stars = document.createElement('span');
        stars.className = 'sector-stars';
        stars.textContent = [1, 2, 4].map((bit) => (t.stars & bit ? '★' : '☆')).join('');
        b.append(name, levels, stars);
        row.append(b);
      }
      rows.push(head, row);
    }
    $('sectors-grid').replaceChildren(...rows);
  }

  /** League badge on the title screen. */
  setTitleLeague(icon: string, name: string, lpFraction: number): void {
    $('title-league-icon').innerHTML = icon;
    $('title-league-name').textContent = name;
    $('title-league-lp').style.transform = `scaleX(${Math.max(0, Math.min(1, lpFraction))})`;
  }

  setUpgradeNote(text: string): void {
    $('upgrade-note').textContent = text;
  }

  /** Fill the record ('record') or league ('league') screen. */
  renderProgress(p: 'record' | 'league', v: ProgressView): void {
    $(`${p}-icon`).innerHTML = v.icon;
    $(`${p}-name`).textContent = v.name;
    $(`${p}-big`).textContent = v.big;
    $(`${p}-goal`).textContent = v.goal;
    $(`${p}-detail`).textContent = v.detail;
    const fill = $(`${p}-fill`);
    fill.style.transform = 'scaleX(0)';
    requestAnimationFrame(() => (fill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.fraction))})`));

    $(`${p}-checks`).replaceChildren(
      ...v.checks.map((k) => {
        const row = el('div', `prog-check ${k.met ? 'met' : ''}`);
        row.append(el('span', 'prog-check-mark', k.met ? '✓' : '○'), el('span', 'label', k.label), el('span', 'label prog-check-value', k.value));
        return row;
      }),
    );

    $(`${p}-gives`).replaceChildren(
      ...v.gives.map((g) => {
        const card = el('div', 'prog-card');
        card.append(el('div', 'label dim prog-card-title', g.title));
        for (const item of g.items) card.append(el('div', 'label prog-card-item', item));
        return card;
      }),
    );

    const trend = $(`${p}-trend`);
    const t = v.trend;
    const head = el('div', 'prog-trend-head');
    head.append(el('span', 'label dim', t.title), el('span', 'label', t.summary));
    trend.replaceChildren(head, t.values.length ? bars(t.values, t.unit) : el('div', 'label dim prog-empty', 'no ranked runs yet'));

    this.fillRows($(`${p}-rows`), v.rows);

    const ladder = $(`${p}-ladder`);
    let current: HTMLElement | null = null;
    ladder.replaceChildren(
      ...v.ladder.map((l) => {
        const row = el('div', `ladder-row ${l.state}`);
        const icon = el('span', 'insignia small');
        icon.innerHTML = l.icon;
        const text = el('div', 'ladder-text');
        const top = el('div', 'ladder-top');
        top.append(el('span', 'label ladder-name', l.name));
        if (l.state === 'current') top.append(el('span', 'ladder-you', 'you'));
        else if (l.state === 'done') top.append(el('span', 'ladder-done', '✓'));
        text.append(top, el('div', 'label dim ladder-needs', l.needs));
        if (l.gives) text.append(el('div', 'label ladder-gives', l.gives));
        row.append(icon, text);
        if (l.state === 'current') current = row;
        return row;
      }),
    );
    // Open the ladder at your place in it.
    requestAnimationFrame(() => {
      const row = current as HTMLElement | null;
      if (row) ladder.scrollTop = row.offsetTop - ladder.offsetTop - ladder.clientHeight / 2 + row.clientHeight / 2;
    });
  }

  /** Show promotions one after another; each tap moves on. */
  celebrate(items: Celebration[]): void {
    this.promoQueue.push(...items);
    if (!this.promo.classList.contains('show')) this.nextPromo();
  }

  private readonly promo = $('promo');
  private promoQueue: Celebration[] = [];
  private promoShownAt = 0;

  private nextPromo(): void {
    const v = this.promoQueue.shift();
    if (!v) {
      this.promo.classList.remove('show');
      return;
    }
    $('promo-kicker').textContent = v.kicker;
    $('promo-icon').innerHTML = v.icon;
    $('promo-name').textContent = v.name;
    $('promo-lines').replaceChildren(...v.lines.map((l) => el('div', 'label', l)));
    this.promo.style.setProperty('--promo', v.color ?? 'var(--text)');
    this.promo.classList.remove('show');
    void this.promo.offsetWidth; // restart the animation
    this.promo.classList.add('show');
    this.promoShownAt = performance.now();
  }

  /** Drop any promotions still showing (a new run is starting). */
  clearCelebration(): void {
    this.promoQueue = [];
    this.promo.classList.remove('show');
  }

  /** Taps on the promotion never reach the game (so they can't start a retry). */
  bindCelebration(): void {
    const stop = (e: Event) => e.stopPropagation();
    this.promo.addEventListener('pointerdown', stop);
    this.promo.addEventListener('click', (e) => {
      e.stopPropagation();
      // A short pause first, so a tap meant for the crash screen doesn't skip it unseen.
      if (performance.now() - this.promoShownAt > 600) this.nextPromo();
    });
  }

  /** Rank badge on the title screen. */
  setTitleRank(icon: string, name: string, credits: string): void {
    $('title-rank-icon').innerHTML = icon;
    $('title-rank-name').textContent = name;
    $('title-credits').textContent = credits;
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

  /** Ship tab: a row tap cycles that slot; the buy button buys what's being previewed. */
  bindLooks(onRow: (key: string) => void, onBuy: () => void): void {
    const rows = $('look-rows');
    rows.addEventListener('pointerdown', (e) => e.stopPropagation());
    rows.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-look]');
      if (row) onRow(row.dataset.look ?? '');
    });
    const buy = $('look-buy');
    buy.addEventListener('pointerdown', (e) => e.stopPropagation());
    buy.addEventListener('click', () => onBuy());
  }

  renderLooks(rows: LookRow[], buy: { text: string; enabled: boolean } | null, note: string): void {
    $('look-rows').replaceChildren(
      ...rows.map((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'setting-row';
        b.dataset.look = r.key;
        const name = document.createElement('span');
        name.className = 'label';
        name.textContent = r.label;
        const value = document.createElement('span');
        value.className = `value${r.locked ? ' locked' : ''}`;
        value.textContent = r.locked ? `${r.value} · ${r.note}` : r.value;
        b.append(name, value);
        return b;
      }),
    );
    const btn = $('look-buy') as HTMLButtonElement;
    btn.hidden = !buy;
    if (buy) {
      btn.textContent = buy.text;
      btn.disabled = !buy.enabled;
    }
    this.hangarCount.textContent = note;
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

  /** Title screen bests, by label (zeros are left out). */
  setBests(bests: [string, number][]): void {
    const parts = bests.filter(([, v]) => v > 0).map(([k, v]) => `${k} ${formatScore(v)}`);
    this.titleBest.textContent = parts.length ? `best: ${parts.join(' · ')}` : '';
  }

  setGameOver(score: number, best: number, isNewBest: boolean, nearMisses: number, bestCombo: number, seed: number): void {
    this.overStats.textContent =
      (nearMisses > 0 ? `near misses ${nearMisses}, best chain x${bestCombo}` : 'no near misses') +
      ` · seed ${seed}`; // for reporting a layout
    this.overScore.textContent = formatScore(score);
    this.overBest.textContent = isNewBest ? 'new best' : `best ${formatScore(best)}`;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** A small bar chart of recent runs: bars up for gains, down for losses. */
function bars(values: number[], unit: string): HTMLElement {
  const box = el('div', 'trend-bars');
  const max = Math.max(1, ...values.map(Math.abs));
  const signed = values.some((v) => v < 0);
  box.classList.toggle('signed', signed);
  for (const v of values) {
    const bar = el('span', `trend-bar ${v < 0 ? 'down' : ''}`);
    bar.style.setProperty('--h', String(Math.abs(v) / max));
    bar.title = `${v > 0 ? '+' : ''}${v} ${unit}`;
    box.append(bar);
  }
  return box;
}
