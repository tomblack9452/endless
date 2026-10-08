import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalBackend } from '../src/server/local';
import { SupabaseBackend } from '../src/server/supabase';
import { storage } from '../src/storage';

// The trusted clock (src/server/supabase.ts): the game keeps its days and weeks
// by the server's time once it knows it, and by the device's until then.

const DAY = 86_400_000;
const session = { access_token: 't', refresh_token: 'r', expires_in: 3600, user: { id: 'u' } };

afterEach(async () => {
  vi.unstubAllGlobals();
  await storage.clear('endless.session');
});

describe('the trusted clock', () => {
  it("follows server_now's answer, wherever the device's clock is", async () => {
    const server = Date.now() - 3 * DAY; // the phone was moved three days on
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(new Date(server).toISOString()), { status: 200 })));
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(b.clockKnown).toBe(false);
    expect(Math.abs(b.now() - Date.now())).toBeLessThan(1000); // the device's until known
    expect(await b.syncClock()).toBe(true);
    expect(Math.abs(b.now() - server)).toBeLessThan(5000);
  });

  it("falls back to the Date header, and keeps the device's clock with no signal", async () => {
    const server = Date.now() + 2 * DAY;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404, headers: { Date: new Date(server).toUTCString() } })));
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(await b.syncClock()).toBe(true);
    expect(Math.abs(b.now() - server)).toBeLessThan(5000);

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    const off = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(await off.syncClock()).toBe(false);
    expect(Math.abs(off.now() - Date.now())).toBeLessThan(1000);
  });

  it('learns from any answer as well, such as signing in', async () => {
    const server = Date.now() - DAY;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(session), { status: 200, headers: { Date: new Date(server).toUTCString() } })));
    const b = new SupabaseBackend('https://x.supabase.co', 'k');
    expect(await b.signIn()).toBe(true);
    expect(b.clockKnown).toBe(true);
    expect(Math.abs(b.now() - server)).toBeLessThan(5000);
  });

  it("is the device's clock with no server", async () => {
    const b = new LocalBackend();
    expect(await b.syncClock()).toBe(false);
    expect(b.clockKnown).toBe(false);
    expect(Math.abs(b.now() - Date.now())).toBeLessThan(1000);
  });
});
