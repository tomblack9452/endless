# Server and store

What the server (Supabase), the store (RevenueCat) and ads (AdMob) do for the
game, and everything the game needs from the Supabase dashboard. The
step-by-step setup guides are [leaderboards.md](leaderboards.md) (the server)
and [store.md](store.md) (purchases, ads and the app builds).

## Contents

- [Overview](#overview)
- [Supabase settings](#supabase-settings)
- [The daily challenge](#the-daily-challenge)
- [Ghost rivals](#ghost-rivals)
- [Reports and moderation](#reports-and-moderation)
- [Error reports](#error-reports)
- [When the server can't be reached](#when-the-server-cant-be-reached)

## Overview

Without keys, everything lives on the device. With them:

- **Supabase** (`src/server/`, `supabase/`): an anonymous account per
  player (in the Android app it can be kept with a Google login and signed
  back into on a new phone: [store.md](store.md), "Google sign-in"), a cloud save of every saved
  setting and stat (the newer save wins; a fresh install takes the cloud's;
  nothing is pushed until the two have been compared), cores held on the
  server (each reward named and paid once, at most its size, and only for
  the current day, week or season; spending checked), the server's clock for
  days, weeks and seasons (`server_now`, so moving the phone's clock doesn't
  turn the day),
  credits mirrored there (so balances can be changed from the dashboard),
  and **leaderboards**: this week's ranked run per league, **today's daily
  challenge** (everyone on one board, since 1.0.8, `0019`), endless, and one
  for each solo environment, with pilot names and each pilot's ship drawn next
  to their name from the looks they have on. Tap a pilot to see their ship
  bigger, what's on it, and their **service record**: rank, XP, runs, time,
  distance, furthest level, best chain, near misses, pickups and their best on
  each board (shared through a public id, never the account id). Runs are checked in the database (the score has to fit the distance
  and time, and the path the distance), kept and retried if there's no signal.
  The server keeps each player's **league** (`players.league`, `0015`), so a
  ranked run counts in the league the server holds, not the one the game
  sends. Players can **report** a pilot from their card (`reports`,
  `report_pilot`, `0017`; only pilots with 5 runs or 3 days behind them count
  towards resetting a name, `0020`), and the game sends **error reports**
  (`client_errors`, `log_errors`, `0018`; cleared after 60 days, `0021`);
  both are read only in the dashboard (below). In ranked, the game can ask
  for the run of the pilot just above you to race as a ghost (`rival_path`,
  `0022`, since 1.0.9).
  Setup is two keys and `npm run db:apply` (or `npm run db:setup` and pasting the small SQL parts it makes in `supabase/parts/`): [leaderboards.md](leaderboards.md).
- **RevenueCat** (`src/store/`) in the iOS and Android apps: core packs
  (100, 550, 1,200, 2,500), a one-time starter pack (500 cores and the nova
  hull), the season pass, and **premium** (a one-off: no ads, ad rewards
  without the ad, the halo hull, regalia paint and crown flame, an extra free
  revive a day, a badge on the boards). What's owned for good is in
  `src/store/entitlements.ts`.
- **AdMob** (`src/ads/`) in the apps: rewarded ads only, with consent and
  Apple's tracking prompt; premium players never see one. No ads on the web. Purchases are paid into the server
  wallet by a webhook. The web build sells nothing.

What has to be set up by hand (projects, products, keys and the app builds)
is in [leaderboards.md](leaderboards.md) for the server and
[store.md](store.md) for purchases, with the store listing text and
the screenshot list. Keys go in `.env` (copy `.env.example`), which is never
committed; `npm run check-server` says what's missing.

## Supabase settings

Everything the game needs from the Supabase dashboard, in one place. The
step-by-step first setup is in [leaderboards.md](leaderboards.md).

| Where in the dashboard | Setting | Why |
| --- | --- | --- |
| New project | Free plan; the region nearest most players | Free is plenty to launch. A free project pauses after a week with no use, so open the game (or the dashboard) now and then before launch |
| Authentication > Sign In / Providers | **Allow anonymous sign-ins: on** | Every player gets an account with no sign-up screen. Without it nothing reaches the server |
| Authentication > Sign In / Providers | Email: leave as it is | Not used by the game |
| Authentication > Sign In / Providers | **Allow manual linking: on** | Lets a player keep their anonymous account with Google. Without it "keep it with google" fails |
| Authentication > Sign In / Providers > Google | Enabled, with the **web** OAuth client id and secret; skip nonce checks off | Google sign-in in the Android app ([store.md](store.md), "Google sign-in") |
| Authentication > Attack Protection | CAPTCHA: **off** | The game signs in silently and can't show a CAPTCHA |
| Authentication > Rate Limits | Anonymous sign-ins: 30 an hour per IP (the default) is fine | Raise it if many players share one network (a school, an event) |
| Authentication > URL Configuration | Site URL: `https://apps.tomblack.online/endless/` | Not used by anonymous sign-in, but keeps the defaults pointing at the game |
| Project Settings > Data API | Exposed schemas: `public` (the default) | The game calls the database functions through it |
| Project Settings > API Keys | The project URL and the **publishable** key (`sb_publishable_...`, or the legacy `anon` key) | Go in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. **Never** the secret or `service_role` key: anything `VITE_` is in the public build |
| Connect > Session pooler | The connection string, with your database password | Goes in `SUPABASE_DB_URL` in `.env` for `npm run db:apply`. A secret: never a `VITE_` variable, never in GitHub |
| Edge Functions > Secrets | `REVENUECAT_WEBHOOK_SECRET` (a long random string) | Only for store purchases. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are there already. Deploy with `supabase functions deploy revenuecat-webhook --no-verify-jwt` ([store.md](store.md)) |
| Authentication > Users | Nothing to set | Anonymous players show here. Deleting one deletes their save, cores, runs and scores |
| Table Editor > wallets | `cores` and `credits`: edit to change a player's balance | They get it the next time the game opens or comes back to the front. Credits merge: what you add or take away is added to or taken from whatever they have on their device (see below) |

Where the keys go:

- **On your computer:** `.env` (copy `.env.example`): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` and `SUPABASE_DB_URL`.
- **The live site:** GitHub repo > Settings > Secrets and variables > Actions:
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as repository secrets
  (`deploy.yml` passes them to the build). Not `SUPABASE_DB_URL`.

**Changing a player's balance.** Find them by pilot name in the `players`
table (its `user_id` is the same in `wallets`), then edit `cores` or
`credits` in `wallets`. Or in the SQL editor:

```sql
update public.wallets set credits = credits + 5000, cores = cores + 100
where user_id = (select user_id from public.players where name = 'Ace Pilot');
```

Cores are held on the server, so the number you set is their balance.
Credits are earned on the device and merged with the server's copy, so a
change you make is applied on top of anything they've earned since (add
5,000 and they get 5,000 more, even if they played offline meanwhile). A
`credits` cell that's empty means that player hasn't synced since this was
added; it fills in when they next open the game.

**Maxing out a player** (for testing): the top rank and league, every look
of every kind (shop, vault, pass, premium, rank, league, stars and
achievement looks), every upgrade at its top tier, every solo environment and
set level and every part of the game open, and 100,000 credits. In the SQL
editor:

```sql
update public.players set max_out = true where name = 'Ace Pilot';
```

It happens the next time they open the game or come back to it, once (the
flag clears itself; set it again to repeat). Their scores on the boards
afterwards are flown with a maxed ship.

After every update that adds a file to `supabase/migrations/`, run
`npm run db:apply` (it only applies what's new), then `npm run check-server`
to see it's all there. There are 23 so far; recent ones: `0010` (cores only
from real rewards), `0011` (purchases and refunds in one call), `0012` (the
trusted clock), `0013` (service records on the boards), `0014` (a purchase
keeps RevenueCat's purchase time, and cores rewards are paid one at a time),
`0015` (leagues on the server: `players.league`, `ranked_league()`, and
`submit_run` checking a ranked run's league), `0016` (a refunded season pass
takes back the cores its premium tiers paid: `pass_season()`,
`pass_refunded()`, `store_refund` and `earn_cores` again), `0017` (reporting a
pilot: the `reports` table, `report_pilot()`, `players.name_reset_at`),
`0018` (error reports: the `client_errors` table, `log_errors()`), `0019`
(the daily challenge: the `daily` board in `check_run` and `submit_run`,
`daily_period()`, and `earn_cores` paying the streak's cores), `0020` (name
reports count only from trusted reporters: `trusted_reporter()`,
`report_pilot()` again), `0021` (error reports clear themselves:
`prune_client_errors()`, `log_errors()` again), `0022` (ghost rivals:
`rival_path()`), `0023` (function hygiene, 1.0.11: only the trigger runs
`on_new_user()`, and the functions that aren't security definer get their own
`search_path`, which is what Supabase's linter asks for; nothing changes for
the game), `0024` (a cores spend is taken once, 1.0.12: `spend_cores_once()`
takes a spend with the id the game gives it, and answers one sent again
after a lost answer as taken without charging again; `spend_cores()` stays
as it was for older versions, and the game falls back to it on a database
without `0024`), `0025` (account counts, 1.0.13: `account_counts()`, totals
of accounts, anonymous and Google, new and active ones, for the service role
only; docs/analytics.md), `0026` (credit packs, 1.0.13: the webhook's
`store_credit_purchase()` records the purchase and adds the credits to the
server's balance in one call, so a resent event pays nothing; a pack bought
before the device's first credit sync waits in `wallets.credits_owed`;
`store_credit_refund()` takes them back, never below zero; `sync_credits()`
again, adding what's owed on the first sync).
Apply `0026` before deploying 1.0.13's webhook (it calls
`store_credit_purchase` for the credit packs). Apply `0014` and `0016` before deploying the webhook again; 1.0.7's webhook
(a constant-time secret check) wants a redeploy after `db:apply`:
`supabase functions deploy revenuecat-webhook --no-verify-jwt`. 1.0.8 to
1.0.11 don't change the webhook.

**A refunded season pass.** The webhook's refund (`store_refund`) renames the
purchase `refunded:season_pass`. Since `0016`, for a pass bought with money it
also takes back the cores that season's premium tiers paid (the
`pass:<season>:p<tier>` rows in `core_log`), as one `refund:pass:<season>` row,
never below zero, and `earn_cores` pays no more premium tiers that season
unless the pass is bought again. A pass unlocked with cores (spent as
`pass-premium:<season>`) is never touched. The game closes the premium track
when it next reads the purchase records.

**Leagues.** `players.league` is the league the server holds a player in
(null until their first ranked run since `0015`, then seeded from their latest
ranked run). To move a player by hand (e.g. after a mistake), in the SQL editor:

```sql
update public.players set league = 2 where name = 'Ace Pilot';
```

**Bad names.** Names are checked against a profanity list
([zautumnz/profane-words](https://github.com/zautumnz/profane-words), WTFPL)
in the game and again in the database (`src/platform/nameFilter.ts`,
`name_blocked()`). To find names picked before the filter, in the SQL editor:
`select name from players where name_blocked(name);`. To allow a word the
list catches wrongly, add it to `ALLOW` in `scripts/name-filter/build.mjs`, run
`npm run names:build`, and put the change in a new migration (delete the word
from `name_words`).

## The daily challenge

Since 1.0.8 (`0019`). One short course a day, the same for everyone: the
game builds it from the UTC date it gets from `server_now` (the trusted
clock), so a phone with its clock moved gets the same course as everyone
else. The server never builds courses; it only keeps the board and pays the
streak.

- **The board** is `daily`: `bests.period` is the server's UTC date
  (`daily_period(now())`), league 0, so everyone is on one board. A run is
  checked like a ranked run (the path every 4 units must match the distance
  and never jump) and can't be longer than the course
  (`c_daily_length`, a little over `CONFIG.daily.length`). It's filed under
  the day the server is on when it arrives; the game drops a daily run still
  waiting in its outbox once its day is over.
- **The streak** lives on the device (and in the cloud save): days in a row
  with a daily run. Each new day in the streak pays credits (on the device,
  like every run's credits) and, on some days, cores through `earn_cores`
  as `daily:<date>`: today's date (a day either side), once a day, 3 at
  most.

**Today's board:**

```sql
select p.name, b.score, b.seconds, b.achieved_at
from public.bests b join public.players p on p.user_id = b.user_id
where b.board = 'daily' and b.period = public.daily_period(now())
order by b.score desc limit 50;
```

**Who's on a streak** (cores paid in the last week):

```sql
select p.name, count(*) as days, sum(l.delta) as cores
from public.core_log l join public.players p on p.user_id = l.user_id
where l.reason like 'daily:%' and l.at > now() - interval '7 days'
group by p.name order by days desc;
```

Old daily bests stay in `bests` (one row per player per day played). To clear
out last year's:

```sql
delete from public.bests where board = 'daily' and period < (current_date - 365)::text;
```

## Ghost rivals

Since 1.0.9 (`0022`). In ranked, with **rival's ghost** on in settings (off by
default), the game flies the ghost of the pilot ranked just above you on your
league's board this week, as well as your own weekly best.

- `rival_path()` (security definer, signed in only) returns one row: that
  pilot's **public pilot name**, the score, seconds, distance and **path** of
  their best run this week (the ship's sideways position every 4 units, which
  every ranked run carries since `0003`). No account id or public id.
- The board is the caller's league (`players.league`, `0015`; from their
  latest ranked run before that, else bronze) on the server's week. "Just
  above" follows the board's own order (score, then who got there first).
  A caller with no run this week gets the pilot at the bottom of the board,
  the first to beat; the top pilot gets nothing. Hidden pilots are never a
  rival.
- The path has no times, so the game rebuilds them from how the course
  speeds up, scaled to the run's length (`rivalGhost` in
  `src/ship/ghost.ts`). Ranked courses are the same for everyone all week
  (and 1.0.9's risk lanes come from the seed too), so a path flown before
  1.0.9 still lines up.

Nothing new is stored: it reads `bests`, `runs` and `players`. It works from
the caller's `auth.uid()`, so it can't be run for someone else in the SQL
editor; read `bests` for their board instead.

## Reports and moderation

Players report a pilot from their card on the boards: `name` (offensive name),
`score` (impossible score) or `other`. Each report is a row in `reports`
(reporter, target, reason, the name they had then, the week, the time), one per
reporter per pilot a week and 20 a day per reporter. Players can't read the
table; there's no app screen for it. Three different pilots reporting a name
(since it was last set) reset it to a generated `pilot-xxxx`, which the game
asks them to change; scores are never taken down on their own. Since `0020`
only reporters with at least 5 runs on the server, or an account at least 3
days old (`trusted_reporter()`), count towards those three, so a handful of
fresh anonymous accounts can't reset anyone's name; their reports are still
kept and show in the query below. In the SQL editor:

**Recent reports, most reported first:**

```sql
select p.name, p.public_id, r.reason, count(distinct r.reporter) as reporters,
       max(r.at) as latest, array_agg(distinct r.name) as names_reported
from public.reports r join public.players p on p.user_id = r.target
where r.at > now() - interval '30 days'
group by p.name, p.public_id, r.reason
order by reporters desc, latest desc;
```

**Take a player off the boards** (and back with `false`):

```sql
update public.players set hidden = true where name = 'Rude Name';
```

**Clear a name** (back to a generated one, which the game asks them to change):

```sql
update public.players
set name = 'pilot-' || substr(md5(random()::text), 1, 4), name_reset_at = now()
where name = 'Rude Name';
```

**Remove a run or a best** (an impossible score). Their bests by board:

```sql
select b.board, b.period, b.league, b.score, b.achieved_at
from public.bests b join public.players p on p.user_id = b.user_id
where p.name = 'Ace Pilot' order by b.achieved_at desc;
```

Then delete the best (the board reads `bests`), and the run behind it if you
like (`runs` keeps every run):

```sql
delete from public.bests
where user_id = (select user_id from public.players where name = 'Ace Pilot')
  and board = 'endless' and period = 'all';

delete from public.runs
where user_id = (select user_id from public.players where name = 'Ace Pilot')
  and board = 'endless' and score = 123456;
```

## Error reports

The game sends uncaught errors and the key failures (Google sign-in,
purchases, ads, the cloud save) through `log_errors`, which only inserts into
`client_errors`: a short message and stack, the app version, platform, device
model, the screen, when it happened (the phone's clock, kept within the last
week) and when it arrived, with the account id. Emails, tokens and ids are taken
out on the phone first. At most 20 a session and 50 a day per player. Since
`0021` they clear themselves: each `log_errors` call deletes the caller's
reports older than 60 days and up to 50 of anyone's (`prune_client_errors()`),
so the table stays small with nobody clearing it. In the SQL editor:

**The last week, grouped by message and version:**

```sql
select message, version, count(*) as times, count(distinct user_id) as players,
       max(received_at) as latest, min(screen) as a_screen, min(device) as a_device
from public.client_errors
where received_at > now() - interval '7 days'
group by message, version
order by times desc
limit 50;
```

**One message in full** (the stacks):

```sql
select received_at, version, platform, device, screen, stack
from public.client_errors
where message like 'purchase%'
order by received_at desc limit 20;
```

**Clearing out old ones by hand** (the game does it as it goes; this catches
up all at once, say after a quiet spell):

```sql
delete from public.client_errors where received_at < now() - interval '60 days';
```

## When the server can't be reached

Since 1.0.8 the game notices when a request finds no way through (no signal,
or the server answering 5xx) and shows a quiet **offline** by the wallet on
the title screen. The boards say "you're offline" with your own best, names
wait for a connection, runs wait in the outbox, and everything on the device
carries on. While it's offline the game asks `server_now` every 20 seconds or
so (it needs no sign-in); when it answers, the game signs in if it hadn't,
sends the waiting runs and error reports and takes the server's balances.

Since 1.0.11:

- **Cores changes wait too** (`src/progression/wallet.ts`). A reward earned or
  cores spent that the server didn't hear about (no signal, a 5xx, a session
  being renewed) is kept in a list on the phone (`endless.coresPending`, never
  in the cloud save) and sent in order, one at a time, before the server's
  balance is taken again. Before, coming back online took the server's
  balance straight away: a spend made offline was refunded (the look kept) and
  a reward earned offline was lost, and so was a login reward claimed while
  start-up was still signing in. The server still has the last word: a reward
  it doesn't pay (a day too old, say) or a spend it refuses leaves its balance.
  A spend whose answer was lost after the server took it could be sent twice;
  that needs the signal to drop at exactly that moment.
- **The outbox and the rate limit:** `submit_run` takes one run every 8
  seconds from a player. A run turned away for that (a short run with quick
  retry, or a backlog after a spell offline) is sent again by itself 9 seconds
  later, and doesn't count as one of its 8 tries.
- **A ranked run that waited past Monday** (00:00 UTC) is let go, as a daily
  run is after midnight: it was flown on last week's course and the server
  would file it on this week's board.

Still to do on the server: a full re-fly of submitted runs with the game's
own code (it needs the run simulation pulled out of `game.ts` first), and
Apple sign-in for an iOS build (Google sign-in is done, in the Android app).
