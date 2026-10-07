import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import SETUP from '../supabase/setup.sql?raw';
import type { RunSubmission } from '../src/server/backend';
import { BOARD_TABS, boardCaption, boardForRun, boardQuery } from '../src/server/boards';
import { Outbox } from '../src/server/outbox';
import { SupabaseBackend } from '../src/server/supabase';
import { ENVIRONMENTS } from '../src/courses';

// The game's real server code (SupabaseBackend, Outbox) talking to the real
// database schema. A stand-in for fetch answers the few Supabase calls the game
// makes by running them on PGlite, so parameter names, answers and failures are
// checked together without a Supabase project.

const URL = 'https://stub.supabase.test';
let db: PGlite;
const realFetch = globalThis.fetch;
let offline = false;
let serverDown = false;
let calls: string[] = [];

const STANDIN = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Postgres's answer to a Supabase REST call, the way PostgREST gives it. */
async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (offline) throw new TypeError('network down');
  const url = new globalThis.URL(String(input));
  const path = url.pathname;
  calls.push(`${init?.method ?? 'GET'} ${path}`);
  if (serverDown) return json(503, { message: 'down for a moment' });
  const headers = (init?.headers ?? {}) as Record<string, string>;
  if (path === '/auth/v1/signup') {
    await db.exec('reset role');
    const r = await db.query<{ id: string }>('insert into auth.users default values returning id');
    return json(200, { access_token: r.rows[0].id, refresh_token: 'r', expires_in: 3600, user: { id: r.rows[0].id } });
  }
  const who = (headers.Authorization ?? '').replace('Bearer ', '');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who]);
  await db.exec('set role authenticated');
  try {
    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path);
    if (rpc) {
      const args = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const names = Object.keys(args);
      const values = names.map((k) => (Array.isArray(args[k]) ? `{${(args[k] as number[]).join(',')}}` : args[k]));
      const call = `public.${rpc[1]}(${names.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
      if (rpc[1] === 'leaderboard') return json(200, (await db.query(`select * from ${call}`, values)).rows.map((r) => ({ ...(r as object) })));
      const r = await db.query<{ v: unknown }>(`select ${call} as v`, values);
      return json(200, r.rows[0].v);
    }
    if (path === '/rest/v1/players') {
      const id = /user_id=eq\.([\w-]+)/.exec(url.search)?.[1];
      const r = await db.query('select name from public.players where user_id = $1', [id]);
      return json(200, r.rows);
    }
    return json(404, { message: 'not stubbed' });
  } catch (e) {
    const code = (e as { message: string }).message.includes('permission denied') ? 403 : 400;
    return json(code, { message: (e as Error).message });
  } finally {
    await db.exec('reset role');
  }
}

async function player(): Promise<SupabaseBackend> {
  const b = new SupabaseBackend(URL, 'anon-key');
  expect(await b.signIn()).toBe(true);
  return b;
}

/** Let the server's per-player rate limit pass. */
async function wait(): Promise<void> {
  await db.exec('reset role');
  await db.exec("update public.runs set at = at - interval '1 minute'");
}

const run = (over: Partial<RunSubmission> = {}): RunSubmission => ({
  board: 'endless',
  league: 0,
  score: 1500,
  seconds: 40,
  distance: 2000,
  finished: false,
  path: [],
  ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(STANDIN);
  await db.exec(SETUP);
  globalThis.fetch = fakeFetch as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('the game talking to the database', () => {
  it('signs in anonymously and has a pilot name', async () => {
    const b = await player();
    expect(b.userId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await b.pilotName()).toMatch(/^pilot-/);
  });

  it('submits a run and reads the board', async () => {
    const [a, b] = [await player(), await player()];
    const ra = await a.submitRun(run({ board: 'solo:ice', score: 1200 }));
    expect(ra).toMatchObject({ status: 'ok', rank: 1, best: 1200, newBest: true });
    const rb = await b.submitRun(run({ board: 'solo:ice', score: 1800 }));
    expect(rb).toMatchObject({ status: 'ok', rank: 1 });
    const rows = await a.board({ board: 'solo:ice', period: 'all', league: 0 });
    expect(rows?.map((r) => [r.rank, r.score, r.you])).toEqual([
      [1, 1800, false],
      [2, 1200, true],
    ]);
  });

  it('reads the week per league using the same keys the screen uses', async () => {
    const b = await player();
    const tab = BOARD_TABS[0];
    const q = boardQuery(tab, 3);
    expect(q).toMatchObject({ board: 'ranked', league: 3 });
    expect(q.period).toMatch(/^\d{4}-\d\d-\d\d$/);
    const path = Array.from({ length: 500 }, (_, i) => Math.sin(i / 7));
    const r = await b.submitRun(run({ board: 'ranked', league: 3, score: 1700, path }));
    expect(r.status).toBe('ok');
    const rows = await b.board(q);
    expect(rows?.some((x) => x.you && x.score === 1700)).toBe(true);
    expect(boardCaption(tab, 3)).toContain('platinum');
  });

  it('knows what the server turned down for good and what is worth retrying', async () => {
    const b = await player();
    const bad = await b.submitRun(run({ score: 9_000_000 }));
    expect(bad.status).toBe('rejected');
    expect(bad.message).toMatch(/too high/);
    await b.submitRun(run({ score: 1000 }));
    const quick = await b.submitRun(run({ score: 1100 })); // straight after: the rate limit
    expect(quick.status).toBe('retry');
    serverDown = true;
    expect((await b.submitRun(run())).status).toBe('retry');
    serverDown = false;
    offline = true;
    expect((await b.submitRun(run())).status).toBe('retry');
    expect(await b.board({ board: 'endless', period: 'all', league: 0 })).toBeNull();
    offline = false;
  });

  it('changes the pilot name, or says why not', async () => {
    const [a, b] = [await player(), await player()];
    expect(await a.setPilotName('Skylark')).toEqual({ ok: true, message: 'Skylark' });
    expect(await a.pilotName()).toBe('Skylark');
    expect((await b.setPilotName('skylark')).message).toMatch(/taken/);
    expect((await b.setPilotName('x')).ok).toBe(false);
    offline = true;
    expect((await b.setPilotName('Valid Name')).message).toBe('no connection');
    offline = false;
  });
});

describe('the outbox', () => {
  it('keeps a run when there is no signal and sends it when there is', async () => {
    const b = await player();
    const box = new Outbox(b);
    offline = true;
    expect(await box.send(run({ board: 'solo:canyon', score: 1400 }))).toMatchObject({ status: 'retry' });
    expect(box.waiting).toBe(1);
    offline = false;
    const sent = await box.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0][1]).toMatchObject({ status: 'ok', rank: 1 });
    expect(box.waiting).toBe(0);
  });

  it('lets go of a run the server turned down', async () => {
    const b = await player();
    const box = new Outbox(b);
    const res = await box.send(run({ score: 8_000_000 }));
    expect(res?.status).toBe('rejected');
    expect(box.waiting).toBe(0);
  });

  it('sends runs in order and stops at the first that has to wait', async () => {
    const b = await player();
    const box = new Outbox(b);
    offline = true;
    await box.send(run({ board: 'solo:ship', score: 1000 }));
    await box.send(run({ board: 'solo:ship', score: 1300 }));
    expect(box.waiting).toBe(2);
    offline = false;
    await wait();
    calls = [];
    await box.flush();
    // The second send hits the rate limit and waits for the next flush.
    expect(box.waiting).toBe(1);
    await wait();
    await box.flush();
    expect(box.waiting).toBe(0);
    const rows = await b.board({ board: 'solo:ship', period: 'all', league: 0 });
    expect(rows?.find((r) => r.you)?.score).toBe(1300);
  });

  it('does nothing without a server', async () => {
    const { LocalBackend } = await import('../src/server/local');
    const box = new Outbox(new LocalBackend());
    expect(await box.send(run())).toBeNull();
  });
});

describe('boards', () => {
  it('has a tab for the week, endless and every solo environment', () => {
    expect(BOARD_TABS.map((t) => t.board)).toEqual(['ranked', 'endless', ...ENVIRONMENTS.map((e) => `solo:${e.id}`)]);
  });

  it('puts each kind of run on its board (set levels have none)', () => {
    expect(boardForRun('ranked', null, false)).toBe('ranked');
    expect(boardForRun('endless', null, false)).toBe('endless');
    expect(boardForRun('solo', 'ice', false)).toBe('solo:ice');
    expect(boardForRun('solo', null, true)).toBeNull();
  });

  it('every board the game can name is one the database accepts', async () => {
    const b = await player();
    for (const tab of BOARD_TABS) {
      await wait();
      const path = tab.board === 'ranked' ? Array.from({ length: 500 }, () => 0) : [];
      const r = await b.submitRun(run({ board: tab.board, path }));
      expect(r.status, tab.board).toBe('ok');
    }
  });
});
