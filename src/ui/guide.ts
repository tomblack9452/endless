import { CONFIG } from '../core/config';
import { itemColour, type ItemId, safeColours } from '../world/itemColours';
import type { PowerKind } from '../world/world';

// What the pickups and power-ups do, in plain words, with their real numbers
// from CONFIG (so a change there changes the words too). The practice run shows
// one card as each comes up, the recap after it lists them all, and settings >
// help > pickups & power-ups opens the same recap.

export type { ItemId };

/** The recap's order: the practice run brings the first four (PRACTICE_ITEMS); phase and double points are met in play. */
export const ITEMS: ItemId[] = ['pickup', 'shield', 'magnet', 'slow', 'phase', 'double'];

/** What the practice run teaches, in its order. */
export const PRACTICE_ITEMS: ItemId[] = ['pickup', 'shield', 'magnet', 'slow'];

/** The power-ups, by the world's PowerKind (0 shield, 1 magnet, 2 slow-mo, 3 phase, 4 double points). */
export const POWER_ITEMS: ItemId[] = ['shield', 'magnet', 'slow', 'phase', 'double'];

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
    case 'phase':
      return {
        id,
        name: 'phase',
        color: itemColour('phase'),
        does: `your ship ghosts through the next thing it hits, within ${secs(P.phase.seconds)}. not walls, drops or lava`,
        on: `phase on: ${secs(P.phase.seconds)} to pass through one`,
      };
    case 'double':
      return {
        id,
        name: 'double points',
        color: itemColour('double'),
        does: `everything you score counts x${P.double.factor} for ${secs(P.double.seconds)}`,
        on: `double points: x${P.double.factor} for ${secs(P.double.seconds)}`,
      };
  }
}

/** The line under the recap: what a near miss and a chain are worth. */
export function chainNote(): string {
  const nm = CONFIG.score.nearMiss;
  return `near misses: +${nm.points} each, times the chain, up to x${nm.maxCombo}. power-ups stack, and hangar upgrades stretch some of them`;
}

/** Colour-blind mode's shapes in the icons, as in the world (itemColours.ts): the shield tall, the magnet flat, phase long, double points wide. */
const SAFE_SQUASH: Partial<Record<ItemId, string>> = {
  shield: 'translate(12 12) scale(.62 1.05) translate(-12 -12)',
  magnet: 'translate(12 12) scale(1.05 .5) translate(-12 -12)',
  phase: 'translate(12 12) rotate(90) scale(1.05 .55) translate(-12 -12)',
  double: 'translate(12 12) scale(1.05 .72) translate(-12 -12)',
};

/**
 * The item's icon, as the game draws it: the boost pickup a gold diamond (an
 * octahedron), a power-up a gem (an icosahedron) in its colour. In colour-blind
 * mode each power-up's gem takes its shape, as in the world. Phase is drawn
 * twice, the second faint and offset (its ghosting); double points carries a
 * small "x2".
 */
export function itemIcon(id: ItemId): string {
  const c = itemCard(id).color;
  const gem = `<path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2z" fill="${c}" fill-opacity=".35"/><path d="M12 2.5 20.2 7.2v9.6L12 21.5 3.8 16.8V7.2zM12 2.5 7.5 9.5h9zM7.5 9.5 3.8 16.8M16.5 9.5l3.7 7.3M7.5 9.5 12 16.5l4.5-7M12 16.5v5"/>`;
  const squash = safeColours() ? (SAFE_SQUASH[id] ?? '') : '';
  const shape =
    id === 'pickup'
      ? `<path d="M12 2.5 20 12 12 21.5 4 12z" fill="${c}" fill-opacity=".35"/><path d="M12 2.5 20 12 12 21.5 4 12zM4 12h16M12 2.5 9.5 12 12 21.5 14.5 12z"/>`
      : squash
        ? `<g transform="${squash}">${gem}</g>`
        : gem;
  const extra =
    id === 'phase'
      ? `<g transform="translate(3 -1)" opacity=".35">${gem.replace(/fill="[^"]*" fill-opacity="\.35"/, 'fill="none"')}</g>`
      : id === 'double'
        ? `<text x="12" y="14.6" text-anchor="middle" font-size="7.5" font-family="ui-monospace, monospace" stroke="none" fill="${safeColours() ? '#ffffff' : 'currentColor'}">x2</text>`
        : '';
  // The safe palette has a white: outlined in the text colour, filled with its own.
  const art = (safeColours() ? shape.replace(/fill-opacity="\.35"/g, 'fill-opacity=".9"') : shape) + extra;
  return `<svg class="item-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${safeColours() ? 'currentColor' : c}" stroke-width="1.4" stroke-linejoin="round">${art}</svg>`;
}
