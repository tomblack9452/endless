// Applies the database migrations to a Postgres connection, once each. The logic is
// here (not in apply-db.mjs) so tests/sql.test.ts can run it on a throwaway database.
//
// A table records which migrations have run, so running it again does nothing, and a
// new migration later is applied on its own. A database set up by pasting the SQL by
// hand (no record yet) is recognised by a table each migration creates.

/** A table (or index) each migration creates: how a hand-pasted database is recognised. */
const MADE = { '0001_init.sql': 'players', '0002_store.sql': 'store_events', '0003_leaderboards.sql': 'bests', '0004_premium.sql': 'store_events_by_user' };

/**
 * `db.query(sql, params?)` resolving `{ rows }`. `migrations`: [[file name, sql], ...] in order.
 * Resolves with what it did: { applied: [...], recorded: [...] }.
 */
export async function applyMigrations(db, migrations, log = () => {}) {
  await db.query('create table if not exists public.endless_migrations (name text primary key, at timestamptz not null default now())');
  const done = new Set((await db.query('select name from public.endless_migrations')).rows.map((r) => r.name));
  const applied = [];
  const recorded = [];
  for (const [name, sql] of migrations) {
    if (done.has(name)) continue;
    const probe = MADE[name];
    if (probe) {
      const there = (await db.query('select to_regclass($1) is not null as there', [`public.${probe}`])).rows[0].there;
      if (there) {
        // Already in the database (pasted by hand): note it, don't run it again.
        await db.query('insert into public.endless_migrations (name) values ($1)', [name]);
        recorded.push(name);
        log(`${name}: already there`);
        continue;
      }
    }
    log(`${name}: applying`);
    await db.query('begin');
    try {
      await db.query(sql);
      await db.query('insert into public.endless_migrations (name) values ($1)', [name]);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      throw new Error(`${name} failed, nothing from it was kept: ${e.message}`);
    }
    applied.push(name);
  }
  return { applied, recorded };
}
