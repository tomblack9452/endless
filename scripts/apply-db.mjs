// `npm run db:apply`: sets up (or updates) the Supabase database from your terminal, with no
// pasting. Needs SUPABASE_DB_URL in .env (or the environment): the "Session pooler" connection
// string from the Supabase dashboard (Connect > Connection string), with your database password
// filled in. Safe to run again: each migration runs once.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyMigrations } from './apply-db-lib.mjs';

const env = { ...process.env };
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const url = env.SUPABASE_DB_URL;
if (!url) {
  console.log(`SUPABASE_DB_URL is not set.

In the Supabase dashboard click Connect, choose "Session pooler" (it works on every network),
copy the connection string, put your database password where it says [YOUR-PASSWORD], and add
it to .env as:

  SUPABASE_DB_URL=postgresql://postgres.xxxx:yourpassword@aws-0-region.pooler.supabase.com:5432/postgres

(The password is the one you chose when creating the project; Project settings > Database can reset it.
This is a secret: .env is never committed, and it is never part of the game's build.)`);
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => [f, readFileSync(join(dir, f), 'utf8')]);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.log(`Couldn't connect: ${e.message}\n\nCheck the password in the connection string, and that you copied the "Session pooler" one.`);
  process.exit(1);
}
try {
  const { applied, recorded } = await applyMigrations(client, migrations, (l) => console.log(`  ${l}`));
  console.log(applied.length + recorded.length === 0 ? '\nThe database is already up to date.' : `\nDone: ${applied.length} applied, ${recorded.length} found already in place.`);
  console.log('Next: turn on anonymous sign-ins (Authentication > Sign In / Providers), then `npm run check-server`.');
} catch (e) {
  console.log(`\n${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
