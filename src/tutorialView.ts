import { CONFIG } from './config';
import { controlArt } from './controlArt';
import { chainNote, type ItemId, ITEMS, itemCard, itemIcon } from './guide';
import { CONTROL_CARDS, type ControlId } from './onboarding';

// The tutorial's pieces on the page: the control cards (the welcome screen and
// "how did that feel?"), the pickups and power-ups recap, and the practice
// run's indicators (the lesson card in the top band, the steering diagram in
// the bottom band, markers on things in the world, and rings on the score's
// chain and the boost button). Game decides what shows; this only draws.

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

export interface CardView {
  id: ControlId;
  on: boolean;
  /** "used": the controls the last run was flown with ("how did that feel?"). */
  used?: boolean;
}

/** A card for each way to steer: its diagram, name, how it works and what it's good for. Taps carry data-control. */
export function renderControlCards(into: HTMLElement, cards: CardView[]): void {
  into.style.setProperty('--cards', String(cards.length));
  into.replaceChildren(
    ...cards.map((c) => {
      const info = CONTROL_CARDS[c.id];
      const b = el('button', `ctl-card${c.on ? ' on' : ''}${c.used ? ' used' : ''}`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.control = c.id;
      b.setAttribute('aria-pressed', String(c.on));
      b.setAttribute('aria-label', `${info.name}${c.used ? ' (used)' : ''}: ${info.line}. ${info.good}`);
      const art = el('span', 'ctl-art');
      art.innerHTML = controlArt(c.id);
      b.append(art, el('span', 'ctl-name', info.name), el('span', 'ctl-line', info.line), el('span', 'ctl-good', info.good));
      if (c.used) b.append(el('span', 'ctl-tag', 'used'));
      return b;
    }),
  );
}

/** The recap: every pickup and power-up with its icon and what it does. */
export function renderGuide(into: HTMLElement): void {
  into.replaceChildren(
    ...ITEMS.map((id) => {
      const card = itemCard(id);
      const row = el('div', 'guide-row');
      const icon = el('span', 'guide-icon');
      icon.innerHTML = itemIcon(id);
      const text = el('div', 'guide-text');
      text.append(el('div', 'guide-name', card.name), el('div', 'guide-does', card.does));
      row.append(icon, text);
      return row;
    }),
    el('div', 'label dim setting-note guide-note', chainNote()),
  );
}

/** A marker on something in the world, in screen pixels over the play area. */
export interface Mark {
  x: number;
  y: number;
  label: string;
  /** CSS colour (an item's), or '' for the ink. */
  color: string;
}

export class TeachView {
  private readonly card = $('tutorial');
  private readonly step = $('tutorial-step');
  private readonly dots = $('tutorial-dots');
  private readonly text = $('tutorial-text');
  private readonly item = $('tutorial-item');
  private readonly icon = $('tutorial-icon');
  private readonly name = $('tutorial-name');
  private readonly art = $('teach-art');
  private readonly marks: HTMLElement[];
  private shownText = '';
  private shownItem = '';
  private shownArt = '';
  private shownDir = '';
  private shownDots = '';

  constructor() {
    const box = $('teach-marks');
    this.marks = [0, 1].map(() => {
      const m = el('div', 'teach-mark');
      m.hidden = true;
      m.innerHTML = '<span class="teach-mark-label"></span><svg viewBox="0 0 16 10" aria-hidden="true"><path d="M2 2l6 6 6-6"/></svg>';
      box.append(m);
      return m;
    });
  }

  /** Show or hide the whole practice overlay. */
  show(on: boolean): void {
    this.card.hidden = !on;
    if (!on) {
      this.setArt(null);
      this.setMarks([]);
      this.point(null);
    }
  }

  /** The kicker ("practice · 2 of 6") and the progress dots (`at` of `n`; n 0 for none). */
  setStep(kicker: string, at: number, n: number): void {
    this.step.textContent = kicker;
    const key = `${at}/${n}`;
    if (key === this.shownDots) return;
    this.shownDots = key;
    this.dots.replaceChildren(...Array.from({ length: n }, (_, i) => el('i', i < at ? 'done' : i === at ? 'now' : '')));
  }

  setText(text: string): void {
    if (text === this.shownText) return;
    this.shownText = text;
    this.text.textContent = text;
  }

  /** The item card's head (icon and name), or none. */
  setItem(id: ItemId | null): void {
    const key = id ?? '';
    if (key === this.shownItem) return;
    this.shownItem = key;
    this.item.hidden = id === null;
    if (id === null) return;
    this.icon.innerHTML = itemIcon(id);
    this.name.textContent = itemCard(id).name;
    this.name.style.color = itemCard(id).color;
  }

  /** The steering diagram in the bottom band, holding towards `dir` (-1 left, 1 right, 0 both ways in turn). */
  setArt(id: ControlId | null, dir = 0): void {
    const key = id ?? '';
    if (key !== this.shownArt) {
      this.shownArt = key;
      this.art.hidden = id === null;
      if (id !== null) this.art.firstElementChild!.innerHTML = controlArt(id);
    }
    const d = dir < 0 ? 'l' : dir > 0 ? 'r' : '';
    if (d !== this.shownDir) {
      this.shownDir = d;
      if (d) (this.art.firstElementChild as HTMLElement).dataset.dir = d;
      else delete (this.art.firstElementChild as HTMLElement).dataset.dir;
    }
  }

  /**
   * Up to two markers on things in the world. A marker's label sits over the
   * thing, or under it while the thing is just below the lesson card; behind
   * the card it waits.
   */
  setMarks(list: Mark[]): void {
    const cardBottom = list.length && !this.card.hidden ? this.card.offsetTop + this.card.offsetHeight : 0;
    this.marks.forEach((m, i) => {
      const k = list[i];
      m.hidden = !k || k.y < cardBottom + 6;
      if (!k || m.hidden) return;
      m.classList.toggle('below', k.y - 40 < cardBottom);
      m.style.transform = `translate(${k.x.toFixed(1)}px, ${k.y.toFixed(1)}px)`;
      if (k.color) m.style.setProperty('--mark', k.color);
      else m.style.removeProperty('--mark');
      m.classList.toggle('tinted', k.color !== '');
      const label = m.firstElementChild as HTMLElement;
      if (label.textContent !== k.label) label.textContent = k.label;
    });
  }

  /** What the lesson points at on the HUD: the score and chain, the boost button, or nothing. */
  point(at: 'score' | 'boost' | null): void {
    this.card.classList.toggle('point-up', at === 'score');
    const combo = $('combo');
    combo.classList.toggle('teach', at === 'score');
    combo.dataset.max = String(CONFIG.score.nearMiss.maxCombo);
    $('hud-boost').classList.toggle('teach', at === 'boost');
  }
}
