import { find, type Slot } from '../looks';

// A reward from the login calendar, a quest or the season pass. `look` is
// "slot:id" (see looks.ts).

export interface Reward {
  credits?: number;
  cores?: number;
  look?: string;
  /** What the server records cores under ("pass:3:p10"): each reward is paid there once (earn_cores). */
  source?: string;
}

function n(v: number): string {
  return v.toLocaleString('en-US');
}

/** The look a reward gives, if any. */
export function rewardLook(r: Reward): { slot: Slot; id: string } | null {
  if (!r.look) return null;
  const [slot, id] = r.look.split(':') as [Slot, string];
  return { slot, id };
}

/** "+200 credits", "+10 cores", "aurora paint": each part of a reward, in words. */
export function rewardParts(r: Reward): string[] {
  const out: string[] = [];
  if (r.credits) out.push(`+${n(r.credits)} credits`);
  if (r.cores) out.push(`+${n(r.cores)} cores`);
  const look = rewardLook(r);
  if (look) out.push(`${find(look.slot, look.id).name} ${look.slot === 'engine' ? 'engine' : look.slot}`);
  return out;
}

export function rewardText(r: Reward): string {
  return rewardParts(r).join(' · ');
}
