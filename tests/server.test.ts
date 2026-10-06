import { describe, expect, it } from 'vitest';
import WEBHOOK from '../supabase/functions/revenuecat-webhook/index.ts?raw';
import { CONFIG } from '../src/config';
import { createBackend } from '../src/server/backend';

// The run checks live in the database (tests/sql.test.ts runs them).

describe('server', () => {
  it('runs on the device when no keys are set', async () => {
    const b = createBackend();
    expect(b.online).toBe(false);
    expect(await b.signIn()).toBe(false);
    expect(await b.spendCores(10, 'test')).toBe(true);
  });
});

describe('store', () => {
  it("the webhook pays the cores the game's products promise", () => {
    for (const p of CONFIG.economy.store.products) {
      if (!('cores' in p)) continue;
      expect(WEBHOOK, p.id).toMatch(new RegExp(`${p.id}: ${p.cores},`));
    }
  });
});
