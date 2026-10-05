import { CONFIG } from '../config';
import { LOOKS, type LookItem } from '../looks';
import { hash, picker } from './time';

// The daily shop: a few looks a day, the same for everyone on a UTC date,
// picked from everything sold for credits or cores. The first is the deal of
// the day, a quarter off.

export interface Offer {
  item: LookItem;
  currency: 'credits' | 'cores';
  price: number;
  full: number; // before any deal
  deal: boolean;
}

const DEAL = 0.75;

export function shopFor(day: string): Offer[] {
  const pool = LOOKS.filter((l) => l.unlock.by === 'credits' || l.unlock.by === 'cores');
  const next = picker(hash(`shop-${day}`));
  const picked: LookItem[] = [];
  const n = Math.min(CONFIG.economy.shop.slots, pool.length);
  // At least one premium look a day, so the shop always has something new.
  const premium = pool.filter((l) => l.unlock.by === 'cores');
  if (premium.length > 0) picked.push(premium[Math.floor(next() * premium.length)]);
  while (picked.length < n) {
    const item = pool[Math.floor(next() * pool.length)];
    if (!picked.includes(item)) picked.push(item);
  }
  // The deal is any slot but the premium one, so the order is shuffled a little.
  const dealAt = 1 + Math.floor(next() * (n - 1));
  return picked.map((item, i) => {
    const u = item.unlock as { by: 'credits' | 'cores'; cost: number };
    const deal = i === dealAt;
    const price = deal ? Math.round((u.cost * DEAL) / (u.by === 'cores' ? 5 : 50)) * (u.by === 'cores' ? 5 : 50) : u.cost;
    return { item, currency: u.by, price, full: u.cost, deal };
  });
}
