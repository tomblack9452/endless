// The goals screen: daily (the login calendar and today's three goals),
// weekly (five harder ones) and achievements (the long-term goals). Every
// finished one is claimed with a tap. The model is daily.ts, weekly.ts and
// achievements.ts; Game wires the taps. This only draws.

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export type GoalsTab = 'daily' | 'weekly' | 'achievements';

/** One row: a quest, a weekly goal, an achievement or a bonus. */
export interface TaskRow {
  /** What a claim tap sends back (e.g. "q1", "wall", "a:runs-10"). */
  id: string;
  name: string;
  /** A line under the name (an achievement's task), optional. */
  text?: string;
  progress: string;
  fraction: number;
  /** What it pays, in words (credits, pass XP, a look). */
  reward: string;
  state: 'open' | 'claim' | 'claimed';
  /** Offer to swap it for another goal (the button's text), once a day. */
  reroll?: string;
}

export interface DailyView {
  calendar: { day: number; reward: string; state: 'claimed' | 'today' | 'next' }[];
  claim: { text: string; enabled: boolean };
  reset: string;
  rows: TaskRow[];
}

function fill(bar: HTMLElement, fraction: number): void {
  requestAnimationFrame(() => (bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`));
}

function row(r: TaskRow): HTMLElement {
  const out = el('div', `goal-row ${r.state}`);
  const top = el('div', 'goal-top');
  top.append(el('span', 'label goal-name', r.name));
  if (r.state === 'claim') {
    const b = el('button', 'pill primary claim-btn', 'claim') as HTMLButtonElement;
    b.type = 'button';
    b.dataset.claim = r.id;
    top.append(b);
  } else top.append(el('span', 'label goal-count', r.state === 'claimed' ? 'done' : r.progress));
  out.append(top);
  if (r.text) out.append(el('div', 'label goal-text', r.text));
  if (r.state === 'open') {
    const track = el('div', 'xp-track');
    const f = el('div', 'xp-fill');
    track.append(f);
    out.append(track);
    fill(f, r.fraction);
  }
  if (r.reward) out.append(el('div', 'label goal-reward', r.reward));
  if (r.reroll) {
    const b = el('button', 'label link goal-reroll', r.reroll) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.reroll = r.id;
    out.append(b);
  }
  return out;
}

export class GoalsScreen {
  constructor() {
    $('screen-goals').addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  bind(on: { tab: (t: GoalsTab) => void; claimLogin: () => void; claim: (id: string) => void; reroll: (id: string) => void }): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-goaltab]')) t.addEventListener('click', () => on.tab(t.dataset.goaltab as GoalsTab));
    $('daily-claim').addEventListener('click', on.claimLogin);
    $('screen-goals').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-claim]');
      if (b) on.claim(b.dataset.claim ?? '');
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-reroll]');
      if (r) on.reroll(r.dataset.reroll ?? '');
    });
  }

  setTab(tab: GoalsTab): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-goaltab]')) t.classList.toggle('on', t.dataset.goaltab === tab);
    for (const p of document.querySelectorAll<HTMLElement>('[data-goalpane]')) p.hidden = p.dataset.goalpane !== tab;
  }

  /** A dot on a tab with something to claim. */
  setTabNews(news: Record<GoalsTab, boolean>): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-goaltab]')) t.querySelector('.news')?.classList.toggle('on', news[t.dataset.goaltab as GoalsTab]);
  }

  renderDaily(v: DailyView): void {
    $('daily-calendar').replaceChildren(
      ...v.calendar.map((d) => {
        const cell = el('div', `cal-day ${d.state}`);
        cell.append(el('span', 'label dim cal-num', `day ${d.day}`), el('span', 'label cal-reward', d.reward));
        return cell;
      }),
    );
    const claim = $('daily-claim') as HTMLButtonElement;
    claim.textContent = v.claim.text;
    claim.disabled = !v.claim.enabled;
    $('daily-reset').textContent = v.reset;
    $('daily-quests').replaceChildren(...v.rows.map(row));
  }

  renderWeekly(reset: string, rows: TaskRow[]): void {
    $('weekly-reset').textContent = reset;
    $('weekly-goals').replaceChildren(...rows.map(row));
  }

  renderAchievements(note: string, groups: { name: string; rows: TaskRow[] }[]): void {
    $('goals-note').textContent = note;
    const out: HTMLElement[] = [];
    for (const g of groups) out.push(el('div', 'settings-group goal-group', g.name), ...g.rows.map(row));
    $('goals-list').replaceChildren(...out);
  }
}
