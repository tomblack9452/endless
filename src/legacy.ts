import { CONFIG } from './config';
import type { Looks } from './looks';
import { storage } from './storage';

// Older saves unlocked hulls and flames with missions, in a fixed order. Missions
// are gone (those looks are goals now), so a save that had the unlocks keeps them
// once: they are granted to the looks, and the old hull and flame choice is worn.

const OLD_KEY = 'endless.cosmetics';
const DONE_KEY = 'endless.legacy.missions';

/** What the first n completed missions unlocked (hulls, flames and the two rewards on the old goals). */
const ORDER = ['trail:line', 'hull:wing', '', 'trail:dashes', 'hull:needle', '', 'trail:ion', 'hull:manta', '', '', ''];

export async function migrateMissionLooks(looks: Looks): Promise<void> {
  if ((await storage.get(DONE_KEY)) !== null) return;
  const raw = await storage.get(OLD_KEY);
  if (!raw) return; // nothing yet (a cloud save may still bring it, so not marked done)
  await storage.set(DONE_KEY, '1');
  try {
    const s = JSON.parse(raw) as { unlocked?: number; ship?: string; trail?: string };
    const n = Math.min(ORDER.length, Math.max(0, s.unlocked ?? 0));
    for (const key of ORDER.slice(0, n)) if (key) looks.give(key);
    if (n >= 5) looks.give('engine:aurora'); // the old "5 missions" goal
    if (n >= 11) looks.give('paint:signal'); // the old "every mission" goal
    if (s.ship && s.ship !== 'dart' && looks.equipped.hull === 'dart' && looks.has(`hull:${s.ship}`)) looks.equip('hull', s.ship);
    if (s.trail && s.trail !== 'none' && looks.equipped.trail === 'none' && looks.has(`trail:${s.trail}`)) looks.equip('trail', s.trail);
  } catch {
    // Corrupt value: nothing to carry over.
  }
}

// Ranked used to take a ticket a try (5 a week, more from rewards or for cores).
// It's unlimited now; tickets beyond the week's 5 are paid back in cores, once.

const TICKETS_KEY = 'endless.tickets';
const TICKETS_DONE_KEY = 'endless.legacy.tickets';
const OLD_WEEKLY_TICKETS = 5;

/** Pays spare tickets back as cores; returns how many cores (0 if none). */
export async function migrateTickets(addCores: (n: number) => void): Promise<number> {
  if ((await storage.get(TICKETS_DONE_KEY)) !== null) return 0;
  const raw = await storage.get(TICKETS_KEY);
  if (!raw) return 0;
  await storage.set(TICKETS_DONE_KEY, '1');
  try {
    const spare = Math.max(0, Math.floor((JSON.parse(raw) as { count?: number }).count ?? 0) - OLD_WEEKLY_TICKETS);
    const cores = spare * CONFIG.economy.ticketCores;
    if (cores > 0) addCores(cores);
    return cores;
  } catch {
    return 0;
  }
}
