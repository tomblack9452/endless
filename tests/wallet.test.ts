import { describe, expect, it } from 'vitest';
import type { Backend } from '../src/server/backend';
import { Wallet } from '../src/progression/wallet';

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

/** A stand-in for earn_cores and spend_cores that can lose its signal (null: no answer). */
function coresServer(cores: number) {
  const s = { cores, up: true, log: [] as string[], ids: [] as string[], loseAnswer: false };
  const backend = {
    online: true,
    async cores() {
      return s.up ? s.cores : null;
    },
    async syncCredits(credits: number) {
      return s.up ? credits : null;
    },
    async earnCores(n: number, reason: string) {
      if (!s.up) return null;
      if (s.log.includes(reason)) return 0; // each reward once
      s.log.push(reason);
      s.cores += n;
      return n;
    },
    async spendCores(n: number, reason: string, id?: string) {
      if (!s.up) return null;
      if (id && s.ids.includes(id)) return s.loseAnswer ? null : true; // taken already (0024_spend_once.sql)
      if (n > s.cores) return false;
      s.cores -= n;
      s.log.push(reason);
      if (id) s.ids.push(id);
      return s.loseAnswer ? null : true; // taken, but the answer can go missing on the way back
    },
  } as unknown as Backend;
  return { s, backend };
}

describe('cores without a signal (1.0.11)', () => {
  it('a reward paid before signing in reaches the server instead of being undone by its balance', async () => {
    const { s, backend } = coresServer(20);
    const w = new Wallet();
    w.addCores(5, 'login:2026-10-26'); // the day's login reward, claimed while start-up signs in
    await w.link(backend);
    expect([w.cores, s.cores, w.coresWaiting]).toEqual([25, 25, 0]);
  });

  it('a spend with no signal waits, and is sent before the balance is taken again (no free looks)', async () => {
    const { s, backend } = coresServer(100);
    const w = new Wallet();
    await w.link(backend);
    s.up = false;
    expect(w.spendCores(60, 'look')).toBe(true);
    await w.refresh(); // still no signal: the device's balance stands
    expect([w.cores, s.cores, w.coresWaiting]).toEqual([40, 100, 1]);
    s.up = true;
    await w.refresh(); // back: the spend goes first, then the server's balance
    expect([w.cores, s.cores, w.coresWaiting]).toEqual([40, 40, 0]);
  });

  it('a reward earned offline is kept, not lost when the signal comes back', async () => {
    const { s, backend } = coresServer(10);
    const w = new Wallet();
    await w.link(backend);
    s.up = false;
    w.addCores(4, 'goals:2026-10-26');
    s.up = true;
    await w.refresh();
    expect([w.cores, s.cores]).toEqual([14, 14]);
  });

  it('the server still has the last word: a spend it refuses takes its balance', async () => {
    const { s, backend } = coresServer(60);
    const w = new Wallet();
    await w.link(backend);
    s.cores = 5; // changed in the dashboard since
    w.spendCores(40, 'look');
    await w.refresh();
    expect([w.cores, s.cores]).toEqual([5, 5]);
  });

  it('a spend whose answer was lost is sent again and charged once', async () => {
    const { s, backend } = coresServer(100);
    const w = new Wallet();
    await w.link(backend);
    s.loseAnswer = true; // the server takes it, the answer never arrives
    w.spendCores(30, 'look');
    await w.refresh(); // sent again: still no answer
    expect([s.cores, w.coresWaiting]).toEqual([70, 1]);
    s.loseAnswer = false;
    await w.refresh(); // answered at last: "taken", not a second charge
    expect([w.cores, s.cores, w.coresWaiting]).toEqual([70, 70, 0]);
  });

  it('keeps nothing waiting in a build without a server', async () => {
    const w = new Wallet();
    w.addCores(5, 'login:2026-10-26');
    await w.link({ online: false } as unknown as Backend);
    expect([w.cores, w.coresWaiting]).toEqual([5, 0]);
  });
});
