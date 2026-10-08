# Leaderboards

Global leaderboards run on Supabase. Without keys the game works as before and
the leaderboard screen shows your own bests. With them, every finished run goes
to a board.

## Turning them on

1. **Create a project** at supabase.com (the free plan is plenty).
2. **Set up the database.** Either way gives the same result:
   - **From your terminal (no pasting):** in the dashboard click **Connect**, pick
     **Session pooler**, copy the connection string and put your database password
     in it. Add it to `.env` as `SUPABASE_DB_URL=...`, then run `npm run db:apply`.
     It applies each migration once, so running it again (or after a later update)
     is safe. This is a secret; it's not a `VITE_` variable, so it never goes into
     the game's build.
   - **Or paste it:** SQL editor > New query > paste the files in `supabase/parts/`
     one at a time, in order (`01-of-...sql` first), running each. They are small
     on purpose: pasting one big file can get cut off part way (about 4 KB), which
     shows up as `unterminated dollar-quoted string`. If you'd rather paste one
     file, `supabase/setup.sql` is all of it.
3. **Allow anonymous sign-ins.** Authentication > Sign In / Providers > turn on
   *Allow anonymous sign-ins*. (Players get an account without a sign-up screen.)
4. **Add the keys.** Project Settings > API Keys: copy the project URL and the
   **publishable** key (`sb_publishable_...`, or the legacy `anon` key).
   - Locally: copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
     `VITE_SUPABASE_ANON_KEY`.
   - The live site: GitHub repo > Settings > Secrets and variables > Actions >
     add the same two as repository secrets. `deploy.yml` already passes them to
     the build.
5. **Check it.** `npm run check-server` signs in once and tells you what, if
   anything, is missing and how to fix it.

Never put the secret or `service_role` key in `.env`: the game only ever needs
the publishable (`anon`) key.

## What's on the boards

| Board | Who | Resets |
|---|---|---|
| This week | Ranked runs, one board per league | Every Monday, 00:00 UTC |
| Endless | Endless runs | Never |
| One per solo environment | Solo runs in open ground, canyon, ship, ice, asteroids, volcanic | Never |

Each row shows the pilot's ship, drawn by the game from the looks they have
on (`players.ship`, sent with `set_ship` a couple of seconds after the player changes a look, signs in or finishes a run; only its shape is
checked, so an edited client could show a look it doesn't own). Tap a row for a
bigger picture, the names of the looks, and the pilot's **service record**.

## Service records (0013)

Each player sends a summary of their own service record with `set_record` when
they open a board and it has changed: rank, XP, runs, ranked runs, time played,
distance, furthest level, best chain, near misses and pickups (numbers only,
the shape checked, like the ship). `leaderboard()` gives every row the pilot's
**public id** (`players.public_id`), never the account id, and
`pilot_record(public id)` reads their card: name, premium, ship, that summary,
when they joined, and their best on each board (ranked: their best week).
Hidden pilots have no card. The stats live on the device, so like the ship an
edited client could show stats it hasn't earned. This needs `0013` on the live
database (`npm run db:apply`); without it, rows have no public id and tapping
a pilot shows only their ship.

Set levels have no board (they're the same every time, so they have times and
stars instead). Assisted runs, and anything flown with the dev tools, are never
sent. Everyone has a pilot name (a new account gets `pilot-3fa2`, and once ranked and the leaderboards open (after 5 runs of 1,000+) the game asks for a real one: the name screen comes up on the title and stays until a name is saved; 3-16
letters/numbers/spaces/`-`/`_`, unique, once an hour) and a row on a board is
their best score. The screen shows the top 50 and, if you're lower, your own row
and rank under a gap.

## How a run gets there

1. The run ends and `submitToBoard` (in `src/game.ts`) writes it into the
   **outbox** (`src/server/outbox.ts`), which is kept on the device.
2. The outbox calls the `submit_run` database function. If there's no signal, or
   the server's busy, the run stays and is retried on the next flush: when the
   game connects, when the browser comes back online, and when you open a board.
   A run the server turns down for good is dropped.
3. `submit_run` checks the run, stores it, updates the player's best if it's one,
   and answers with the rank. The game says `new best: #12 on the weekly board`.
4. `leaderboard` reads a board: the top N plus your own row.

## What the server checks

Every submission, in `supabase/migrations/0003_leaderboards.sql`:

- the board exists, the league is 0-6, the week is the server's own week (the
  game reads the week's board by the server's clock too, `server_now` in 0012)
- the score can come from the distance (distance points plus the most the
  bonuses could add) and the time (no faster than a full-boost flight)
- ranked runs carry the ship's path: one sample per 4 units of distance, never
  jumping sideways faster than the ship can
- at most one run every 8 seconds and 400 a day per player
- players can't write any table directly (row security with no write policies:
  only the functions write), and can't read others' accounts

The numbers it keeps are the game's: `tests/sql.test.ts` fails if they drift
from `CONFIG`.

**This keeps out impossible runs, not careful cheating.** Someone who sends a
believable fake can still reach a board, because the server doesn't yet replay
the run. If that starts to matter, the next steps in order of effort:

1. **Hide and ban.** `update players set hidden = true where name = '...'` takes
   a player off every board immediately (rows stay, so it's reversible).
2. **Tighten the checks.** Smaller `c_bonus_share`, per-level score ceilings.
3. **Re-fly ranked runs.** The weekly run is deterministic from its seed (a test
   enforces this), so the server could replay a ranked run from its inputs. It
   needs the run simulation pulled out of `game.ts` first, then a worker running
   it on submission. Endless and solo use random seeds, so they would need the
   seed sent with the run.

## Changing the database

Add a new file in `supabase/migrations/` (the next number: `0015_...sql`; never
edit one that has been applied), add a table or function it creates to `MADE` in
`scripts/apply-db-lib.mjs` (how a hand-pasted database is recognised), run
`npm run db:setup` to rebuild `supabase/setup.sql` and `supabase/parts/`, then
`npm run db:apply` on a live project (it applies only what's new). `npm test` runs every migration on a real Postgres (PGlite), the
client against it, and checks `setup.sql` is up to date.

## Running costs and limits

A board read is one small query on an indexed table (`bests_top`), so reads stay
cheap as the player count grows. Anonymous accounts are real users to Supabase:
the free plan's monthly active user limit applies, and abandoned anonymous users
can be cleared from the dashboard.
