import type { Slot } from './looks';
import type { HangarView } from './hangar';
import { scrollHint } from './scrollHint';

// The hangar screen: looks, and the upgrades chip. The model is hangar.ts;
// Game wires the taps. This only draws.

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

const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

function fill(bar: HTMLElement, fraction: number): void {
  requestAnimationFrame(() => (bar.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`));
}

/** What the hangar is showing: a slot of looks, or the ship's upgrades. */
export type HangarTab = Slot | 'upgrades';

export interface HangarFrame {
  upgrades: boolean;
  /** Shown on the upgrades chip, e.g. the points owned. */
  upgradeTag: string;
  /** The line above the sheet. */
  summary: string;
}

export class HangarScreen {
  private readonly slotsHint = scrollHint($('hangar-slots'));

  constructor() {
    // Taps on these screens never start a run.
    for (const id of ['screen-hangar']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // --- looks and upgrades ---

  bindHangar(on: { tab: (t: HangarTab) => void; pick: (id: string) => void; action: () => void; open: () => void }): void {
    $('hangar-slots').addEventListener('click', (e) => {
      const chip = (e.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (chip) on.tab(chip.dataset.slot as HangarTab);
    });
    $('hangar-grid').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-item]');
      if (card) on.pick(card.dataset.item ?? '');
    });
    $('hangar-action').addEventListener('click', on.action);
    const open = $('shop-hangar');
    open.addEventListener('pointerdown', (e) => e.stopPropagation());
    open.addEventListener('click', on.open);
  }

  renderHangar(v: HangarView, keepScroll: boolean, frame: HangarFrame): void {
    $('hangar-summary').textContent = frame.summary;
    const chips = v.slots.map((s) => {
      const b = el('button', `tab${s.on && !frame.upgrades ? ' on' : ''}`, s.label) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.slot = s.slot;
      b.append(el('small', '', `${s.owned}/${s.total}`));
      return b;
    });
    const up = el('button', `tab${frame.upgrades ? ' on' : ''}`, 'upgrades') as HTMLButtonElement;
    up.type = 'button';
    up.dataset.slot = 'upgrades';
    up.append(el('small', '', frame.upgradeTag));
    $('hangar-slots').replaceChildren(...chips, up);
    this.slotsHint();
    $('hangar-looks').hidden = frame.upgrades;
    $('hangar-upgrades').hidden = !frame.upgrades;
    if (frame.upgrades) return;
    const grid = $('hangar-grid');
    const top = grid.scrollTop;
    grid.replaceChildren(
      ...v.cards.map((c) => {
        const card = el('button', `hangar-card ${c.state}${c.picked ? ' picked' : ''}`) as HTMLButtonElement;
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
    $('hangar-name').textContent = d.name;
    $('hangar-slot').textContent = d.slotName;
    $('hangar-status').textContent = d.goal ? `${d.status} · ${fmt(d.goal.have)} of ${fmt(d.goal.target)}` : d.status;
    const bar = $('hangar-goal');
    bar.hidden = !d.goal;
    if (d.goal) fill($('hangar-goal-fill'), d.goal.have / d.goal.target);
    const a = $('hangar-action') as HTMLButtonElement;
    a.textContent = d.action.text;
    a.disabled = !d.action.enabled;
    a.dataset.kind = d.action.kind;
  }
}
