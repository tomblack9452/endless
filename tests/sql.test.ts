import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import SETUP from '../supabase/setup.sql?raw';
import { CONFIG } from '../src/config';
import { applyMigrations } from '../scripts/apply-db-lib.mjs';
import { parts as splitParts, statements } from '../scripts/sql-split.mjs';

// The database, run for real: PGlite is Postgres in WASM, with a stand-in for
// the bits of Supabase the schema leans on (the auth schema and its roles).
// This is how the leaderboard is tested without a Supabase project.

const files = import.meta.glob<string>('../supabase/migrations/*.sql', { query: '?raw', import: 'default', eager: true });
const partFiles = import.meta.glob<string>('../supabase/parts/*.sql', { query: '?raw', import: 'default', eager: true });
/** The small parts, in order. */
const PARTS: string[] = Object.entries(partFiles).sort((a, b) => a[0].localeCompare(b[0])).map(([, sql]) => sql);

/** Every migration in order: [file name, sql]. */
const migrations: [string, string][] = Object.entries(files)
  .map(([path, sql]): [string, string] => [path.split('/').pop() as string, sql])
  .sort((a, b) => a[0].localeCompare(b[0]));

const SUPABASE_STANDIN = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
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
  const path = r.path ?? (board === 'ranked' ? Array.from({ length: Math.ceil(distance / 4) }, (_, i) => Math.sin(i / 9)) : []);
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
    expect(t.rows.map((r) => r.table_name)).toEqual(['bests', 'core_log', 'players', 'runs', 'saves', 'store_events', 'wallets']);
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
  });

  it('are the migrations, split between statements (run `npm run db:setup` if this fails)', () => {
    const body = PARTS.map((p) => p.split('\n').slice(2).join('\n').trim());
    const expected = splitParts(migrations.map(([, sql]) => sql.trim()).join('\n\n'), 3500);
    expect(body).toEqual(expected);
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
    expect(t.rows.map((r) => r.n)).toEqual(['bests', 'core_log', 'endless_migrations', 'players', 'runs', 'saves', 'store_events', 'wallets']);
    // Every table has row-level security on (Supabase's advisor flags any that don't).
    const open = await d.query<{ n: string }>("select relname n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
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
    expect((await d.query<{ name: string }>('select name from public.endless_migrations order by 1')).rows.map((r) => r.name)).toEqual([migrations[0][0], migrations[1][0]]);
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
    for (const [u, score] of [[a, 1000], [b, 1700], [c, 1300]] as const) {
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
});
