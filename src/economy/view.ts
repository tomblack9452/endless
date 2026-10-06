import { formatScore } from '../ui';

// The economy's screens: the wallet bar on the title, the shop, the season
// pass, the daily screen, the offer dialog (revive, a ticket for cores) and
// the 3-2-1 countdown. Game wires the taps; this only draws.

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

/** Taps inside never reach the game's tap-to-retry. */
function stopTaps(e: HTMLElement): void {
  e.addEventListener('pointerdown', (ev) => ev.stopPropagation());
}

export interface ShopOfferView {
  name: string;
  slot: string; // 'hull', 'paint', ...
  slotName: string; // shown under the name
  swatch: string | null; // css colours for paints and engines
  price: string;
  premium: boolean; // priced in cores
  deal: boolean;
  owned: boolean;
  picked: boolean; // tapped: on the ship now
}

export interface ShopView {
  wallet: string;
  reset: string;
  offers: ShopOfferView[];
  /** The one buy button, for the picked look. */
  buy: { text: string; enabled: boolean };
  tickets: { label: string; button: string; enabled: boolean };
  cores: { label: string; button: string; enabled: boolean }[];
}

export interface PassTierView {
  tier: number;
  free: string;
  premium: string;
  reached: boolean;
  current: boolean;
}

export interface PassView {
  big: string;
  goal: string;
  fraction: number;
  detail: string;
  premium: { text: string; enabled: boolean } | null; // null once owned
  /** The same for money, in the apps. */
  buy: string | null;
  tiers: PassTierView[];
  premiumOwned: boolean;
}

export interface DailyView {
  calendar: { day: number; reward: string; state: 'claimed' | 'today' | 'next' }[];
  claim: { text: string; enabled: boolean };
  reset: string;
  quests: { text: string; reward: string; progress: string; fraction: number; done: boolean }[];
  bonus: string;
}

export interface OfferView {
  kicker: string;
  name: string;
  lines: string[];
  yes: string;
  yesEnabled: boolean;
  no: string;
  /** Seconds before it closes itself (as "no"), shown in the ring; 0 = no timer. */
  seconds: number;
}

/** Pictures for looks that aren't a colour. */
const SLOT_ICONS: Record<string, string> = {
  hull: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z"/></svg>',
  fins: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z"/><path d="M12 12v6M8 15l-3 5M16 15l3 5"/></svg>',
  markings: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z"/><path d="M10 9l2 7 2-7"/></svg>',
};

export class EconomyView {
  private readonly offerEl = $('offer');
  private offerYes: (() => void) | null = null;
  private offerNo: (() => void) | null = null;
  private offerLeft = 0;
  private offerTotal = 0;
  private readonly countdownEl = $('countdown');

  constructor() {
    stopTaps(this.offerEl);
    $('offer-yes').addEventListener('click', () => this.closeOffer(true));
    $('offer-no').addEventListener('click', () => this.closeOffer(false));
    for (const id of ['screen-shop', 'screen-pass', 'screen-daily', 'countdown']) stopTaps($(id));
  }

  // --- title ---

  setBar(credits: number, cores: number, tickets: number, wait: string): void {
    $('bar-credits').textContent = formatScore(credits);
    $('bar-cores').textContent = formatScore(cores);
    $('bar-tickets').textContent = String(tickets);
    $('bar-ticket-wait').textContent = wait;
  }

  /** A dot on a title chip: something there to claim or see. */
  setNews(name: string, on: boolean): void {
    document.querySelector(`[data-title="${name}"] .news`)?.classList.toggle('on', on);
  }

  /** A counter in the bar bumps when something lands in it. */
  bump(which: 'credits' | 'cores' | 'tickets'): void {
    const c = $(`bar-${which}`).parentElement!;
    c.classList.remove('bump');
    void c.offsetWidth; // restart the animation
    c.classList.add('bump');
  }

  // --- shop ---

  bindShop(onOffer: (i: number) => void, onBuy: () => void, onTicket: () => void, onCores: (i: number) => void): void {
    $('shop-offers').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-offer]');
      if (card) onOffer(Number(card.dataset.offer));
    });
    $('shop-buy').addEventListener('click', onBuy);
    $('shop-tickets').addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) onTicket();
    });
    $('shop-cores').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-pack]');
      if (b) onCores(Number(b.dataset.pack));
    });
  }

  renderShop(v: ShopView): void {
    $('shop-wallet').textContent = v.wallet;
    $('shop-reset').textContent = v.reset;
    $('shop-offers').replaceChildren(
      ...v.offers.map((o, i) => {
        const card = el('button', `offer-card${o.picked ? ' picked' : ''}${o.owned ? ' owned' : ''}`) as HTMLButtonElement;
        card.type = 'button';
        card.dataset.offer = String(i);
        const sw = el('span', 'card-swatch');
        if (o.swatch) sw.style.background = o.swatch;
        else sw.innerHTML = SLOT_ICONS[o.slot] ?? '';
        const price = el('span', `card-price${o.premium ? ' premium' : ''}`, o.owned ? 'owned' : o.price);
        card.append(sw, el('span', 'label card-name', o.name), el('span', 'label dim card-slot', o.slotName), price);
        if (o.deal && !o.owned) card.append(el('span', 'card-deal', '-25%'));
        return card;
      }),
    );
    const buy = $('shop-buy') as HTMLButtonElement;
    buy.textContent = v.buy.text;
    buy.disabled = !v.buy.enabled;
    const action = (label: string, button: string, enabled: boolean, data?: [string, string]) => {
      const row = el('div', 'shop-row');
      const text = el('span', 'shop-text');
      text.append(el('span', 'label', label));
      const b = el('button', 'pill shop-buy', button) as HTMLButtonElement;
      b.type = 'button';
      b.disabled = !enabled;
      if (data) b.dataset[data[0]] = data[1];
      row.append(text, b);
      return row;
    };
    $('shop-tickets').replaceChildren(action(v.tickets.label, v.tickets.button, v.tickets.enabled));
    $('shop-cores').replaceChildren(...v.cores.map((c, i) => action(c.label, c.button, c.enabled, ['pack', String(i)])));
  }

  // --- pass ---

  bindPass(onPremium: () => void, onBuy: () => void): void {
    $('pass-premium').addEventListener('click', onPremium);
    $('pass-buy').addEventListener('click', onBuy);
  }

  renderPass(v: PassView): void {
    $('pass-big').textContent = v.big;
    $('pass-goal').textContent = v.goal;
    $('pass-detail').textContent = v.detail;
    const fill = $('pass-fill');
    requestAnimationFrame(() => (fill.style.transform = `scaleX(${Math.max(0, Math.min(1, v.fraction))})`));
    const btn = $('pass-premium') as HTMLButtonElement;
    btn.hidden = !v.premium;
    if (v.premium) {
      btn.textContent = v.premium.text;
      btn.disabled = !v.premium.enabled;
    }
    const buy = $('pass-buy');
    buy.hidden = !v.premium || !v.buy;
    buy.textContent = v.buy ?? '';
    const list = $('pass-tiers');
    list.replaceChildren(
      ...v.tiers.map((t) => {
        const row = el('div', `pass-tier${t.reached ? ' reached' : ''}${t.current ? ' current' : ''}`);
        row.append(
          el('span', 'pass-num', String(t.tier)),
          el('span', 'label pass-cell', t.free),
          el('span', `label pass-cell premium${v.premiumOwned ? '' : ' locked'}`, t.premium),
        );
        return row;
      }),
    );
    // Open on the tier you're working towards.
    requestAnimationFrame(() => {
      const row = list.querySelector<HTMLElement>('.current');
      const scroller = list.closest<HTMLElement>('.settings');
      if (row && scroller) scroller.scrollTop = Math.max(0, row.offsetTop - scroller.clientHeight / 2);
    });
  }

  // --- daily ---

  bindDaily(onClaim: () => void): void {
    $('daily-claim').addEventListener('click', onClaim);
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
    $('daily-quests').replaceChildren(
      ...v.quests.map((q) => {
        const row = el('div', `quest${q.done ? ' done' : ''}`);
        const top = el('div', 'quest-top');
        top.append(el('span', 'label', q.text), el('span', 'label dim', q.done ? 'done' : q.progress));
        const track = el('div', 'xp-track');
        const fill = el('div', 'xp-fill');
        fill.style.transform = `scaleX(${Math.max(0, Math.min(1, q.fraction))})`;
        track.append(fill);
        row.append(top, track, el('div', 'label dim quest-reward', q.reward));
        return row;
      }),
    );
    $('daily-bonus').textContent = v.bonus;
  }

  // --- end of run ---

  setOverRewards(lines: string[]): void {
    $('over-rewards').replaceChildren(...lines.map((l) => el('div', 'label', l)));
  }

  // --- offer dialog ---

  get offerOpen(): boolean {
    return this.offerEl.classList.contains('show');
  }

  offer(v: OfferView, onYes: () => void, onNo: () => void): void {
    $('offer-kicker').textContent = v.kicker;
    $('offer-name').textContent = v.name;
    $('offer-lines').replaceChildren(...v.lines.map((l) => el('div', 'label', l)));
    const yes = $('offer-yes') as HTMLButtonElement;
    yes.textContent = v.yes;
    yes.disabled = !v.yesEnabled;
    $('offer-no').textContent = v.no;
    this.offerYes = onYes;
    this.offerNo = onNo;
    this.offerTotal = this.offerLeft = v.seconds;
    $('offer-ring').hidden = v.seconds <= 0;
    this.drawRing();
    this.offerEl.classList.add('show');
  }

  /** Run the offer's timer; it closes as "no" when it runs out. */
  tickOffer(dt: number): void {
    if (!this.offerOpen || this.offerTotal <= 0) return;
    this.offerLeft -= dt;
    if (this.offerLeft <= 0) this.closeOffer(false);
    else this.drawRing();
  }

  private drawRing(): void {
    const ring = $('offer-ring');
    ring.style.setProperty('--left', String(this.offerTotal > 0 ? this.offerLeft / this.offerTotal : 0));
    $('offer-count').textContent = String(Math.max(0, Math.ceil(this.offerLeft)));
  }

  private closeOffer(yes: boolean): void {
    if (!this.offerOpen) return;
    this.offerEl.classList.remove('show');
    const run = yes ? this.offerYes : this.offerNo;
    this.offerYes = this.offerNo = null;
    run?.();
  }

  /** Close without answering (a run is starting). */
  dismissOffer(): void {
    this.offerEl.classList.remove('show');
    this.offerYes = this.offerNo = null;
  }

  // --- countdown ---

  /** Show `n` big in the middle (0 hides it). */
  setCountdown(n: number): void {
    const text = n > 0 ? String(n) : '';
    if (this.countdownEl.textContent === text) return;
    this.countdownEl.textContent = text;
    this.countdownEl.classList.remove('tick');
    if (n > 0) {
      void this.countdownEl.offsetWidth;
      this.countdownEl.classList.add('tick');
    }
  }
}
