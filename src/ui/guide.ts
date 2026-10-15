import { CONFIG } from '../core/config';
import { itemColour, type ItemId, safeColours } from '../world/itemColours';
import type { PowerKind } from '../world/world';

// What the pickups and power-ups do, in plain words, with their real numbers
// from CONFIG (so a change there changes the words too). The practice run shows
// one card as each comes up, the recap after it lists them all, and settings >
// help > pickups & power-ups opens the same recap.

export type { ItemId };

/** In the order the practice run brings them. */
export const ITEMS: ItemId[] = ['pickup', 'shield', 'magnet', 'slow'];

/** The power-ups, by the world's PowerKind (0 shield, 1 magnet, 2 slow-mo). */
export const POWER_ITEMS: ItemId[] = ['shield', 'magnet', 'slow'];

export function powerItem(kind: PowerKind): ItemId {
  return POWER_ITEMS[kind];
}

export interface ItemCard {
  id: ItemId;
  name: string;
  /** Its colour in the game (colour-blind mode's when that's on). */
  color: string;
  /** What it does, with its numbers. */
  does: string;
  /** Said when it's picked up: the effect, now on. */
  on: string;
}

const pct = (f: number) => `${Math.round(f * 100)}%`;
const secs = (n: number) => `${Math.round(n * 10) / 10} s`;

export function itemCard(id: ItemId): ItemCard {
  const P = CONFIG.powers;
  const B = CONFIG.boost.pickup;
  switch (id) {
    case 'pickup':
      return {
        id,
        name: 'boost pickup',
        color: itemColour('pickup'),
        does: `fills ${pct(B.amount)} of your boost and scores +${CONFIG.score.pickupPoints}. they sit on the safe line`,
        on: `+${pct(B.amount)} boost`,
      };
    case 'shield':
      return {
        id,
        name: 'shield',
        color: itemColour('shield'),
        does: `takes one hit for you, then ${secs(P.shield.graceSeconds)} to fly clear. lasts until something hits it`,
        on: 'shield on: one free hit',
      };
    case 'magnet':
      return {
        id,
        name: 'magnet',
        color: itemColour('magnet'),
        does: `pulls boost pickups in to you for ${secs(P.magnet.seconds)}`,
        on: `magnet on: ${secs(P.magnet.seconds)} of pull`,
      };
    case 'slow':
      return {
        id,
        name: 'slow-mo',
        color: itemColour('slow'),
        does: `slows everything to ${pct(P.slow.factor)} for ${secs(P.slow.seconds)}. more time to steer`,
        on: `slow-mo on: ${secs(P.slow.seconds)}`,
      };
  }
}

/** The line under the recap: what a near miss and a chain are worth. */
export function chainNote(): string {
  const nm = CONFIG.score.nearMiss;
  return `near misses: +${nm.points} each, times the chain, up to x${nm.maxCombo}. power-ups stack, and hangar upgrades stretch some of them`;
}

/**
 * The item's icon, as the game draws it: the boost pickup a gold diamond (an
 * octahedron), a power-up a gem (an icosahedron) in its colour. In colour-blind
 * mode the shield's gem stands tall and the magnet's lies flat, as in the world.
 */
export function itemIcon(id: ItemId): string {
  const c = itemCard(id).color;
  const gem = `<path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z" fill="${c}" fill-opacity=".35"/><path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2zM12 2.5 7.5 9.5h9zM7.5 9.5 3.8 16.8M16.5 9.5l3.7 7.3M7.5 9.5 12 16.5l4.5-7M12 16.5v5"/>`;
  const squash = safeColours() && id === 'shield' ? 'translate(12 12) scale(.62 1.05) translate(-12 -12)' : safeColours() && id === 'magnet' ? 'translate(12 12) scale(1.05 .5) translate(-12 -12)' : '';
  const shape =
    id === 'pickup'
      ? `<path d="M12 2.5 20 12 12 21.5 4 12z" fill="${c}" fill-opacity=".35"/><path d="M12 2.5 20 12 12 21.5 4 12zM4 12h16M12 2.5 9.5 12 12 21.5 14.5 12z"/>`
      : squash
        ? `<g transform="${squash}">${gem}</g>`
        : gem;
  // The safe palette has a white: outlined in the text colour, filled with its own.
  const art = safeColours() ? shape.replace(/fill-opacity="\.35"/g, 'fill-opacity=".9"') : shape;
  return `<svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${safeColours() ? 'currentColor' : c}" stroke-width="1.4" stroke-linejoin="round">${art}</svg>`;
}
