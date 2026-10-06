import { describe, expect, it } from 'vitest';
import type { Backend } from '../src/server/backend';
import { Wallet } from '../src/wallet';

// Credits merged with the server's copy, so a balance can be changed from the dashboard.

/** A stand-in server with sync_credits' rules (see 0007_wallet_credits.sql). */
function server(start: { credits: number | null; cores: number }) {
  const s = { ...start };
  const backend = {
    online: true,
    async cores() {
      return s.cores;
    },
    async syncCredits(credits: number, last: number | null) {
      s.credits = s.credits === null ? credits : last === null ? s.credits : Math.max(0, credits + (s.credits - last));
      return s.credits;
    },
  } as unknown as Backend;
  return { s, backend };
}

describe('wallet with a server', () => {
  it('sends its credits first, then picks up a gift from the dashboard', async () => {
    const { s, backend } = server({ credits: null, cores: 40 });
    const w = new Wallet();
    w.add(1000);
    await w.link(backend);
    expect([w.credits, w.cores, s.credits]).toEqual([1000, 40, 1000]);
    s.credits = 6000; // edited in the dashboard
    s.cores = 90;
    w.spend(200);
    await w.refresh();
    expect([w.credits, w.cores]).toEqual([5800, 90]);
  });

  it('keeps credits earned while a sync was on its way', async () => {
    const { backend } = server({ credits: null, cores: 0 });
    const w = new Wallet();
    w.add(500);
    const linking = w.link(backend);
    w.add(70); // a run ends mid-sync
    await linking;
    await w.syncCredits();
    expect(w.credits).toBe(570);
  });
});
