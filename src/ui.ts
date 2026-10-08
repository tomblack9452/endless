import { CONFIG } from './config';
import { label, type SettingKey, type Settings } from './settings';

export type ScreenName = 'title' | 'paused' | 'over' | 'settings' | 'goals' | 'hangar' | 'record' | 'solo' | 'league' | 'shop' | 'store' | 'pass' | 'boards' | 'welcome' | 'name';

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

/** One row on the hangar's upgrades tab. */
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

/** One solo environment tile: open (with its best) or locked (with what opens it). */
export interface EnvTile {
  index: number;
  name: string;
  best: number;
  locked: boolean;
  need: string;
  toGo: string;
  fraction: number; // 0..1 towards the unlock
}

/** A live card on the title screen. */
export interface TitleCard {
  id: string;
  kicker: string;
  title: string;
  fraction?: number;
  /** Something to claim or do now. */
  hot?: boolean;
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
  private boardPictures = 0; // which board the ship pictures being drawn belong to
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
    goals: $('screen-goals'),
    hangar: $('screen-hangar'),
    welcome: $('screen-welcome'),
    name: $('screen-name'),
    record: $('screen-record'),
    solo: $('screen-sectors'),
    league: $('screen-league'),
    shop: $('screen-shop'),
    store: $('screen-store'),
    pass: $('screen-pass'),
    boards: $('screen-boards'),
  };
  readonly titleLeague = $('title-league');
  private readonly hudMode = $('hud-mode');
  private readonly overMode = $('over-mode');
  private readonly overRank = $('over-rank');
  readonly titleRank = $('title-rank');
  private readonly hudPower = $('hud-power');
  private shownPower = '';
  private readonly statsRows = $('stats-rows');
  private readonly overExtra = $('over-extra');
  readonly titleSettings = $('title-settings');
  private readonly rankedSub = $('title-ranked-sub');
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

  /** The big button: ranked (its name and the line under it), or for new players, endless. */
  setPrimary(name: string, sub: string): void {
    $('title-ranked-name').textContent = name;
    this.rankedSub.textContent = sub;
  }

  /** Show only what's open (data-feature on the title's buttons); a modes row with nothing in it goes. */
  setFeatures(open: (feature: string) => boolean): void {
    for (const el of document.querySelectorAll<HTMLElement>('#screen-title [data-feature]')) el.hidden = !open(el.dataset.feature ?? '');
    const modes = document.querySelector<HTMLElement>('#screen-title .title-modes');
    if (modes) modes.hidden = [...modes.children].every((c) => (c as HTMLElement).hidden);
  }

  setTitleNext(text: string): void {
    $('title-next').textContent = text;
  }

  /** The live cards above the big button. Taps call the title link named by each card's id. */
  renderTitleCards(cards: TitleCard[]): void {
    $('title-cards').replaceChildren(
      ...cards.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `live-card${c.hot ? ' hot' : ''}`;
        b.dataset.card = c.id;
        const k = document.createElement('span');
        k.className = 'kicker label';
        k.textContent = c.kicker;
        const t = document.createElement('span');
        t.className = 'title label';
        t.textContent = c.title;
        b.append(k, t);
        if (c.fraction !== undefined) {
          const track = document.createElement('span');
          track.className = 'xp-track';
          const fill = document.createElement('span');
          fill.className = 'xp-fill';
          fill.style.transform = `scaleX(${Math.max(0, Math.min(1, c.fraction))})`;
          track.append(fill);
          b.append(track);
        }
        return b;
      }),
    );
  }

  // --- first launch ---

  bindWelcome(on: { control: (id: string) => void; practice: () => void; skip: () => void; pick: (key: string) => void; done: () => void }): void {
    const stop = (e: Event) => e.stopPropagation();
    $('screen-welcome').addEventListener('pointerdown', stop);
    $('screen-name').addEventListener('pointerdown', stop);
    $('tutorial').addEventListener('pointerdown', stop);
    $('welcome-controls').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-control]');
      if (b) on.control(b.dataset.control ?? '');
    });
    for (const id of ['welcome-hull', 'welcome-paint', 'welcome-engine'])
      $(id).addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-look]');
        if (b) on.pick(b.dataset.look ?? '');
      });
    $('welcome-practice').addEventListener('click', on.practice);
    $('welcome-skip').addEventListener('click', on.skip);
    $('tutorial-skip').addEventListener('click', on.skip);
    $('welcome-done').addEventListener('click', on.done);
  }

  /** The welcome screen: choosing controls, or dressing the ship (chips: [key, label, on]). */
  renderWelcome(step: 'controls' | 'dress', controls: [string, string, boolean][], dress: Record<'hull' | 'paint' | 'engine', [string, string, boolean][]>): void {
    $('welcome-title').textContent = step === 'controls' ? 'welcome, pilot' : 'dress your ship';
    for (const p of document.querySelectorAll<HTMLElement>('[data-welcome]')) p.hidden = p.dataset.welcome !== step;
    const chips = (into: string, list: [string, string, boolean][], attr: string) =>
      $(into).replaceChildren(
        ...list.map(([key, label, on]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `tab${on ? ' on' : ''}`;
          b.textContent = label;
          b.dataset[attr] = key;
          return b;
        }),
      );
    chips('welcome-controls', controls, 'control');
    chips('welcome-hull', dress.hull, 'look');
    chips('welcome-paint', dress.paint, 'look');
    chips('welcome-engine', dress.engine, 'look');
  }

  /** The practice run's prompt (null hides it). */
  showTutorial(text: string | null, step = ''): void {
    $('tutorial').hidden = text === null;
    if (text !== null) {
      $('tutorial-text').textContent = text;
      $('tutorial-step').textContent = step;
    }
  }

  bindTitleCards(onCard: (id: string) => void): void {
    const box = $('title-cards');
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    box.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-card]');
      if (card) onCard(card.dataset.card ?? '');
    });
  }

  // --- leaderboard screen ---------------------------------------------------------

  /** Wire the tabs and the name box. Taps and keys here never start a run. */
  bindBoards(tabs: readonly { id: string; label: string }[], onTab: (id: string) => void, onName: (name: string) => void): void {
    const bar = $('board-tabs');
    bar.addEventListener('pointerdown', (e) => e.stopPropagation());
    bar.replaceChildren(
      ...tabs.map((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tab';
        b.dataset.board = t.id;
        b.textContent = t.label;
        b.addEventListener('click', () => onTab(t.id));
        return b;
      }),
    );
    this.bindNameBox('board', onName);
  }

  /** A pilot name box ("board", "settings"): its save button and Enter both send the name. */
  bindNameBox(box: string, onName: (name: string) => void): void {
    const input = $(`${box}-name`) as HTMLInputElement;
    const save = $(`${box}-name-save`);
    for (const el of [input, save]) el.addEventListener('pointerdown', (e) => e.stopPropagation());
    save.addEventListener('click', () => onName(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onName(input.value);
    });
  }

  /** Mark a tab as the open one (scrolling it into view). */
  setBoardTab(id: string): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-board]')) {
      const on = el.dataset.board === id;
      el.classList.toggle('on', on);
      if (on) el.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  }

  /** The board's rows: rank, name, score. A pilot below the top comes after a gap. */
  renderLeaderboard(
    caption: string,
    rows: { rank: number; name: string; score: string; you: boolean; premium?: boolean; picture?: (() => string | null) | null; looks?: string }[],
    status: string,
  ): void {
    $('board-caption').textContent = caption;
    $('board-status').textContent = status;
    const out: HTMLElement[] = [];
    const pictures: [HTMLImageElement, () => string | null][] = [];
    let last = 0;
    for (const r of rows) {
      if (last > 0 && r.rank > last + 1) {
        const gap = document.createElement('div');
        gap.className = 'board-gap label';
        gap.textContent = '···';
        out.push(gap);
      }
      last = r.rank;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `board-row label${r.you ? ' you' : ''}`;
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = r.rank > 0 ? String(r.rank) : '–';
      const ship = document.createElement('img');
      ship.className = 'board-ship';
      ship.alt = '';
      if (r.picture) pictures.push([ship, r.picture]);
      else ship.classList.add('none');
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = r.you && r.name !== 'you' ? `${r.name} (you)` : r.name;
      if (r.premium) {
        const badge = document.createElement('span');
        badge.className = 'premium-badge';
        badge.title = 'premium';
        badge.textContent = '◆';
        who.append(badge);
      }
      const score = document.createElement('span');
      score.className = 'pts';
      score.textContent = r.score;
      row.append(rank, ship, who, score);
      // Tap a pilot to see their ship bigger, and what's on it.
      if (r.picture) {
        const more = document.createElement('div');
        more.className = 'board-more';
        more.hidden = true;
        const big = document.createElement('img');
        big.alt = '';
        const looks = document.createElement('div');
        looks.className = 'label dim';
        looks.textContent = r.looks ?? '';
        more.append(big, looks);
        row.addEventListener('click', () => {
          more.hidden = !more.hidden;
          big.src = ship.src;
        });
        out.push(row, more);
      } else out.push(row);
    }
    $('board-rows').replaceChildren(...out);
    // Draw the ships a few a frame, so a long board opens at once.
    const seq = ++this.boardPictures;
    const step = () => {
      if (seq !== this.boardPictures) return;
      for (const [img, draw] of pictures.splice(0, 4)) {
        const url = draw();
        if (url) img.src = url;
        else img.classList.add('none');
      }
      if (pictures.length > 0) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** A pilot name box ("board", "settings", "name"): its current value and a line under it. */
  setPilotName(name: string, note: string, box = 'board'): void {
    const input = $(`${box}-name`) as HTMLInputElement;
    if (name && document.activeElement !== input) input.value = name;
    const n = document.getElementById(`${box}-name-note`);
    if (n) n.textContent = note;
  }

  /** The league screen's weekly leaderboard. */
  renderBoard(rows: [string, string][], note: string): void {
    this.fillRows($('league-board'), rows);
    $('league-board-note').textContent = note;
  }

  /** The share button on the end screen (ranked runs). */
  showShare(on: boolean): void {
    $('over-share').hidden = !on;
  }

  /** The end screen's "double credits" offer (a rewarded ad, or free with premium); null hides it. */
  showDouble(text: string | null): void {
    const b = $('over-double') as HTMLButtonElement;
    b.hidden = text === null;
    b.disabled = false;
    if (text) b.textContent = text;
  }

  /** After doubling: the end screen says the doubled amount, and the button says it's done. */
  markDoubled(before: string, after: string): void {
    for (const id of ['over-stats', 'over-extra', 'over-best']) {
      const el = $(id);
      if (el.children.length === 0 && el.textContent?.includes(`+${before} credits`)) el.textContent = el.textContent.replace(`+${before} credits`, `+${after} credits (doubled)`);
    }
    const b = $('over-double') as HTMLButtonElement;
    b.hidden = false;
    b.disabled = true;
    b.textContent = `doubled · +${after} credits`;
  }

  bindRecordTabs(onTab: (tab: 'rank' | 'stats') => void): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-recordtab]')) {
      t.addEventListener('pointerdown', (e) => e.stopPropagation());
      t.addEventListener('click', () => onTab(t.dataset.recordtab as 'rank' | 'stats'));
    }
  }

  /** The service record's tabs: your rank, and your lifetime stats. */
  setRecordTab(tab: 'rank' | 'stats'): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-recordtab]')) t.classList.toggle('on', t.dataset.recordtab === tab);
    for (const p of document.querySelectorAll<HTMLElement>('[data-recordpane]')) p.hidden = p.dataset.recordpane !== tab;
  }

  renderStats(rows: [string, string][]): void {
    this.fillRows(this.statsRows, rows);
  }

  /** Run mode under the level number and above the game-over score. */
  setMode(text: string): void {
    this.hudMode.textContent = text;
    this.overMode.textContent = text;
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
      if (tile && !tile.classList.contains('locked')) onEnv(Number(tile.dataset.env));
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

  /** Solo environments: a tile each with its high score, or what opens it and how far off that is. */
  renderEnvironments(tiles: EnvTile[], note: string): void {
    $('env-note').textContent = note;
    const grid = document.createElement('div');
    grid.className = 'course-grid';
    for (const t of tiles) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `course-tile${t.locked ? ' locked' : ''}`;
      b.dataset.env = String(t.index);
      const name = document.createElement('span');
      name.className = 'course-name';
      name.textContent = t.name;
      b.append(name);
      if (t.locked) {
        const need = document.createElement('span');
        need.className = 'course-need';
        need.textContent = t.need;
        const bar = document.createElement('span');
        bar.className = 'unlock-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.round(t.fraction * 100)}%`;
        bar.append(fill);
        const togo = document.createElement('span');
        togo.className = 'course-time';
        togo.textContent = t.toGo;
        b.append(need, bar, togo);
      } else {
        const best = document.createElement('span');
        best.className = 'course-time';
        best.textContent = t.best > 0 ? `best ${formatScore(t.best)}` : 'no runs yet';
        b.append(best);
      }
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
  setTitleRank(icon: string, name: string, sub: string): void {
    $('title-rank-icon').innerHTML = icon;
    $('title-rank-name').textContent = name;
    $('title-credits').textContent = sub;
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

  /** The menus' accent (rank colour); `top` adds the generals' shimmer. */
  setAccent(css: string, top: boolean): void {
    document.documentElement.style.setProperty('--accent', css);
    document.body.classList.toggle('rank-top', top);
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
