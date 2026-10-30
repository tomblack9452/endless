import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import SETUP from '../supabase/setup.sql?raw';
import { CONFIG } from '../src/core/config';
import { ALLOWED, REFUSED } from './nameCases';
import { applyMigrations } from '../scripts/apply-db-lib.mjs';
import { PART_LIMIT, partFiles, statements } from '../scripts/sql-split.mjs';

// The database, run for real: PGlite is Postgres in WASM, with a stand-in for
// the bits of Supabase the schema leans on (the auth schema and its roles).
// This is how the leaderboard is tested without a Supabase project.

const files = import.meta.glob<string>('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });

/** Every migration in order: [file name, sql]. */
const migrations: [string, string][] = Object.entries(files)
  .map(([path, sql]): [string, string] => [path.split('/').pop() as string, sql])
  .sort((a, b) => a[0].localeCompare(b[0]));

/** The small parts `npm run db:setup` writes to supabase/parts/ (not committed), made here in memory, in order. */
const PART_FILES = partFiles(migrations.map(([, sql]) => sql.trim()).join('\n\n'), PART_LIMIT);
const PARTS: string[] = PART_FILES.map((p) => p.text);

const SUPABASE_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), is_anonymous boolean not null default true, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

let db: PGlite;
const users: string[] = [];

async function newUser(): Promise<string> {
  await db.exec('reset role');
  const r = await db.query<{ id: string }>('insert into auth.users default values returning id');
  users.push(r.rows[0].id);
  return r.rows[0].id;
}

/** Act as this player (or nobody) for the next calls. */
async function as(id: string | null): Promise<void> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  await db.exec(id ? 'set role authenticated' : 'set role anon');
}

async function admin(): Promise<void> {
  await db.exec('reset role');
}

/** Let the rate limit pass (as if the last run was a minute ago). */
async function age(): Promise<void> {
  await admin();
  await db.exec("update public.runs set at = at - interval '1 minute'");
}

interface Run {
  board?: string;
  league?: number;
  score?: number;
  seconds?: number;
  distance?: number;
  finished?: boolean;
  path?: number[];
}

/** A plausible endless run unless told otherwise (about 40 s at 50 units/s). */
async function submit(r: Run = {}): Promise<{ rank: number; best: number; newBest: boolean }> {
  const distance = r.distance ?? 2000;
  const board = r.board ?? 'endless';
  const path = r.path ?? (board === 'ranked' || board === 'daily' ? Array.from({ length: Math.ceil(distance / 4) }, (_, i) => Math.sin(i / 9)) : []);
  const res = await db.query<{ submit_run: { rank: number; best: number; newBest: boolean } }>(
    'select public.submit_run($1, $2::smallint, $3, $4::real, $5::real, $6, $7::real[])',
    [board, r.league ?? 0, r.score ?? 1500, r.seconds ?? 40, distance, r.finished ?? false, `{${path.join(',')}}`],
  );
  return res.rows[0].submit_run;
}

async function board(b: string, period = 'all', league = 0, limit = 50) {
  const res = await db.query<{ rank: string; name: string; score: number; you: boolean; ship: Record<string, unknown> | null }>(
    'select * from public.leaderboard($1, $2, $3::smallint, $4)',
    [b, period, league, limit],
  );
  return res.rows.map((r) => ({ ...r, rank: Number(r.rank) }));
}

async function rejects(p: Promise<unknown>, text: RegExp): Promise<void> {
  await expect(p).rejects.toThrow(text);
}

const thisWeek = async (): Promise<string> => {
  await admin();
  return (await db.query<{ w: string }>("select (date_trunc('week', now() at time zone 'utc'))::date::text as w")).rows[0].w;
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  for (const [, sql] of migrations) await db.exec(sql);
});

describe('supabase/setup.sql', () => {
  it('is every migration in order (run `npm run db:setup`)', () => {
    let at = -1;
    for (const [f, sql] of migrations) {
      expect(SETUP, f).toContain(sql.trim());
      const i = SETUP.indexOf(`-- ===== ${f} =====`);
      expect(i, f).toBeGreaterThan(at);
      at = i;
    }
  });

  it('runs in one go on a fresh database', async () => {
    const fresh = new PGlite();
    await fresh.exec(SUPABASE_STANDIN);
    await fresh.exec(SETUP);
    const t = await fresh.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' order by 1");
    expect(t.rows.map((r) => r.table_name)).toEqual([
      'bests',
      'client_errors',
      'core_log',
      'name_words',
      'players',
      'reports',
      'runs',
      'saves',
      'store_events',
      'wallets',
    ]);
  });

  it('can run again over a database it already set up, as the Supabase GitHub integration does', async () => {
    const twice = new PGlite();
    await twice.exec(SUPABASE_STANDIN);
    await twice.exec(SETUP);
    await twice.exec("insert into auth.users (id) values ('00000000-0000-0000-0000-000000000001')");
    await twice.exec(SETUP);
    for (const [, sql] of migrations) await twice.exec(sql);
    const players = await twice.query<{ n: number }>('select count(*)::int as n from public.players');
    expect(players.rows[0].n).toBe(1); // data kept
    const views = await twice.query<{ n: number }>("select count(*)::int as n from information_schema.views where table_schema = 'public'");
    expect(views.rows[0].n).toBe(0); // the old board view stays gone
  });
});

describe('supabase/parts (for pasting a little at a time)', () => {
  it('are small enough that a paste cut off at 4 KB cannot clip one', () => {
    expect(PARTS.length).toBeGreaterThan(1);
    for (const p of PARTS) expect(new TextEncoder().encode(p).length).toBeLessThan(3800);
  });

  it('say which part they are, in order, with none missing', () => {
    PARTS.forEach((p, i) => expect(p.split('\n')[0]).toContain(`part ${i + 1} of ${PARTS.length}`));
    expect(PART_FILES.map((p) => p.name)).toEqual([...PART_FILES.map((p) => p.name)].sort());
  });

  it('are the migrations, in order, with nothing added or lost', () => {
    const body = PARTS.map((p) => p.split('\n').slice(2).join('\n').trim()).join('\n\n');
    expect(statements(body)).toEqual(statements(migrations.map(([, sql]) => sql.trim()).join('\n\n')));
  });

  it('never cut a statement: every part is whole statements', () => {
    const all = statements(migrations.map(([, sql]) => sql.trim()).join('\n\n'));
    const fromParts = PARTS.flatMap((p) => statements(p.split('\n').slice(2).join('\n')));
    expect(fromParts).toEqual(all);
  });

  it('run one after another to the same database as the single file', async () => {
    const names = async (d: PGlite) => {
      const t = await d.query<{ n: string }>("select table_name n from information_schema.tables where table_schema = 'public' order by 1");
      const f = await d.query<{ n: string }>("select routine_name n from information_schema.routines where routine_schema = 'public' order by 1");
      return [t.rows.map((r) => r.n), f.rows.map((r) => r.n)];
    };
    const one = new PGlite();
    await one.exec(SUPABASE_STANDIN);
    await one.exec(SETUP);
    const many = new PGlite();
    await many.exec(SUPABASE_STANDIN);
    for (const p of PARTS) await many.exec(p);
    expect(await names(many)).toEqual(await names(one));
    expect((await names(many))[1]).toEqual(expect.arrayContaining(['check_run', 'submit_run', 'leaderboard', 'set_pilot_name', 'earn_cores', 'spend_cores']));
  });
});

describe('db:apply (the migrations from a terminal)', () => {
  /** The throwaway database, shaped like pg's client: multi-statement strings run whole. */
  const asClient = (d: PGlite) => ({
    query: async (sql: string, params?: unknown[]) => (params ? d.query(sql, params) : { rows: (await d.exec(sql)).flatMap((r) => r.rows) }),
  });
  const fresh = async () => {
    const d = new PGlite();
    await d.exec(SUPABASE_STANDIN);
    return d;
  };

  it('applies each migration once, and does nothing the second time', async () => {
    const d = await fresh();
    const first = await applyMigrations(asClient(d), migrations);
    expect(first.applied).toEqual(migrations.map(([f]) => f));
    const second = await applyMigrations(asClient(d), migrations);
    expect(second).toEqual({ applied: [], recorded: [] });
    const t = await d.query<{ n: string }>("select table_name n from information_schema.tables where table_schema = 'public' order by 1");
    expect(t.rows.map((r) => r.n)).toEqual([
      'bests',
      'client_errors',
      'core_log',
      'endless_migrations',
      'name_words',
      'players',
      'reports',
      'runs',
      'saves',
      'store_events',
      'wallets',
    ]);
    // Every table has row-level security on (Supabase's advisor flags any that don't).
    const open = await d.query<{ n: string }>(
      "select relname n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    expect(open.rows).toEqual([]);
  });

  it('picks up a newer migration on its own', async () => {
    const d = await fresh();
    await applyMigrations(asClient(d), migrations.slice(0, 2));
    const later = await applyMigrations(asClient(d), migrations);
    expect(later.applied).toEqual(migrations.slice(2).map(([f]) => f));
  });

  it('recognises a database that was set up by pasting the SQL', async () => {
    const d = await fresh();
    await d.exec(SETUP);
    const r = await applyMigrations(asClient(d), migrations);
    expect(r.applied).toEqual([]);
    expect(r.recorded).toEqual(migrations.map(([f]) => f));
  });

  it('keeps nothing from a migration that fails, and says which', async () => {
    const d = await fresh();
    const broken: [string, string][] = [...migrations.slice(0, 2), ['0004_broken.sql', 'create table public.half (id int); select 1 / 0;']];
    await expect(applyMigrations(asClient(d), broken)).rejects.toThrow(/0004_broken.sql failed, nothing from it was kept/);
    const t = await d.query<{ n: string }>("select table_name n from information_schema.tables where table_schema = 'public' and table_name = 'half'");
    expect(t.rows).toHaveLength(0);
    // And the earlier ones stay done.
    expect((await d.query<{ name: string }>('select name from public.endless_migrations order by 1')).rows.map((r) => r.name)).toEqual([
      migrations[0][0],
      migrations[1][0],
    ]);
  });
});

describe('accounts', () => {
  it('a new account gets a pilot name and a wallet', async () => {
    const id = await newUser();
    await admin();
    const p = await db.query<{ name: string }>('select name from public.players where user_id = $1', [id]);
    expect(p.rows[0].name).toMatch(/^pilot-[0-9a-f]{4}$/);
    const w = await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [id]);
    expect(w.rows[0].cores).toBe(0);
  });

  it('can be deleted by its owner, taking its save, wallet, runs and bests with it', async () => {
    const [a, b] = [await newUser(), await newUser()];
    await as(a);
    await db.query("select public.set_pilot_name('Gone Soon')");
    await submit({ board: 'endless', score: 1200 });
    await as(null);
    await rejects(db.query('select public.delete_my_account()'), /permission denied|not signed in/);
    await as(a);
    await db.query('select public.delete_my_account()');
    await admin();
    for (const t of ['players', 'wallets', 'runs', 'bests', 'saves'])
      expect((await db.query(`select 1 from public.${t} where user_id = $1`, [a])).rows.length, t).toBe(0);
    expect((await db.query('select 1 from auth.users where id = $1', [a])).rows.length).toBe(0);
    expect((await db.query('select 1 from auth.users where id = $1', [b])).rows.length).toBe(1);
  });
});

describe('the 1.0.11 audit', () => {
  it('delete_my_account takes everything since 1.0.7 with it: reports either way, error reports, the league and daily bests', async () => {
    const [a, b] = [await newUser(), await newUser()];
    await admin();
    const pid = async (u: string) => (await db.query<{ public_id: string }>('select public_id from public.players where user_id = $1', [u])).rows[0].public_id;
    const [pa, pb] = [await pid(a), await pid(b)];
    await as(a);
    await db.query('select public.report_pilot($1, $2)', [pb, 'score']);
    await db.query('select public.log_errors($1::jsonb)', [JSON.stringify([{ message: 'x', at: Date.now() }])]);
    await submit({ board: 'daily', score: 2000, distance: 3000, seconds: 60 });
    await age();
    await as(a);
    await submit({ board: 'ranked', league: 1, score: 1500 });
    await as(b);
    await db.query('select public.report_pilot($1, $2)', [pa, 'name']);
    await admin();
    expect((await db.query('select league from public.players where user_id = $1', [a])).rows).toEqual([{ league: 1 }]);
    await as(a);
    await db.query('select public.delete_my_account()');
    await admin();
    for (const [t, col] of [
      ['reports', 'reporter'],
      ['reports', 'target'],
      ['client_errors', 'user_id'],
      ['players', 'user_id'],
      ['bests', 'user_id'],
      ['runs', 'user_id'],
      ['core_log', 'user_id'],
    ])
      expect((await db.query(`select 1 from public.${t} where ${col} = $1`, [a])).rows.length, `${t}.${col}`).toBe(0);
  });

  it("lets signed-out callers run nothing but the server's clock (and the pure helpers), and no player run the account trigger", async () => {
    await admin();
    const fns = await db.query<{ sig: string; anon: boolean; auth: boolean; definer: boolean; config: string[] | null }>(
      `select p.oid::regprocedure::text as sig, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as auth, p.prosecdef as definer, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`,
    );
    const anon = fns.rows
      .filter((f) => f.anon)
      .map((f) => f.sig.replace(/\(.*/, ''))
      .sort();
    expect(anon).toEqual(['daily_period', 'pass_season', 'server_now']); // the clock, and two pure date helpers
    expect(fns.rows.find((f) => f.sig === 'on_new_user()')).toMatchObject({ anon: false, auth: false });
    // Every function has its own search_path (Supabase's linter), the security definer ones above all.
    for (const f of fns.rows) expect(f.config ?? [], f.sig).toContain('search_path=public');
  });
});

describe('submit_run', () => {
  it('keeps a plausible run and ranks it', async () => {
    const a = await newUser();
    await as(a);
    const r = await submit({ score: 1500 });
    expect(r).toEqual({ rank: 1, best: 1500, newBest: true });
    const rows = await board('endless');
    expect(rows.find((x) => x.you)?.score).toBe(1500);
  });

  it('only keeps the best run per player on a board', async () => {
    const a = await newUser();
    await as(a);
    await submit({ board: 'solo:ice', score: 1800 });
    await age();
    await as(a);
    const worse = await submit({ board: 'solo:ice', score: 900 });
    expect(worse.newBest).toBe(false);
    expect(worse.best).toBe(1800);
    await age();
    await as(a);
    const better = await submit({ board: 'solo:ice', score: 2100 });
    expect(better.newBest).toBe(true);
    const mine = (await board('solo:ice')).filter((x) => x.you);
    expect(mine).toHaveLength(1);
    expect(mine[0].score).toBe(2100);
  });

  it('orders players best first and says who you are', async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    for (const [u, score] of [
      [a, 1000],
      [b, 1700],
      [c, 1300],
    ] as const) {
      await as(u);
      await submit({ board: 'solo:canyon', score });
    }
    await as(c);
    const rows = await board('solo:canyon');
    expect(rows.map((r) => r.score)).toEqual([1700, 1300, 1000]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rows.map((r) => r.you)).toEqual([false, true, false]);
  });

  it('adds your own row at the end when you are outside the top', async () => {
    const top = [];
    for (let i = 0; i < 4; i++) top.push(await newUser());
    const last = await newUser();
    for (const [i, u] of top.entries()) {
      await as(u);
      await submit({ board: 'solo:volcanic', score: 2000 - i * 100 });
    }
    await as(last);
    await submit({ board: 'solo:volcanic', score: 500 });
    const rows = await board('solo:volcanic', 'all', 0, 3);
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).every((r) => !r.you)).toBe(true);
    expect(rows[3]).toMatchObject({ rank: 5, score: 500, you: true });
  });

  it('ranks the week per league, and a new week starts clean', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const week = await thisWeek();
    await as(a);
    await submit({ board: 'ranked', league: 0, score: 1200 });
    await as(b);
    await submit({ board: 'ranked', league: 2, score: 1900 });
    expect((await board('ranked', week, 0)).map((r) => r.score)).toContain(1200);
    expect((await board('ranked', week, 0)).map((r) => r.score)).not.toContain(1900);
    expect((await board('ranked', week, 2)).map((r) => r.score)).toContain(1900);
    expect(await board('ranked', '2001-01-01', 0)).toEqual([]);
  });

  it('turns away runs that cannot have happened', async () => {
    const a = await newUser();
    await as(a);
    await rejects(submit({ board: 'nonsense' }), /unknown board/);
    await rejects(submit({ score: 9_000_000 }), /too high/);
    await rejects(submit({ distance: 9000, seconds: 20, score: 3000 }), /too fast/);
    await rejects(submit({ seconds: 2 }), /bad time/);
    await rejects(submit({ score: -5 }), /bad score/);
    await rejects(submit({ board: 'ranked', league: 9 }), /bad league/);
    await rejects(submit({ board: 'ranked', path: [0, 0, 0] }), /path does not match/);
    const jumpy = Array.from({ length: 500 }, (_, i) => (i % 2 === 0 ? 0 : 40));
    await rejects(submit({ board: 'ranked', path: jumpy }), /path jumps/);
  });

  it('turns away signed-out callers', async () => {
    await as(null);
    await expect(submit()).rejects.toThrow(/permission denied|sign in/);
  });

  it('rate limits one player', async () => {
    const a = await newUser();
    await as(a);
    await submit({ score: 1000 });
    await rejects(submit({ score: 1100 }), /too quickly/);
  });

  it('players cannot write the tables themselves', async () => {
    const a = await newUser();
    await as(a);
    await expect(db.query("insert into public.bests (board, period, user_id, score, seconds) values ('endless','all',$1,99999,1)", [a])).rejects.toThrow();
    const peek = await db.query('select * from public.bests');
    expect(peek.rows).toHaveLength(0); // row security: the boards are read through leaderboard()
    await expect(db.query("update public.players set name = 'cheater' where user_id = $1", [a])).resolves.toMatchObject({ affectedRows: 0 });
  });

  it('keeps hidden players off the boards', async () => {
    const [a, b] = [await newUser(), await newUser()];
    await as(a);
    await submit({ board: 'solo:ship', score: 1900 });
    await as(b);
    await submit({ board: 'solo:ship', score: 1100 });
    await admin();
    await db.query('update public.players set hidden = true where user_id = $1', [a]);
    await as(b);
    expect((await board('solo:ship')).map((r) => r.score)).toEqual([1100]);
  });
});

describe('the daily challenge', () => {
  const today = async (): Promise<string> => {
    await admin();
    return (await db.query<{ d: string }>("select ((now() at time zone 'utc')::date)::text as d")).rows[0].d;
  };
  const earn = async (amount: number, reason: string) =>
    (await db.query<{ earn_cores: number }>('select public.earn_cores($1, $2)', [amount, reason])).rows[0].earn_cores;

  it("takes a run on the daily board, filed under the server's day, everyone together", async () => {
    const [a, b] = [await newUser(), await newUser()];
    const day = await today();
    await as(a);
    expect(await submit({ board: 'daily', league: 3, score: 2400, distance: 3600, seconds: 70, finished: true })).toEqual({
      rank: 1,
      best: 2400,
      newBest: true,
    });
    await as(b);
    expect(await submit({ board: 'daily', score: 2600, distance: 3000, seconds: 60 })).toMatchObject({ rank: 1, newBest: true });
    const rows = await board('daily', day, 0);
    expect(rows.map((r) => r.score)).toEqual([2600, 2400]);
    expect(rows.map((r) => r.you)).toEqual([true, false]);
    expect(await board('daily', 'all', 0)).toEqual([]);
    expect(await board('daily', '2001-01-01', 0)).toEqual([]);
    await admin();
    expect((await db.query<{ league: number }>("select distinct league from public.bests where board = 'daily'")).rows).toEqual([{ league: 0 }]);
  });

  it('checks it as ranked runs are checked, and no longer than the course', async () => {
    const a = await newUser();
    await as(a);
    await rejects(submit({ board: 'daily', path: [0, 0, 0] }), /path does not match/);
    const jumpy = Array.from({ length: 500 }, (_, i) => (i % 2 === 0 ? 0 : 40));
    await rejects(submit({ board: 'daily', path: jumpy }), /path jumps/);
    await rejects(submit({ board: 'daily', distance: CONFIG.daily.length + 400, seconds: 80, score: 3000 }), /longer than the daily course/);
    await rejects(submit({ board: 'daily', score: 9_000_000 }), /too high/);
    await rejects(submit({ board: 'daily', distance: 3000, seconds: 10, score: 2000 }), /too fast/);
    await rejects(submit({ board: 'dailies' }), /unknown board/);
  });

  it("pays the streak's cores once a day, 3 at most, for today only", async () => {
    const a = await newUser();
    const day = await today();
    await as(a);
    expect(await earn(9, `daily:${day}`)).toBe(3);
    expect(await earn(3, `daily:${day}`)).toBe(0);
    expect(await earn(3, 'daily:2020-01-01')).toBe(0);
    expect(await earn(3, `daily:${new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)}`)).toBe(0);
    expect(await earn(3, 'daily:nonsense')).toBe(0);
    expect(Math.max(...CONFIG.daily.streak.map((s) => ('cores' in s ? s.cores : 0)))).toBeLessThanOrEqual(3);
  });

  it('pays the free cores for an ad once a day, 5 at most, for today only (0027)', async () => {
    const a = await newUser();
    const day = await today();
    await as(a);
    expect(await earn(50, `adcores:${day}`)).toBe(5);
    expect(await earn(5, `adcores:${day}`)).toBe(0);
    expect(await earn(5, 'adcores:2020-01-01')).toBe(0);
    expect(await earn(5, 'adcores:nonsense')).toBe(0);
    expect(CONFIG.ads.freeCores).toBeLessThanOrEqual(5);
  });

  it("keeps the course's length in step with the game", () => {
    const sql = migrations.map(([, text]) => text).join('\n');
    const m = /c_daily_length constant numeric := ([0-9.]+)/.exec(sql);
    expect(Number(m?.[1])).toBeGreaterThan(CONFIG.daily.length);
    expect(Number(m?.[1])).toBeLessThan(CONFIG.daily.length * 1.1);
  });
});

describe('leagues on the server', () => {
  const leagueOf = async (u: string) => {
    await admin();
    return (await db.query<{ league: number | null }>('select league from public.players where user_id = $1', [u])).rows[0].league;
  };
  const ranked = async (league: number, score = 1500) => {
    await age();
    return submit({ board: 'ranked', league, score });
  };

  it('keeps a new player in the league of their first ranked run', async () => {
    const a = await newUser();
    await as(a);
    await ranked(1);
    expect(await leagueOf(a)).toBe(1);
  });

  it('seeds a player from before this from their latest ranked run, and puts a lower-league run on their own board', async () => {
    const a = await newUser();
    const week = await thisWeek();
    await as(a);
    await ranked(3, 1100);
    await admin();
    await db.query('update public.players set league = null where user_id = $1', [a]); // as before 0015
    await as(a);
    const low = await ranked(0, 2600); // sent for bronze, flown by a platinum pilot
    expect(low.best).toBe(2600);
    expect(await leagueOf(a)).toBe(3);
    expect((await board('ranked', week, 0)).map((r) => r.score)).not.toContain(2600);
    expect((await board('ranked', week, 3)).map((r) => r.score)).toContain(2600);
  });

  it('promotes one league at a time, once enough ranked runs were flown in it', async () => {
    const a = await newUser();
    await as(a);
    await ranked(0);
    await rejects(ranked(1), /not in that league yet/);
    await rejects(ranked(4), /not in that league yet/);
    for (let i = 0; i < 11; i++) await ranked(0); // 12 in bronze now
    await rejects(ranked(2), /not in that league yet/); // two at once: never
    await ranked(1);
    expect(await leagueOf(a)).toBe(1);
    await rejects(ranked(2), /not in that league yet/); // and again from the start
    await ranked(0); // a late bronze run counts in silver
    expect(await leagueOf(a)).toBe(1);
  });

  it('leaves the other boards alone', async () => {
    const a = await newUser();
    await as(a);
    await ranked(2);
    await age();
    await submit({ board: 'endless', league: 0, score: 1300 });
    expect(await leagueOf(a)).toBe(2);
  });

  it('puts a maxed-out player in the top league', async () => {
    const a = await newUser();
    await admin();
    await db.query('update public.players set max_out = true where user_id = $1', [a]);
    await as(a);
    await db.query('select public.take_max_out()');
    expect(await leagueOf(a)).toBe(6);
  });

  it("can't be called on its own", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query(`select public.ranked_league('${a}', 6::smallint)`), /permission denied/);
  });
});

describe('pilot names', () => {
  it('lets you pick a valid free name', async () => {
    const a = await newUser();
    await as(a);
    const res = await db.query<{ set_pilot_name: string }>("select public.set_pilot_name('  Ace Pilot ')");
    expect(res.rows[0].set_pilot_name).toBe('Ace Pilot');
    await submit({ board: 'solo:asteroids', score: 1000 });
    expect((await board('solo:asteroids')).find((r) => r.you)?.name).toBe('Ace Pilot');
  });

  it('refuses bad, taken and too-frequent names', async () => {
    const [a, b] = [await newUser(), await newUser()];
    await as(a);
    await db.query("select public.set_pilot_name('Nova9')");
    await as(b);
    await rejects(db.query("select public.set_pilot_name('no')"), /3 to 16/);
    await rejects(db.query("select public.set_pilot_name('<script>alert(1)</script>')"), /3 to 16/);
    await rejects(db.query("select public.set_pilot_name('nova9')"), /taken/);
    await db.query("select public.set_pilot_name('Vega7')");
    await rejects(db.query("select public.set_pilot_name('Vega8')"), /once an hour/);
  });
});

describe('credits on the server', () => {
  const sync = async (credits: number, last: number | null) =>
    Number((await db.query<{ sync_credits: string }>('select public.sync_credits($1, $2)', [credits, last])).rows[0].sync_credits);

  it('start from the device, then carry over changes made in the dashboard', async () => {
    const a = await newUser();
    await as(a);
    expect(await sync(1200, null)).toBe(1200); // first sync: the device's balance
    expect(await sync(1500, 1200)).toBe(1500); // earned 300 on the device
    await admin();
    await db.query('update public.wallets set credits = credits + 5000 where user_id = $1', [a]); // a gift from the dashboard
    await as(a);
    expect(await sync(1400, 1500)).toBe(6400); // spent 100 meanwhile, and the gift arrives
    await admin();
    await db.query('update public.wallets set credits = 0 where user_id = $1', [a]); // taken away
    await as(a);
    expect(await sync(6400, 6400)).toBe(0);
  });

  it('give a device that never synced the server balance, and refuse nonsense', async () => {
    const a = await newUser();
    await as(a);
    await sync(800, null);
    expect(await sync(50, null)).toBe(800);
    await rejects(db.query('select public.sync_credits(-5, null)'), /not a balance/);
    await as(null);
    await rejects(db.query('select public.sync_credits(5, null)'), /permission denied|not signed in/);
  });
});

describe('credit packs (0026)', () => {
  const sync = async (credits: number, last: number | null) =>
    Number((await db.query<{ sync_credits: string }>('select public.sync_credits($1, $2)', [credits, last])).rows[0].sync_credits);
  const buy = async (id: string, user: string, credits: number) => {
    await admin();
    return (
      await db.query<{ r: string }>("select public.store_credit_purchase($1, $2, 'credits_5000', 'NON_RENEWING_PURCHASE', $3, $4, now()) as r", [
        id,
        user,
        `tx-${id}`,
        credits,
      ])
    ).rows[0].r;
  };

  it('pay a pack once, however often the webhook sends it', async () => {
    const a = await newUser();
    await as(a);
    expect(await sync(1000, null)).toBe(1000);
    expect(await buy('cp-1', a, 5000)).toBe('paid');
    expect(await buy('cp-1', a, 5000)).toBe('duplicate'); // RevenueCat again after a timeout
    await as(a);
    expect(await sync(1200, 1000)).toBe(6200); // earned 200 meanwhile, and the pack once
    expect(await sync(6200, 6200)).toBe(6200);
    expect(await buy('cp-2', a, 5000)).toBe('paid'); // a second pack is a new purchase
    await as(a);
    expect(await sync(6200, 6200)).toBe(11200);
  });

  it('keep a pack bought before the first sync until it', async () => {
    const a = await newUser();
    expect(await buy('cp-early', a, 5000)).toBe('paid');
    await as(a);
    expect(await sync(300, null)).toBe(5300);
    expect(await sync(5300, 5300)).toBe(5300); // paid once, not again
  });

  it('take a refunded pack back, never below zero', async () => {
    const a = await newUser();
    await as(a);
    await sync(100, null);
    await buy('cp-r', a, 5000);
    await as(a);
    expect(await sync(100, 100)).toBe(5100);
    expect(await sync(2100, 5100)).toBe(2100); // spent 3000 of it
    await admin();
    const refund = async () =>
      (await db.query<{ r: string }>("select public.store_credit_refund('rf-1', $1, 'credits_5000', 'tx-cp-r', 5000) as r", [a])).rows[0].r;
    expect(await refund()).toBe('refunded');
    expect(await refund()).toBe('duplicate');
    await as(a);
    expect(await sync(2100, 2100)).toBe(0);
  });

  it("can't be called by a player", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query(`select public.store_credit_purchase('x', '${a}', 'credits_5000', 'INITIAL_PURCHASE', 'x', 5000, now())`), /permission denied/);
    await rejects(db.query(`select public.store_credit_refund('x', '${a}', 'credits_5000', 'x', 5000)`), /permission denied/);
    await rejects(db.query(`select public.give_credits('${a}', 5000)`), /permission denied/);
  });
});

describe('cores', () => {
  const earn = async (amount: number, reason: string) =>
    (await db.query<{ earn_cores: number }>('select public.earn_cores($1, $2)', [amount, reason])).rows[0].earn_cores;
  const today = () => new Date().toISOString().slice(0, 10);
  const season = () => Math.floor((Date.parse(today()) - Date.UTC(2026, 8, 14)) / (42 * 86_400_000)) + 1;

  it("can't be granted by a player (only the purchase webhook's service key)", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query(`select public.grant_cores('${a}', 99999, 'x')`), /permission denied/);
  });

  it('pay each real reward once, at most its size, for today only', async () => {
    const a = await newUser();
    await as(a);
    expect(await earn(15, `login:${today()}`)).toBe(15);
    expect(await earn(15, `login:${today()}`)).toBe(0); // once
    expect(await earn(999, `gift:${today()}`)).toBe(2); // its size
    expect(await earn(15, 'login:2020-01-01')).toBe(0); // not today
    expect(await earn(120, 'reward')).toBe(0); // not a reward
    expect(await earn(40, 'set:forge')).toBe(40);
    expect(await earn(40, 'set:made-up')).toBe(0);
    expect(await earn(50, `pass:${season()}:p30`)).toBe(50);
    expect(await earn(50, `pass:${season() + 1}:p30`)).toBe(0); // not this season
    await admin();
    expect((await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [a])).rows[0].cores).toBe(15 + 2 + 40 + 50);
  });

  it("turn down date-keyed rewards from the future, made-up dates, and weeks that aren't a Monday", async () => {
    const a = await newUser();
    await as(a);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    const monday = (n: number) => {
      const d = new Date();
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + n)).toISOString().slice(0, 10);
    };
    for (const kind of ['login', 'gift', 'goals']) {
      expect(await earn(15, `${kind}:${day(2)}`)).toBe(0); // a moved clock
      expect(await earn(15, `${kind}:${day(30)}`)).toBe(0);
    }
    expect(await earn(15, `login:${day(1)}`)).toBe(15); // a time zone ahead of UTC, after its midnight
    expect(await earn(15, `login:${day(-1)}`)).toBe(15); // behind, before its midnight
    expect(await earn(15, 'login:2026-02-30')).toBe(0); // not a date: no, and no error
    expect(await earn(15, 'gift:2026-13-01')).toBe(0);
    expect(await earn(15, `weekly:${monday(0)}`)).toBe(15); // this week
    expect(await earn(15, `weekly:${monday(7)}`)).toBe(0); // next week
    expect(await earn(15, `weekly:${monday(1)}`)).toBe(0); // this week again, as a Tuesday
  });

  it("tell anyone the server's time", async () => {
    await as(null);
    const at = (await db.query<{ server_now: Date }>('select public.server_now()')).rows[0].server_now;
    expect(Math.abs(new Date(at).getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('pay no more pass cores in a season than the whole pass holds', async () => {
    const a = await newUser();
    await as(a);
    let total = 0;
    for (let t = 1; t <= 30; t++) for (const track of ['f', 'p']) total += await earn(50, `pass:${season()}:${track}${t}`);
    expect(total).toBe(300);
  });

  it('take a spend sent again after a lost answer once (0024)', async () => {
    const a = await newUser();
    await admin();
    await db.query('update public.wallets set cores = 100 where user_id = $1', [a]);
    await as(a);
    const spend = async (n: number, id: string | null) =>
      (await db.query<{ spend_cores_once: boolean }>('select public.spend_cores_once($1, $2, $3)', [n, 'look', id])).rows[0].spend_cores_once;
    const old = async (n: number) => (await db.query<{ spend_cores: boolean }>("select public.spend_cores($1, 'look')", [n])).rows[0].spend_cores;
    expect(await spend(30, 'abc-1')).toBe(true);
    expect(await spend(30, 'abc-1')).toBe(true); // the same spend again: "taken", no charge
    expect(await spend(30, 'abc-2')).toBe(true); // a new spend charges
    expect(await old(30)).toBe(true); // an older game, no id: as before
    expect(await old(30)).toBe(false); // 10 left
    expect(await spend(5, null)).toBe(false); // no id: not this function's
    expect(await spend(5, 'x'.repeat(65))).toBe(false); // an id that long isn't one of the game's
    expect(await spend(5, 'abc-3')).toBe(true);
    await admin();
    expect((await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [a])).rows[0].cores).toBe(5);
    // Another player's spend with the same id is theirs, not "taken".
    const b = await newUser();
    await db.query('update public.wallets set cores = 50 where user_id = $1', [b]);
    await as(b);
    expect(await spend(20, 'abc-1')).toBe(true);
    await admin();
    expect((await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [b])).rows[0].cores).toBe(30);
  });

  it("can't be spent by someone signed out", async () => {
    await as(null);
    await rejects(db.query("select public.spend_cores_once(5, 'look', 'id')"), /permission denied/);
  });

  it('counts accounts for the service role only (0025)', async () => {
    const a = await newUser();
    await newUser();
    await db.query('update auth.users set is_anonymous = false where id = $1', [a]);
    await db.query("update auth.users set created_at = now() - interval '60 days' where id = $1", [a]);
    await db.exec('set role service_role');
    const c = (await db.query<{ accounts: string; anonymous: string; google: string; new_30d: string }>('select * from public.account_counts()')).rows[0];
    await admin();
    const all = Number((await db.query<{ n: string }>('select count(*) as n from auth.users')).rows[0].n);
    const old = Number((await db.query<{ n: string }>("select count(*) as n from auth.users where created_at <= now() - interval '30 days'")).rows[0].n);
    expect(Number(c.accounts)).toBe(all);
    expect(Number(c.anonymous) + Number(c.google)).toBe(all);
    expect(Number(c.google)).toBeGreaterThanOrEqual(1);
    expect(Number(c.new_30d)).toBe(all - old);
    for (const who of [a, null]) {
      await as(who);
      await rejects(db.query('select * from public.account_counts()'), /permission denied/);
    }
    await admin();
  });
});

describe('store purchases (the webhook, with the service key)', () => {
  const buy = async (id: string, user: string, product: string, cores: number, tx = id) =>
    (await db.query<{ store_purchase: string }>('select public.store_purchase($1, $2, $3, $4, $5, $6)', [id, user, product, 'INITIAL_PURCHASE', tx, cores]))
      .rows[0].store_purchase;
  const refund = async (id: string, user: string, product: string, cores: number, tx: string) =>
    (await db.query<{ store_refund: string }>('select public.store_refund($1, $2, $3, $4, $5)', [id, user, product, tx, cores])).rows[0].store_refund;
  const coresOf = async (u: string) => (await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [u])).rows[0].cores;
  const products = async (u: string) =>
    (await db.query<{ product: string }>('select product from public.store_events where user_id = $1 order by at, id', [u])).rows.map((r) => r.product);

  it('keep the event and pay its cores together, once', async () => {
    const a = await newUser();
    await admin();
    expect(await buy('ev1', a, 'cores_550', 550)).toBe('paid');
    expect(await buy('ev1', a, 'cores_550', 550)).toBe('duplicate');
    expect(await coresOf(a)).toBe(550);
  });

  it('take refunds back: premium stops counting and cores come off the balance', async () => {
    const a = await newUser();
    await admin();
    await buy('ev2', a, 'premium', 0, 'tx2');
    await buy('ev3', a, 'cores_100', 100, 'tx3');
    expect(await refund('rf2', a, 'premium', 0, 'tx2')).toBe('refunded');
    expect(await refund('rf2', a, 'premium', 0, 'tx2')).toBe('duplicate');
    expect(await refund('rf3', a, 'cores_100', 100, 'tx3')).toBe('refunded');
    expect(await products(a)).toEqual(expect.arrayContaining(['refunded:premium', 'refunded:cores_100']));
    expect(await products(a)).not.toContain('premium');
    expect(await coresOf(a)).toBe(0);
  });

  it('keep when the purchase was made, not when the webhook arrived (never a time ahead of the server)', async () => {
    const a = await newUser();
    await admin();
    const at = async (id: string) => (await db.query<{ at: Date }>('select at from public.store_events where id = $1', [id])).rows[0].at.getTime();
    const bought = Date.now() - 3 * 86_400_000;
    await db.query('select public.store_purchase_at($1, $2, $3, $4, $5, $6, $7)', [
      'ev-at',
      a,
      'season_pass',
      'NON_RENEWING_PURCHASE',
      'tx-at',
      0,
      new Date(bought).toISOString(),
    ]);
    expect(Math.abs((await at('ev-at')) - bought)).toBeLessThan(1000);
    await db.query('select public.store_purchase_at($1, $2, $3, $4, $5, $6, $7)', [
      'ev-later',
      a,
      'premium',
      'NON_RENEWING_PURCHASE',
      'tx-later',
      0,
      new Date(Date.now() + 86_400_000).toISOString(),
    ]);
    expect(await at('ev-later')).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("can't be called by a player", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query(`select public.store_purchase('x', '${a}', 'premium', 'INITIAL_PURCHASE', 'x', 0)`), /permission denied/);
    await rejects(db.query(`select public.store_refund('x', '${a}', 'premium', 'x', 0)`), /permission denied/);
    await rejects(db.query(`select public.store_purchase_at('x', '${a}', 'premium', 'INITIAL_PURCHASE', 'x', 0, now())`), /permission denied/);
  });
});

describe('a refunded season pass', () => {
  const season = async () => {
    await admin();
    return (await db.query<{ s: number }>('select public.pass_season(now()) as s')).rows[0].s;
  };
  const coresOf = async (u: string) => {
    await admin();
    return (await db.query<{ cores: number }>('select cores from public.wallets where user_id = $1', [u])).rows[0].cores;
  };
  const earn = async (u: string, amount: number, reason: string) => {
    await as(u);
    return (await db.query<{ earn_cores: number }>('select public.earn_cores($1, $2)', [amount, reason])).rows[0].earn_cores;
  };
  const buyPass = async (u: string, id: string) => {
    await admin();
    await db.query('select public.store_purchase_at($1, $2, $3, $4, $5, $6, now())', [id, u, 'season_pass', 'NON_RENEWING_PURCHASE', `tx-${id}`, 0]);
  };
  const refundPass = async (u: string, id: string) => {
    await admin();
    return (await db.query<{ store_refund: string }>('select public.store_refund($1, $2, $3, $4, $5)', [`rf-${id}`, u, 'season_pass', `tx-${id}`, 0])).rows[0]
      .store_refund;
  };

  it('takes back the cores its premium tiers paid, keeps the free track, and pays no more premium tiers', async () => {
    const a = await newUser();
    const s = await season();
    await admin();
    await db.query('update public.wallets set cores = 100 where user_id = $1', [a]);
    await buyPass(a, 'sp1');
    expect(await earn(a, 15, `pass:${s}:p3`)).toBe(15);
    expect(await earn(a, 20, `pass:${s}:p5`)).toBe(20);
    expect(await earn(a, 5, `pass:${s}:f5`)).toBe(5);
    expect(await coresOf(a)).toBe(140);
    expect(await refundPass(a, 'sp1')).toBe('refunded');
    expect(await coresOf(a)).toBe(105); // 35 from the premium tiers back
    await admin();
    const log = await db.query<{ delta: number }>('select delta from public.core_log where user_id = $1 and reason = $2', [a, `refund:pass:${s}`]);
    expect(log.rows.map((r) => r.delta)).toEqual([-35]);
    expect(await earn(a, 15, `pass:${s}:p6`)).toBe(0);
    expect(await earn(a, 5, `pass:${s}:f10`)).toBe(5);
    expect(await refundPass(a, 'sp1')).toBe('duplicate');
    expect(await coresOf(a)).toBe(110);
  });

  it('never goes below zero, and pays premium tiers again if the pass is bought again', async () => {
    const a = await newUser();
    const s = await season();
    await buyPass(a, 'sp2');
    expect(await earn(a, 20, `pass:${s}:p10`)).toBe(20);
    await admin();
    await db.query('update public.wallets set cores = 5 where user_id = $1', [a]); // spent meanwhile
    await refundPass(a, 'sp2');
    expect(await coresOf(a)).toBe(0);
    await buyPass(a, 'sp3');
    expect(await earn(a, 15, `pass:${s}:p12`)).toBe(15);
  });

  it('never touches a pass unlocked with cores', async () => {
    const a = await newUser();
    const s = await season();
    await admin();
    await db.query('update public.wallets set cores = 600 where user_id = $1', [a]);
    await as(a);
    expect((await db.query<{ spend_cores: boolean }>('select public.spend_cores(500, $1)', [`pass-premium:${s}`])).rows[0].spend_cores).toBe(true);
    expect(await earn(a, 20, `pass:${s}:p5`)).toBe(20);
    await buyPass(a, 'sp4'); // bought too, then refunded: the cores unlock still stands
    await refundPass(a, 'sp4');
    expect(await coresOf(a)).toBe(120);
    expect(await earn(a, 15, `pass:${s}:p6`)).toBe(15);
  });

  it('shows the game the refunded row', async () => {
    const a = await newUser();
    await buyPass(a, 'sp5');
    await refundPass(a, 'sp5');
    await as(a);
    const rows = await db.query<{ product: string }>('select product from public.store_events where user_id = $1', [a]);
    expect(rows.rows.map((r) => r.product)).toContain('refunded:season_pass');
  });
});

describe('reporting a pilot', () => {
  const pidOf = async (u: string) => {
    await admin();
    return (await db.query<{ public_id: string }>('select public_id from public.players where user_id = $1', [u])).rows[0].public_id;
  };
  const nameOf = async (u: string) => {
    await admin();
    return (await db.query<{ name: string }>('select name from public.players where user_id = $1', [u])).rows[0].name;
  };
  const report = async (from: string, pid: string, reason: string) => {
    await as(from);
    return (await db.query<{ report_pilot: string }>('select public.report_pilot($1, $2)', [pid, reason])).rows[0].report_pilot;
  };
  /** A pilot whose name reports count (0020): an account this many days old. */
  const pilotFor = async (days: number) => {
    const u = await newUser();
    await admin();
    await db.query(`update public.players set created_at = now() - interval '${days} days' where user_id = $1`, [u]);
    return u;
  };
  const trusted = () => pilotFor(4);
  /** Give a player `n` runs on the server. */
  const runsFor = async (u: string, n: number) => {
    await admin();
    for (let i = 0; i < n; i++)
      await db.query(
        "insert into public.runs (user_id, week, league, score, seconds, distance, finished, path, board, at) values ($1, current_date, 0, 1200, 40, 2000, false, '{}', 'endless', now() - interval '1 hour')",
        [u],
      );
  };

  it('keeps one report per reporter per pilot a week, never about yourself', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const pid = await pidOf(b);
    expect(await report(a, pid, 'score')).toBe('reported');
    expect(await report(a, pid, 'other')).toBe('already');
    await rejects(report(b, pid, 'name'), /that's you/);
    await rejects(report(a, pid, 'rude'), /pick a reason/);
    await rejects(report(a, '00000000-0000-0000-0000-000000000000', 'name'), /no such pilot/);
    await admin();
    await db.query('update public.reports set week = week - 7 where reporter = $1', [a]); // a week on
    expect(await report(a, pid, 'score')).toBe('reported');
  });

  it("can't be read or written by players, or called signed out", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query('select * from public.reports'), /permission denied/);
    await rejects(
      db.query(`insert into public.reports (reporter, target, reason, name, week) values ('${a}', '${a}', 'name', 'x', now())`),
      /permission denied/,
    );
    await as(null);
    await rejects(db.query(`select public.report_pilot('${a}', 'name')`), /permission denied/);
  });

  it('resets a name three different pilots reported, and starts counting again for the next name', async () => {
    const target = await newUser();
    await as(target);
    await db.query("select public.set_pilot_name('Rude Name')");
    const pid = await pidOf(target);
    const [a, b, c, d] = [await trusted(), await trusted(), await trusted(), await trusted()];
    await report(a, pid, 'name');
    await report(a, pid, 'name'); // the same reporter twice counts once
    await report(b, pid, 'name');
    await report(c, pid, 'score'); // a score report doesn't count towards a name
    expect(await nameOf(target)).toBe('Rude Name');
    await report(d, pid, 'name');
    expect(await nameOf(target)).toMatch(/^pilot-[0-9a-f]{4}$/);
    // Reports of the old name don't carry over to a new one.
    await admin();
    await db.query("update public.players set name_changed_at = now() - interval '2 hours', name = 'Fresh Name' where user_id = $1", [target]);
    await db.query('update public.reports set week = week - 7 where target = $1', [target]);
    await report(a, pid, 'name');
    expect(await nameOf(target)).toBe('Fresh Name');
  });

  it("doesn't let throwaway accounts reset a name: only pilots with 5 runs or 3 days count", async () => {
    const target = await newUser();
    await as(target);
    await db.query("select public.set_pilot_name('Fair Name')");
    const pid = await pidOf(target);
    // Five brand new accounts: kept, but not counted.
    for (let i = 0; i < 5; i++) expect(await report(await newUser(), pid, 'name')).toBe('reported');
    expect(await nameOf(target)).toBe('Fair Name');
    await admin();
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.reports where target = $1 and reason = 'name'", [target])).rows[0].n).toBe(5);
    // Two days old, or four runs: still not.
    await report(await pilotFor(2), pid, 'name');
    const fewRuns = await newUser();
    await runsFor(fewRuns, 4);
    await report(fewRuns, pid, 'name');
    expect(await nameOf(target)).toBe('Fair Name');
    // Five runs counts; so does three days.
    const played = await newUser();
    await runsFor(played, 5);
    await report(played, pid, 'name');
    await report(await pilotFor(3), pid, 'name');
    expect(await nameOf(target)).toBe('Fair Name'); // two that count so far
    await report(await trusted(), pid, 'name');
    expect(await nameOf(target)).toMatch(/^pilot-[0-9a-f]{4}$/);
  });

  it('never hides a score on its own', async () => {
    const target = await newUser();
    await as(target);
    await submit({ board: 'solo:canyon', score: 4000 });
    const pid = await pidOf(target);
    for (let i = 0; i < 4; i++) await report(await newUser(), pid, 'score');
    await admin();
    expect((await db.query<{ hidden: boolean }>('select hidden from public.players where user_id = $1', [target])).rows[0].hidden).toBe(false);
    expect((await db.query('select 1 from public.bests where user_id = $1', [target])).rows).toHaveLength(1);
  });
});

describe('error reports', () => {
  const log = async (errors: unknown) =>
    (await db.query<{ log_errors: number }>('select public.log_errors($1::jsonb)', [JSON.stringify(errors)])).rows[0].log_errors;
  const one = (over: Record<string, unknown> = {}) => ({
    message: 'TypeError: x',
    stack: 'at f index.js:1:2',
    version: '1.0.7',
    platform: 'android',
    device: 'Pixel 7 · android 14',
    screen: 'over',
    at: Date.now(),
    ...over,
  });

  it('are kept, trimmed, and dated within the last week', async () => {
    const a = await newUser();
    await as(a);
    expect(await log([one(), one({ message: 'm'.repeat(900), at: Date.now() + 86_400_000 }), one({ message: '' }), 'nonsense'])).toBe(2);
    await admin();
    const rows = await db.query<{ message: string; device: string; at: Date; user_id: string }>(
      'select message, device, at, user_id from public.client_errors where user_id = $1 order by id',
      [a],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({ message: 'TypeError: x', device: 'Pixel 7 · android 14' });
    expect(rows.rows[1].message).toHaveLength(300);
    expect(rows.rows[1].at.getTime()).toBeLessThanOrEqual(Date.now() + 1000); // never in the future
  });

  it('take at most 20 a call and 50 a day per player', async () => {
    const a = await newUser();
    await as(a);
    const many = Array.from({ length: 30 }, (_, i) => one({ message: `e${i}` }));
    expect(await log(many)).toBe(20);
    expect(await log(many)).toBe(20);
    expect(await log(many)).toBe(10);
    expect(await log(many)).toBe(0);
  });

  it("clear themselves after 60 days: the sender's own, and a few of anyone's on each call", async () => {
    const [a, b, c] = [await newUser(), await newUser(), await newUser()];
    for (const u of [a, b]) {
      await as(u);
      await log([one({ message: 'old' }), one({ message: 'recent' })]);
    }
    await admin();
    await db.query("update public.client_errors set received_at = now() - interval '61 days' where message = 'old'");
    await db.query("update public.client_errors set received_at = now() - interval '59 days' where message = 'recent'");
    const left = async (u: string) => {
      await admin();
      return (await db.query<{ message: string }>('select message from public.client_errors where user_id = $1 order by id', [u])).rows.map((r) => r.message);
    };
    // b has stopped playing; c's call clears b's old one too.
    await as(c);
    await log([one({ message: 'new' })]);
    expect(await left(b)).toEqual(['recent']);
    expect(await left(c)).toEqual(['new']);
    await as(a);
    await log([one({ message: 'another' })]);
    expect(await left(a)).toEqual(['recent', 'another']);
  });

  it('prune a bounded number at a time, oldest first', async () => {
    const a = await newUser();
    await as(a);
    await log(Array.from({ length: 12 }, (_, i) => one({ message: `p${i}` })));
    await admin();
    await db.query(
      "update public.client_errors set received_at = now() - interval '90 days' - (substr(message, 2)::int * interval '1 hour') where user_id = $1 and message ~ '^p[0-9]+$'",
      [a],
    );
    expect((await db.query<{ n: number }>('select public.prune_client_errors(5) as n')).rows[0].n).toBe(5);
    const rest = (await db.query<{ message: string }>('select message from public.client_errors where user_id = $1 order by received_at', [a])).rows.map(
      (r) => r.message,
    );
    expect(rest).toEqual(['p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0']); // the oldest five went
    await as(a);
    await rejects(db.query('select public.prune_client_errors(5)'), /permission denied/);
  });

  it("can't be read back, written straight, or sent signed out", async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query('select * from public.client_errors'), /permission denied/);
    await rejects(db.query("insert into public.client_errors (message, at) values ('x', now())"), /permission denied/);
    await as(null);
    await rejects(log([one()]), /permission denied/);
  });
});

describe('max out', () => {
  it('is taken once after it is set from the SQL editor, and only by its player', async () => {
    const [a, b] = [await newUser(), await newUser()];
    const take = async () => (await db.query<{ take_max_out: boolean }>('select public.take_max_out()')).rows[0].take_max_out;
    await as(a);
    expect(await take()).toBe(false);
    await admin();
    await db.query('update public.players set max_out = true where user_id = $1', [a]);
    await as(b);
    expect(await take()).toBe(false);
    await as(a);
    expect(await take()).toBe(true);
    expect(await take()).toBe(false);
  });
});

describe('ships on the boards', () => {
  it('shows the ship a pilot set next to their score, and checks its shape', async () => {
    const a = await newUser();
    await as(a);
    const ship = { hull: 'needle', paint: 's3-p1', markings: 'none', fins: 'twin', decal: 'rank', engine: 'cold', trail: 'standard', rank: 4 };
    await db.query('select public.set_ship($1::jsonb)', [JSON.stringify(ship)]);
    await submit({ board: 'solo:asteroids', score: 1300 });
    expect((await board('solo:asteroids')).find((r) => r.you)?.ship).toEqual(ship);
    await rejects(db.query('select public.set_ship($1::jsonb)', ['{"hull":"<b>"}']), /not a look/);
    await rejects(db.query('select public.set_ship($1::jsonb)', ['{"wallet":"x"}']), /not a slot/);
    await rejects(db.query('select public.set_ship($1::jsonb)', ['{"rank":1000}']), /not a number/);
    await rejects(db.query('select public.set_ship($1::jsonb)', ['[1]']), /not a ship/);
    await as(null);
    await rejects(db.query('select public.set_ship($1::jsonb)', ['{}']), /permission denied|not signed in/);
  });
});

describe('pilot name filter', () => {
  it('gives the same answers as the game', async () => {
    await admin();
    for (const n of [...REFUSED, ...ALLOWED]) {
      const r = await db.query<{ name_blocked: boolean }>('select public.name_blocked($1)', [n]);
      expect(r.rows[0].name_blocked, n).toBe(REFUSED.includes(n));
    }
  });

  it('stops a blocked name being picked', async () => {
    const a = await newUser();
    await as(a);
    await rejects(db.query("select public.set_pilot_name('Sh1tLord')"), /isn't allowed/);
  });
});

describe('ghost rivals (rival_path)', () => {
  // League 6 (grand champion) on this week's board: no other test flies there.
  const L = 6;
  type Rival = { name: string; score: number; seconds: number; distance: number; path: number[] };
  const rival = async (): Promise<Rival[]> => (await db.query<Rival>('select * from public.rival_path()')).rows;
  const ranked = async (score: number) => {
    await age();
    return submit({ board: 'ranked', league: L, score, distance: 4000, seconds: 60 });
  };
  const pilot = async (name: string): Promise<string> => {
    const u = await newUser();
    await admin();
    await db.query('update public.players set name = $2 where user_id = $1', [u, name]);
    return u;
  };
  let low: string, mid: string, top: string;

  beforeAll(async () => {
    low = await pilot('rival low');
    mid = await pilot('rival mid');
    top = await pilot('rival top');
    await as(low);
    await ranked(4000);
    await as(mid);
    await ranked(5000);
    await ranked(5600); // their best: this run's path is the one sent
    await as(top);
    await ranked(7000);
  });

  it("gives the run of the pilot just above you on your league's board, with only their pilot name", async () => {
    await as(low);
    const r = await rival();
    expect(r).toHaveLength(1);
    expect(r[0].name).toBe('rival mid');
    expect(r[0].score).toBe(5600);
    expect(r[0].path.length).toBe(Math.ceil(4000 / 4));
    expect(Object.keys(r[0]).sort()).toEqual(['distance', 'name', 'path', 'score', 'seconds']); // no ids
    await as(mid);
    expect((await rival())[0].name).toBe('rival top');
  });

  it('gives the top pilot nothing, and a pilot with no run this week the bottom of the board', async () => {
    await as(top);
    expect(await rival()).toEqual([]);
    const fresh = await newUser();
    await admin();
    await db.query('update public.players set league = $2 where user_id = $1', [fresh, L]);
    await as(fresh);
    expect((await rival())[0].name).toBe('rival low');
  });

  it('never picks a hidden pilot, or one in another league', async () => {
    await admin();
    await db.query('update public.players set hidden = true where user_id = $1', [mid]);
    await as(low);
    expect((await rival())[0].name).toBe('rival top');
    await admin();
    await db.query('update public.players set hidden = false where user_id = $1', [mid]);
    const other = await newUser();
    await as(other);
    await submit({ board: 'ranked', league: 5, score: 4100, distance: 3000, seconds: 50 });
    expect((await rival()).map((r) => r.name)).not.toContain('rival mid');
  });

  it("can't be called signed out", async () => {
    await as(null);
    await rejects(rival(), /permission denied|sign in/);
  });
});

describe('the checks match the game', () => {
  const sql = migrations.map(([, text]) => text).join('\n');
  const constant = (name: string): number => {
    const m = new RegExp(`${name} constant \\w+ := ([0-9.]+)`).exec(sql);
    if (!m) throw new Error(`no ${name} in the migrations`);
    return Number(m[1]);
  };

  it("submit_run's numbers", () => {
    expect(constant('c_points_per_unit')).toBe(CONFIG.score.pointsPerUnit);
    expect(constant('c_top_speed')).toBeGreaterThan(CONFIG.speed.max * CONFIG.boost.speedMultiplier);
    expect(constant('c_path_step')).toBe(4);
  });

  it('leave room for double points (1.0.9): a run boosting all the way, doubled for its share of power-ups, stays under the score limit', () => {
    const P = CONFIG.powers;
    const w = P.weights;
    const share = w.double / (w.shield + w.magnet + w.slow + w.phase + w.double);
    // The most often power-ups come (the scanner at tier 5: 40% more often), and the furthest 8 s can fly.
    const unitsPerDouble = P.spacing[0] / 1.4 / share;
    const doubled = Math.min(1, (P.double.seconds * CONFIG.speed.max * CONFIG.boost.speedMultiplier) / unitsPerDouble);
    const perUnit = CONFIG.score.pointsPerUnit * (1 + CONFIG.score.boostBonus) * (1 + doubled * (P.double.factor - 1));
    expect(perUnit).toBeLessThan(constant('c_points_per_unit') * (1 + constant('c_bonus_share')));
  });
});
