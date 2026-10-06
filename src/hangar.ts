import { achievement } from './achievements';
import { decalArt } from './decals';
import { find, itemsIn, keyOf, type Looks, type LookItem, type Owner, type ShipId, type Slot, SLOT_NAMES, SLOTS, unlockProgress, unlockText } from './looks';
import { shipShape } from './player';

// The hangar: every look, a slot at a time. This is the model (what each card
// says, what the detail panel offers); the screen and its taps are in ui and game.

export interface HangarState {
  slot: Slot;
  /** The look being tried on (its id in the slot), or null. */
  pick: string | null;
}

export interface HangarDeps {
  looks: Looks;
  owner: Owner;
  credits: number;
  cores: number;
  /** The vault look on sale this month ("slot:id"), and how many months until another look is. */
  vault: { key: string; monthsUntil: (key: string) => number };
}

interface CardView {
  id: string;
  name: string;
  state: 'equipped' | 'owned' | 'locked';
  /** Under the name: what it costs or takes, for the ones you don't have. */
  sub: string;
  /** CSS background for a colour swatch, or an svg for a picture. */
  swatch: string | null;
  icon: string | null;
  picked: boolean;
}

interface DetailView {
  name: string;
  slotName: string;
  status: string;
  goal: { have: number; target: number } | null;
  action: { kind: 'equip' | 'buy' | 'none'; text: string; enabled: boolean };
}

export interface HangarView {
  summary: string;
  slots: { slot: Slot; label: string; owned: number; total: number; on: boolean }[];
  cards: CardView[];
  detail: DetailView | null;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

/** A few words for a card: what a look takes. */
export function shortUnlock(item: LookItem): string {
  const u = item.unlock;
  switch (u.by) {
    case 'free':
      return '';
    case 'premium':
      return 'premium';
    case 'credits':
      return `${fmt(u.cost)} credits`;
    case 'cores':
      return `${fmt(u.cost)} cores`;
    case 'vault':
      return 'the vault';
    case 'reward':
      return u.from === 'login' ? 'daily login' : 'season pass';
    case 'rank':
      return 'a rank';
    case 'stars':
      return `${u.stars} stars`;
    case 'league':
      return 'a league';
    case 'achievement':
      return achievement(u.id)?.name ?? 'a goal';
  }
}

/** A hull seen from above, as an SVG: light faces and shaded ones. */
export function hullIcon(id: string): string {
  const s = shipShape(id as ShipId);
  const xs = [...s.light, ...s.shade].map((v) => v.x);
  const zs = [...s.light, ...s.shade].map((v) => v.z);
  const w = Math.max(...xs.map(Math.abs)) || 1;
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const k = Math.min(11 / w, 21 / (z1 - z0));
  const pt = (x: number, z: number) => `${(12 + x * k).toFixed(1)},${(2 + (z - z0) * k).toFixed(1)}`;
  const tris = (list: typeof s.light, opacity: number) => {
    let d = '';
    for (let i = 0; i + 2 < list.length; i += 3) d += `M${pt(list[i].x, list[i].z)}L${pt(list[i + 1].x, list[i + 1].z)}L${pt(list[i + 2].x, list[i + 2].z)}Z`;
    return `<path fill="currentColor" fill-opacity="${opacity}" stroke="none" d="${d}"/>`;
  };
  return `<svg viewBox="0 0 24 24">${tris(s.light, 0.9)}${tris(s.shade, 0.5)}</svg>`;
}

const ICONS: Partial<Record<Slot, string>> = {
  fins: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z"/><path d="M12 12v6M8 15l-3 5M16 15l3 5"/></svg>',
  markings: '<svg viewBox="0 0 24 24"><path d="M12 3l7 17-7-4-7 4z"/><path d="M10 9l2 7 2-7"/></svg>',
  trail: '<svg viewBox="0 0 24 24"><path d="M12 4v9"/><path d="M9 8c0 3 1 6 3 9M15 8c0 3-1 6-3 9"/><path d="M12 14l-3 6M12 14l3 6"/></svg>',
};

export function lookSwatch(item: LookItem): string | null {
  const c = item.colors;
  if (item.slot === 'paint') return c ? `linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)` : 'linear-gradient(135deg, #dcd6c8 50%, #a39d90 50%)';
  if (item.slot === 'engine') return c ? `linear-gradient(135deg, ${c[0]} 50%, ${c[1]} 50%)` : 'linear-gradient(135deg, #e2a64e 50%, #e9b26a 50%)';
  return null;
}

export function lookIcon(item: LookItem): string | null {
  if (item.slot === 'hull') return hullIcon(item.id);
  if (item.slot === 'decal') {
    const art = decalArt(item.id);
    if (art) return art;
    return '<svg viewBox="0 0 24 24"><path d="M12 3l7 7-7 11-7-11z"/></svg>';
  }
  return ICONS[item.slot] ?? null;
}

export function buildHangar(st: HangarState, d: HangarDeps): HangarView {
  const owns = (i: LookItem) => d.looks.owns(i, d.owner);
  const slots = SLOTS.map((slot) => {
    const items = itemsIn(slot);
    return { slot, label: SLOT_NAMES[slot], owned: items.filter(owns).length, total: items.length, on: slot === st.slot };
  });
  const items = itemsIn(st.slot);
  // In the catalogue's own order: what's free and cheap first, the rare things last.
  const cards = items.map((item): CardView => {
    const own = owns(item);
    return {
      id: item.id,
      name: item.name,
      state: !own ? 'locked' : d.looks.equipped[st.slot] === item.id ? 'equipped' : 'owned',
      sub: own ? '' : shortUnlock(item),
      swatch: lookSwatch(item),
      icon: lookIcon(item),
      picked: st.pick === item.id,
    };
  });
  const totalOwned = slots.reduce((n, s) => n + s.owned, 0);
  const totalAll = slots.reduce((n, s) => n + s.total, 0);

  let detail: DetailView | null = null;
  const pick = st.pick ? items.find((i) => i.id === st.pick) : undefined;
  const shown = pick ?? find(st.slot, d.looks.equipped[st.slot]);
  const own = owns(shown);
  const u = shown.unlock;
  const equipped = d.looks.equipped[st.slot] === shown.id;
  let action: DetailView['action'];
  let status: string;
  if (own) {
    status = equipped ? 'on your ship' : 'yours';
    action = equipped ? { kind: 'none', text: 'on your ship', enabled: false } : { kind: 'equip', text: `put on ${shown.name}`, enabled: true };
  } else if (u.by === 'credits') {
    status = `${fmt(u.cost)} credits`;
    action = { kind: 'buy', text: `buy · ${fmt(u.cost)} credits`, enabled: d.credits >= u.cost };
  } else if (u.by === 'cores') {
    status = `${fmt(u.cost)} cores`;
    action = { kind: 'buy', text: `buy · ${fmt(u.cost)} cores`, enabled: d.cores >= u.cost };
  } else if (u.by === 'vault') {
    if (keyOf(shown) === d.vault.key) {
      status = 'in the vault now';
      action = { kind: 'buy', text: `buy from the vault · ${fmt(u.cost)} cores`, enabled: d.cores >= u.cost };
    } else {
      const m = d.vault.monthsUntil(keyOf(shown));
      status = 'the vault sells one look a month';
      action = { kind: 'none', text: m === 1 ? 'back in the vault next month' : `back in the vault in ${m} months`, enabled: false };
    }
  } else {
    status = unlockText(u);
    action = { kind: 'none', text: u.by === 'reward' ? 'a reward' : 'earn it to wear it', enabled: false };
  }
  const goal = own ? null : unlockProgress(u, d.owner);
  detail = { name: shown.name, slotName: SLOT_NAMES[st.slot], status, goal, action };

  return { summary: `${totalOwned} of ${totalAll} looks`, slots, cards, detail };
}

/** Months from `now` until the vault sells `key` (1 = next month); the cycle length if it never does. */
export function monthsUntilVault(key: string, order: readonly string[], monthIndex: number): number {
  for (let m = 1; m <= order.length; m++) if (order[(monthIndex + m) % order.length] === key) return m;
  return order.length;
}
