import { scrollHint } from '../scrollHint';
import { formatScore } from '../ui';

// The economy's screens: the wallet bar on the title, the shop, the season
// pass, the offer dialog (revive) and
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

interface ShopOfferView {
  name: string;
  slot: string; // 'hull', 'paint', ...
  slotName: string; // shown under the name
  swatch: string | null; // css colours for paints and engines
  icon: string | null; // a picture, for the rest
  price: string;
  premium: boolean; // priced in cores
  deal: boolean;
  owned: boolean;
  picked: boolean; // tapped: on the ship now
}

export interface ShopView {
  wallet: string;
  reset: string;
  /** The tabs (today, the weekly set, the vault), when each turns over, and which is open. */
  tabs: { id: string; label: string; note: string; on: boolean }[];
  /** The store's card above the tabs: the season pass on top, buying cores along the bottom. */
  store: { pass: { title: string; left: string; hook: string; tier: string; fraction: number }; cores: string };
  heading: string;
  /** A line over a lone card (the vault's), '' for none. */
  kicker: string;
  /** A line under the cards: what the set or the vault is. */
  info: string;
  offers: ShopOfferView[];
  /** The weekly set's own buttons: every look at once (`grid`), and the whole set on the ship (`trying`). Null elsewhere. */
  set: { grid: boolean; trying: boolean } | null;
  /** The one buy button, for the picked look. */
  buy: { text: string; enabled: boolean };
}

/** A button in the store: `act` says what it does (Game reads it back). */
export interface StoreButton {
  act: string;
  text: string;
  enabled: boolean;
  primary?: boolean;
}

/** A thing for sale as a card: a cores pack, the starter pack, premium. */
export interface StoreCard {
  img: string; // a picture in public/store
  name: string;
  sub: string;
  tag: string; // a corner badge ('' for none)
  button: StoreButton;
  owned: boolean;
}

/** The store: the season pass first, then cores and the rest, restore at the bottom. */
export interface StoreView {
  wallet: string;
  pass: {
    title: string;
    left: string; // time left in the season
    tier: string;
    fraction: number; // through the season's tiers
    perks: string[]; // what premium gives
    buttons: StoreButton[];
  };
  packs: StoreCard[];
  /** A line under the packs: the web build, or the store not answering. */
  packsNote: string;
  extras: StoreCard[];
  swapNote: string;
  swaps: StoreButton[];
  /** Restore and the dev stand-ins: a label and a button each. */
  foot: { label: string; button: StoreButton }[];
}

interface PassTierView {
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


export interface OfferView {
  kicker: string;
  name: string;
  lines: string[];
  yes: string;
  yesEnabled: boolean;
  /** A second way to say yes (the revive's cores, beside its ad); '' for none. */
  alt?: string;
  altEnabled?: boolean;
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
  private offerAlt: (() => void) | null = null;
  private offerLeft = 0;
  private offerTotal = 0;
  private readonly countdownEl = $('countdown');
  private readonly offersHint = scrollHint($('shop-offers'));

  constructor() {
    stopTaps(this.offerEl);
    $('offer-yes').addEventListener('click', () => this.closeOffer(true));
    $('offer-no').addEventListener('click', () => this.closeOffer(false));
    $('offer-alt').addEventListener('click', () => this.closeOffer('alt'));
    for (const id of ['screen-shop', 'screen-store', 'screen-pass', 'countdown']) stopTaps($(id));
  }

  // --- title ---

  setBar(credits: number, cores: number): void {
    $('bar-credits').textContent = formatScore(credits);
    $('bar-cores').textContent = formatScore(cores);
  }

  /** A dot on a title chip: something there to claim or see. */
  setNews(name: string, on: boolean): void {
    document.querySelector(`[data-title="${name}"] .news`)?.classList.toggle('on', on);
  }

  /** A counter in the bar bumps when something lands in it. */
  bump(which: 'credits' | 'cores'): void {
    const c = $(`bar-${which}`).parentElement!;
    c.classList.remove('bump');
    void c.offsetWidth; // restart the animation
    c.classList.add('bump');
  }

  // --- shop ---

  bindShop(onOffer: (i: number) => void, onBuy: () => void, onTab: (id: string) => void, onSet: (act: 'grid' | 'try') => void): void {
    $('shop-tabs').addEventListener('click', (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-shoptab]');
      if (tab) onTab(tab.dataset.shoptab ?? '');
    });
    $('shop-store').addEventListener('click', () => onTab('store'));
    $('shop-cores').addEventListener('click', () => onTab('store-cores'));
    $('shop-offers').addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-offer]');
      if (card) onOffer(Number(card.dataset.offer));
    });
    $('shop-buy').addEventListener('click', onBuy);
    $('shop-layout').addEventListener('click', () => onSet('grid'));
    $('shop-tryset').addEventListener('click', () => onSet('try'));
  }

  /** Every button in the store carries what it does in data-act. */
  bindStore(onAct: (act: string) => void): void {
    $('screen-store').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
      if (b && !b.disabled) onAct(b.dataset.act ?? '');
    });
  }

  renderShop(v: ShopView): void {
    $('shop-wallet').textContent = v.wallet;
    $('shop-reset').textContent = v.reset;
    $('shop-heading').textContent = v.heading;
    const sp = v.store.pass;
    $('shop-pass-title').textContent = sp.title;
    $('shop-pass-left').textContent = sp.left;
    $('shop-pass-hook').textContent = sp.hook;
    $('shop-pass-tier').textContent = sp.tier;
    $('shop-pass-fill').style.transform = `scaleX(${Math.min(1, Math.max(0, sp.fraction))})`;
    $('shop-cores-note').textContent = v.store.cores;
    $('shop-info').textContent = v.info;
    $('shop-tabs').replaceChildren(
      ...v.tabs.map((t) => {
        const b = el('button', `tab${t.on ? ' on' : ''}`) as HTMLButtonElement;
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', String(t.on));
        b.dataset.shoptab = t.id;
        b.append(el('span', 'tab-label', t.label), el('small', 'tab-note', t.note));
        return b;
      }),
    );
    const offers = $('shop-offers');
    offers.classList.toggle('feature', v.offers.length === 1); // the vault: one look, shown big
    offers.classList.toggle('grid', !!v.set?.grid); // the weekly set, every look at once
    const layout = $('shop-layout');
    layout.hidden = !v.set;
    layout.textContent = v.set?.grid ? 'show as row' : 'see all';
    layout.setAttribute('aria-pressed', String(!!v.set?.grid));
    const tryOn = $('shop-tryset');
    tryOn.hidden = !v.set;
    tryOn.classList.toggle('on', !!v.set?.trying);
    tryOn.textContent = v.set?.trying ? 'take the set off' : 'try the set on';
    $('shop-reset').hidden = !!v.set; // the set's tab already shows when it turns over: room for its buttons
    tryOn.setAttribute('aria-pressed', String(!!v.set?.trying));
    offers.replaceChildren(
      ...v.offers.map((o, i) => {
        const card = el('button', `offer-card${o.picked ? ' picked' : ''}${o.owned ? ' owned' : ''}`) as HTMLButtonElement;
        card.type = 'button';
        card.dataset.offer = String(i);
        const sw = el('span', 'card-swatch');
        if (o.swatch) sw.style.background = o.swatch;
        else sw.innerHTML = o.icon ?? SLOT_ICONS[o.slot] ?? '';
        const art = el('span', 'card-art');
        art.append(sw);
        const text = el('span', 'card-text');
        if (v.kicker && v.offers.length === 1) text.append(el('span', 'label card-kicker', v.kicker));
        const price = el('span', `card-price${o.premium ? ' premium' : ''}`, o.owned ? '✓ owned' : o.price);
        text.append(el('span', 'label card-name', o.name), el('span', 'label dim card-slot', o.slotName), price);
        card.append(art, text);
        if (o.deal && !o.owned) card.append(el('span', 'card-deal', '-25%'));
        return card;
      }),
    );
    this.offersHint();
    const buy = $('shop-buy') as HTMLButtonElement;
    buy.textContent = v.buy.text;
    buy.disabled = !v.buy.enabled;
  }

  renderStore(v: StoreView): void {
    $('store-wallet').textContent = v.wallet;
    const button = (b: StoreButton, cls = 'pill'): HTMLButtonElement => {
      const e = el('button', `${cls}${b.primary ? ' primary' : ''}`, b.text) as HTMLButtonElement;
      e.type = 'button';
      e.dataset.act = b.act;
      e.disabled = !b.enabled;
      return e;
    };
    const p = v.pass;
    $('store-pass-title').textContent = p.title;
    $('store-pass-left').textContent = p.left;
    $('store-pass-tier').textContent = p.tier;
    const fill = $('store-pass-fill');
    requestAnimationFrame(() => (fill.style.transform = `scaleX(${Math.max(0, Math.min(1, p.fraction))})`));
    $('store-pass-perks').replaceChildren(...p.perks.map((t) => el('li', 'label', t)));
    $('store-pass-buttons').replaceChildren(...p.buttons.map((b) => button(b, 'pill store-pass-btn')));
    const card = (c: StoreCard): HTMLElement => {
      const e = el('div', `store-card${c.owned ? ' owned' : ''}`);
      const img = document.createElement('img');
      img.className = 'store-img';
      img.src = c.img;
      img.alt = '';
      img.width = 80;
      img.height = 80;
      img.loading = 'lazy';
      const text = el('span', 'store-text');
      text.append(el('span', 'label store-name', c.name));
      if (c.sub) text.append(el('span', 'label dim store-sub', c.sub));
      e.append(img, text);
      if (c.tag) e.append(el('span', 'store-tag', c.tag));
      e.append(button(c.button, 'pill store-price'));
      return e;
    };
    $('store-packs').replaceChildren(...v.packs.map(card));
    const note = $('store-packs-note');
    note.textContent = v.packsNote;
    note.hidden = !v.packsNote;
    $('store-extras').replaceChildren(...v.extras.map(card));
    $('store-extras-head').hidden = v.extras.length === 0;
    $('store-swap-note').textContent = v.swapNote;
    $('store-swaps').replaceChildren(...v.swaps.map((b) => button(b, 'pill store-swap')));
    $('store-foot').replaceChildren(
      ...v.foot.map((f) => {
        const row = el('div', 'shop-row');
        const text = el('span', 'shop-text');
        text.append(el('span', 'label', f.label));
        row.append(text, button(f.button, 'pill shop-buy'));
        return row;
      }),
    );
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

  // --- end of run ---

  setOverRewards(lines: string[]): void {
    $('over-rewards').replaceChildren(...lines.map((l) => el('div', 'label', l)));
  }

  // --- offer dialog ---

  get offerOpen(): boolean {
    return this.offerEl.classList.contains('show');
  }

  offer(v: OfferView, onYes: () => void, onNo: () => void, onAlt?: () => void): void {
    $('offer-kicker').textContent = v.kicker;
    $('offer-name').textContent = v.name;
    $('offer-lines').replaceChildren(...v.lines.map((l) => el('div', 'label', l)));
    const yes = $('offer-yes') as HTMLButtonElement;
    yes.textContent = v.yes;
    yes.disabled = !v.yesEnabled;
    const alt = $('offer-alt') as HTMLButtonElement;
    alt.hidden = !v.alt;
    alt.textContent = v.alt ?? '';
    alt.disabled = !v.altEnabled;
    $('offer-no').textContent = v.no;
    this.offerYes = onYes;
    this.offerNo = onNo;
    this.offerAlt = onAlt ?? null;
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

  private closeOffer(answer: boolean | 'alt'): void {
    if (!this.offerOpen) return;
    this.offerEl.classList.remove('show');
    const run = answer === 'alt' ? this.offerAlt : answer ? this.offerYes : this.offerNo;
    this.offerYes = this.offerNo = this.offerAlt = null;
    run?.();
  }

  /** Close without answering (a run is starting). */
  dismissOffer(): void {
    this.offerEl.classList.remove('show');
    this.offerYes = this.offerNo = this.offerAlt = null;
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
