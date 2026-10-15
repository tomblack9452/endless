import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, ClientError } from '../src/server/backend';
import { describeError, ErrorLog, scrub, SESSION_MAX, shortStack } from '../src/platform/errors';

// The error log: what it keeps, what it takes out, and how it waits for a signal.

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.useFakeTimers();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

/** A server that takes error reports, or doesn't answer while `offline`. */
function server() {
  const got: ClientError[][] = [];
  const s = { online: true, userId: 'me', offline: false, got } as unknown as Backend & { offline: boolean; got: ClientError[][] };
  s.logErrors = async (errors: ClientError[]) => {
    if (s.offline) return 'retry';
    got.push(errors);
    return 'ok';
  };
  return s;
}

describe('error reports', () => {
  it('take out emails, tokens, ids, keys and query strings', () => {
    expect(scrub('failed for tom@example.com')).toBe('failed for <email>');
    expect(scrub('jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc-def_1 bad')).toBe('jwt <token> bad');
    expect(scrub('Bearer abc.def')).toBe('Bearer <hidden>');
    expect(scrub('user 3fa2b1c4-1111-4222-8333-444455556666 gone')).toBe('user <id> gone');
    expect(scrub('key AIzaSyA1234567890abcdefghijklmnopqrstu')).toBe('key <hidden>');
    expect(scrub('GET https://x.supabase.co/rest/v1/saves?user_id=eq.1 failed')).toBe('GET https://x.supabase.co/rest/v1/saves failed');
    expect(scrub('what? no')).toBe('what? no');
  });

  it('keep a short stack: a few lines, file names not whole addresses', () => {
    const stack = ['TypeError: x is undefined', ...Array.from({ length: 12 }, (_, i) => `    at f${i} (https://localhost/assets/index-abc.js:1:${i})`)].join('\n');
    const s = shortStack(stack);
    expect(s.split('\n')).toHaveLength(6);
    expect(s).toContain('at f0 index-abc.js:1:0');
    expect(s).not.toContain('https://');
    expect(shortStack(undefined)).toBe('');
  });

  it('read whatever was thrown', () => {
    expect(describeError(new RangeError('too far')).message).toBe('RangeError: too far');
    expect(describeError('plain').message).toBe('plain');
    expect(describeError({ code: 3, message: 'No fill' }).message).toBe('3 No fill');
    expect(describeError({ a: 1 }).message).toBe('{"a":1}');
  });

  it('send each one once, at most 20 a session, with the version, device and screen', async () => {
    const s = server();
    const log = new ErrorLog(() => 1234);
    log.version = '1.0.7';
    log.platform = 'android';
    log.device = 'Pixel 7 · android 14';
    log.attach(s, () => 'over');
    const boom = new Error('boom');
    log.report('purchase', boom);
    log.report('purchase', boom); // the same message and stack again: once
    await vi.runAllTimersAsync();
    expect(s.got).toHaveLength(1);
    expect(s.got[0]).toEqual([expect.objectContaining({ message: 'purchase: Error: boom', version: '1.0.7', platform: 'android', device: 'Pixel 7 · android 14', screen: 'over', at: 1234 })]);
    for (let i = 0; i < 40; i++) log.report('', `error ${i}`);
    await vi.runAllTimersAsync();
    expect(s.got.flat()).toHaveLength(SESSION_MAX);
    expect(log.waiting).toBe(0);
  });

  it('wait on the device with no signal, and go when there is one', async () => {
    const s = server();
    s.offline = true;
    const log = new ErrorLog();
    log.attach(s, () => 'title');
    log.report('save push', 'http 500');
    await vi.runAllTimersAsync();
    expect(log.waiting).toBe(1);
    expect(JSON.parse(data.get('endless.errors') ?? '[]')).toHaveLength(1);
    // A new session on the same phone picks up what was left.
    const next = new ErrorLog();
    s.offline = false;
    next.attach(s, () => 'title');
    await vi.runAllTimersAsync();
    expect(s.got.flat().map((e) => e.message)).toEqual(['save push: http 500']);
    expect(next.waiting).toBe(0);
  });

  it('hold them until there is a server and an account', async () => {
    const log = new ErrorLog();
    const s = server();
    (s as { userId: string | null }).userId = null;
    log.attach(s, () => 'title');
    log.report('', 'early');
    await vi.runAllTimersAsync();
    expect(s.got).toHaveLength(0);
    expect(log.waiting).toBe(1);
  });
});
