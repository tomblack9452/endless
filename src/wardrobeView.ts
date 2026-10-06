import type { Slot } from './looks';
import type { WardrobeView } from './wardrobe';

// The wardrobe screen and the goals list (a tab on the missions screen). The
// model is wardrobe.ts and achievements.ts; Game wires the taps. This only draws.

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

export interface GoalRow {
  name: string;
  text: string;
  have: number;
  target: number;
  done: boolean;
  /** What it unlocks, in words. */
  reward: string;
}

export interface GoalGroup {
  name: string;
  rows: GoalRow[];
}

const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

function fill(bar: HTMLElement, fraction: number): void {
  requestAnimationFrame(() => (bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`));
}

export class WardrobeScreen {
  constructor() {
    // Taps on these screens never start a run.
    for (const id of ['screen-wardrobe', 'screen-missions']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // --- wardrobe ---

  bindWardrobe(on: { slot: (s: Slot) => void; pick: (id: string) => void; action: () => void; open: () => void }): void {
    $('wardrobe-slots').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (chip) on.slot(chip.dataset.slot as Slot);
    });
    $('wardrobe-grid').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-item]');
      if (card) on.pick(card.dataset.item ?? '');
    });
    $('wardrobe-action').addEventListener('click', on.action);
    for (const id of ['open-wardrobe', 'shop-wardrobe']) {
      const b = $(id);
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', on.open);
    }
  }

  renderWardrobe(v: WardrobeView, keepScroll: boolean): void {
    $('wardrobe-summary').textContent = v.summary;
    $('wardrobe-slots').replaceChildren(
      ...v.slots.map((s) => {
        const b = el('button', `tab${s.on ? ' on' : ''}`, s.label) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.slot = s.slot;
        b.append(el('small', '', `${s.owned}/${s.total}`));
        return b;
      }),
    );
    const grid = $('wardrobe-grid');
    const top = grid.scrollTop;
    grid.replaceChildren(
      ...v.cards.map((c) => {
        const card = el('button', `ward-card ${c.state}${c.picked ? ' picked' : ''}`) as HTMLButtonElement;
        card.type = 'button';
        card.dataset.item = c.id;
        const sw = el('span', 'card-swatch');
        if (c.swatch) sw.style.background = c.swatch;
        else if (c.icon) sw.innerHTML = c.icon;
        card.append(sw, el('span', 'label card-name', c.name), el('span', 'label card-sub', c.state === 'locked' ? c.sub : c.state === 'equipped' ? 'on' : ''));
        if (c.state === 'equipped') card.append(el('span', 'card-tick', '✓'));
        return card;
      }),
    );
    grid.scrollTop = keepScroll ? top : 0;
    const d = v.detail;
    if (!d) return;
    $('wardrobe-name').textContent = d.name;
    $('wardrobe-slot').textContent = d.slotName;
    $('wardrobe-status').textContent = d.goal ? `${d.status} · ${fmt(d.goal.have)} of ${fmt(d.goal.target)}` : d.status;
    const bar = $('wardrobe-goal');
    bar.hidden = !d.goal;
    if (d.goal) fill($('wardrobe-goal-fill'), d.goal.have / d.goal.target);
    const a = $('wardrobe-action') as HTMLButtonElement;
    a.textContent = d.action.text;
    a.disabled = !d.action.enabled;
    a.dataset.kind = d.action.kind;
  }

  // --- goals ---

  bindGoals(onTab: (tab: 'missions' | 'goals') => void): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-missiontab]')) {
      t.addEventListener('click', () => onTab(t.dataset.missiontab as 'missions' | 'goals'));
    }
  }

  setMissionsTab(tab: 'missions' | 'goals'): void {
    for (const t of document.querySelectorAll<HTMLElement>('[data-missiontab]')) t.classList.toggle('on', t.dataset.missiontab === tab);
    for (const p of document.querySelectorAll<HTMLElement>('[data-missionpane]')) p.hidden = p.dataset.missionpane !== tab;
  }

  renderGoals(count: string, note: string, groups: GoalGroup[]): void {
    $('goals-count').textContent = count;
    $('goals-note').textContent = note;
    const out: HTMLElement[] = [];
    for (const g of groups) {
      out.push(el('div', 'settings-group goal-group', g.name));
      for (const r of g.rows) {
        const row = el('div', `goal-row${r.done ? ' done' : ''}`);
        const top = el('div', 'goal-top');
        top.append(el('span', 'label goal-name', r.name), el('span', 'label goal-count', r.done ? 'done' : `${fmt(r.have)} / ${fmt(r.target)}`));
        row.append(top, el('div', 'label goal-text', r.text));
        if (!r.done) {
          const track = el('div', 'xp-track');
          const f = el('div', 'xp-fill');
          track.append(f);
          row.append(track);
          fill(f, r.have / r.target);
        }
        if (r.reward) row.append(el('div', 'label goal-reward', r.reward));
        out.push(row);
      }
    }
    $('goals-list').replaceChildren(...out);
  }
}
