// Applies the database migrations to a Postgres connection, once each. The logic is
// here (not in apply-db.mjs) so tests/sql.test.ts can run it on a throwaway database.
//
// A table records which migrations have run, so running it again does nothing, and a
// new migration later is applied on its own. A database set up by pasting the SQL by
// hand (no record yet) is recognised by a table each migration creates.

/** A table, index or function each migration creates: how a hand-pasted database is recognised. */
const MADE = { '0001_init.sql': 'players', '0002_store.sql': 'store_events', '0003_leaderboards.sql': 'bests', '0004_premium.sql': 'store_events_by_user', '0005_delete_account.sql': 'delete_my_account()', '0006_ship_looks.sql': 'set_ship(jsonb)', '0007_wallet_credits.sql': 'sync_credits(bigint,bigint)', '0008_max_out.sql': 'take_max_out()', '0009_name_filter.sql': 'name_words', '0010_secure_cores.sql': 'core_log_reason', '0011_store_purchases.sql': 'store_refund(text,uuid,text,text,integer)', '0012_trusted_clock.sql': 'server_now()', '0013_pilot_records.sql': 'pilot_record(uuid)', '0014_purchase_time_and_earn_lock.sql': 'store_purchase_at(text,uuid,text,text,text,integer,timestamp with time zone)' };

/**
 * `db.query(sql, params?)` resolving `{ rows }`. `migrations`: [[file name, sql], ...] in order.
 * Resolves with what it did: { applied: [...], recorded: [...] }.
 */
export async function applyMigrations(db, migrations, log = () => {}) {
  await db.query('create table if not exists public.endless_migrations (name text primary key, at timestamptz not null default now())');
  // Only this script reads it: no row-level access for the game's keys at all.
  await db.query('alter table public.endless_migrations enable row level security');
  await db.query('revoke all on public.endless_migrations from anon, authenticated');
  const done = new Set((await db.query('select name from public.endless_migrations')).rows.map((r) => r.name));
  const applied = [];
  const recorded = [];
  for (const [name, sql] of migrations) {
    if (done.has(name)) continue;
    const probe = MADE[name];
    if (probe) {
      const there = (await db.query(`select ${probe.endsWith(')') ? 'to_regprocedure' : 'to_regclass'}($1) is not null as there`, [`public.${probe}`])).rows[0].there;
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
