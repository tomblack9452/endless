# Server and store

What the server (Supabase), the store (RevenueCat) and ads (AdMob) do for the
game, and everything the game needs from the Supabase dashboard. The
step-by-step setup guides are [leaderboards.md](leaderboards.md) (the server)
and [store.md](store.md) (purchases, ads and the app builds).

## Contents

- [Overview](#overview)
- [Supabase settings](#supabase-settings)

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
  and **leaderboards**: this week's ranked run per league, endless, and one
  for each solo environment, with pilot names and each pilot's ship drawn next
  to their name from the looks they have on. Tap a pilot to see their ship
  bigger, what's on it, and their **service record**: rank, XP, runs, time,
  distance, furthest level, best chain, near misses, pickups and their best on
  each board (shared through a public id, never the account id). Runs are checked in the database (the score has to fit the distance
  and time, and the path the distance), kept and retried if there's no signal.
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
| Authentication > URL Configuration | Site URL: `https://tomblack9452.github.io/endless/` | Not used by anonymous sign-in, but keeps the defaults pointing at the game |
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
to see it's all there. There are 14 so far; recent ones: `0010` (cores only
from real rewards), `0011` (purchases and refunds in one call), `0012` (the
trusted clock), `0013` (service records on the boards), `0014` (a purchase
keeps RevenueCat's purchase time, and cores rewards are paid one at a time).
`0014` has to be applied before the webhook is deployed again.

**Bad names.** Names are checked against a profanity list
([zautumnz/profane-words](https://github.com/zautumnz/profane-words), WTFPL)
in the game and again in the database (`src/platform/nameFilter.ts`,
`name_blocked()`). To find names picked before the filter, in the SQL editor:
`select name from players where name_blocked(name);`. To allow a word the
list catches wrongly, add it to `ALLOW` in `scripts/name-filter/build.mjs`, run
`npm run names:build`, and put the change in a new migration (delete the word
from `name_words`).

Still to do on the server: a full re-fly of submitted runs with the game's
own code (it needs the run simulation pulled out of `game.ts` first), and
Apple sign-in for an iOS build (Google sign-in is done, in the Android app).
