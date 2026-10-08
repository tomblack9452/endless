# Endless Space: assessment

> **Historical.** A snapshot of `main` on 7 October 2026 (471 tests then).
> Line numbers and counts below are from that commit and have moved since. Item
> 7 (the Android project) was done after it; the code as it is now is described
> in the README, and the later audit's fixes are in
> [launch-audit.md](launch-audit.md#second-audit-8-october-2026).

Taken from `main` at `8eb93b8` (7 October 2026). Typecheck clean, 471 tests
passing. Every finding below was checked against the code; the server ones
were run against a real Postgres (PGlite) with the migrations applied, acting
as an ordinary signed-in player.

**Status (8 October 2026):** every critical and high item is fixed except the
Android project (item 7, left until the app is otherwise ready): items 1-2 in
`supabase/migrations/0010_secure_cores.sql`, 3 in `src/game.ts` buyProduct and
`src/store/store.ts`, 4-5 in `0011_store_purchases.sql` and the webhook, 6 as
"ad privacy choices" in settings, 8 in `docs/store.md` and the README. Run
`npm run db:apply` and redeploy the webhook to put the server side live.

## 1. Where it stands

The game itself is in good shape. Runs are deterministic and tested for
fairness, the six environments look distinct, the progression is deep (rank,
leagues, pass, goals, achievements, a large looks catalogue that renews each
season), and the screen flow has had a proper pass: onboarding, staged reveal,
the mandatory name screen, account deletion, Android back. The web build is
playable today.

It is not ready for Google Play yet, for three reasons. First, there is no
Android app in the repo: no Capacitor config, no `android/` project, no
Capacitor CLI or Android packages, so nothing can be built or uploaded.
Second, the server has a hole that lets any player give themselves unlimited
cores (the premium currency), and a softer one that lets anyone claim the daily
cores cap without playing. Third, the money paths have gaps that will cost real
players real purchases: a purchase made while the game couldn't sign in pays
nobody, a failed cores grant is never retried, refunds are never taken back,
and EU players have no way to change their ad consent, which Google requires.

None of this is large. The server fixes are a few lines of SQL; the store fixes
are a day; the Android project is an afternoon of setup plus Tom's console
work. After that the remaining items are quality, not blockers.

## 2. Scorecard

| Area | State | Why |
|---|---|---|
| Gameplay | good | Deterministic, fairness-tested, varied; the difficulty is hard to judge without phone playtests |
| Flow | good | Recent passes fixed the stuck states; a few rough edges remain (popups over the name screen, ads that fail silently) |
| Economy and progression | needs work | Sound design, but credits and the daily core cap can be inflated by anyone, and buying upgrades now helps the unbracketed boards |
| Purchases and ads | not ready | Lost purchases when sign-in failed, no retry on a failed grant, refunds ignored, no consent re-entry, real ad units in test builds |
| Store compliance | needs work | Listing claim no longer true, privacy policy misses the ship looks, the deletion web link needs to be explicit |
| Server and security | not ready | `grant_cores` callable by any player (confirmed); everything else is locked down properly |
| Performance and mobile | needs work | Low draw calls and a sensible renderer, but no Android project, no orientation lock, and an undisposed second WebGL context |
| UI and UX | needs work | Readable and consistent, but small type, a busy title screen and lowercase-only copy; the overhaul branch addresses the look |
| Code and tests | good | Strong test suite (SQL included), clear modules; `game.ts` at 3,200 lines is the main maintenance risk |

## 3. Fix before launch

### Server and security

**1. Any player can mint unlimited cores (critical).**
Where: `supabase/migrations/0001_init.sql:124-132`.
What happens: `grant_cores(player, amount, reason)` is a security-definer
function. Line 132 revokes it from `anon` and `authenticated`, but Postgres
gives every new function to `PUBLIC` by default and that grant is never
removed, so both roles still inherit it. Run as a signed-in player against the
migrations, `select grant_cores('<my id>', 99999, 'x')` succeeds and the wallet
reads 99,999 cores. Anyone with the public anon key and their own login can
give any account any amount.
Fix: a new migration with
`revoke execute on function public.grant_cores from public, anon, authenticated;`
and add the same check to `tests/sql.test.ts` (call it as a player, expect
"permission denied"). Audit the other definer functions the same way: `check_run`
and `name_blocked` already revoke from `public`; `earn_cores`, `spend_cores` and
the new-account trigger should be checked.

**2. The daily cores cap is free money (high).**
Where: `0001_init.sql:88-110` (`earn_cores`, cap 120 a day), called by the
client for login rewards, goals and the pass.
What happens: the server trusts the client to say what was earned, so anyone
can call `earn_cores(120)` every day without playing: 840 cores a week, a
season pass every five days, or 21,000 credits a week through the swap. The
design expects a casual player to earn about 43 a week.
Fix: lower the cap to what honest play can reach in a day (about 25, the day-7
login plus quests plus pass cores), and better, make the server decide: one
`claim_login(day)` and `claim_goal(id, day)` per reward, recorded so it can
only be claimed once.

### Purchases and ads

**3. Purchases made while sign-in failed pay nobody (high).**
Where: `src/game.ts` start-up (store started with `this.backend.userId`),
`src/store/store.ts:52-58`, webhook `index.ts` (skips non-UUID users).
What happens: if the game starts without reaching Supabase (no signal, a
timeout), RevenueCat is configured with an anonymous id and never told the real
account later. A cores pack bought in that session is recorded with no user,
the webhook pays nothing, and the client (which waits for the webhook when the
backend is "online") never adds the cores. The player is charged and gets
nothing.
Fix: call `Purchases.logIn(userId)` once sign-in succeeds (and on every later
sign-in), and refuse to sell cores until the account is known.

**4. A failed cores grant is lost for good (high).**
Where: `supabase/functions/revenuecat-webhook/index.ts`.
What happens: the event row is inserted first, then `grant_cores` runs. If the
grant fails, the function returns 500, RevenueCat retries, the insert now
collides with the stored id, and the function answers "already handled". The
cores are never paid. Any other insert error is also reported as "already
handled", so RevenueCat stops retrying.
Fix: do both in one database function (insert and grant in a transaction), and
only answer "already handled" for a unique-key violation.

**5. Refunds and revocations are ignored (high).**
Where: webhook `PAID` set (only `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`).
What happens: a refunded `premium` or starter pack stays owned (it's a row in
`store_events`), and refunded cores stay spendable. This is the standard
refund-abuse route on Google Play.
Fix: handle `CANCELLATION` (with a refund reason) and `EXPIRATION` where they
apply: mark the event refunded so `purchases()` stops returning it, and take
the cores back (`spend_cores` server-side, letting the balance go to zero).

**6. EU and UK players can't change their ad consent (high).**
Where: `src/ads/ads.ts:87` defines `privacyChoices()`; nothing calls it, and
there is no settings row for it (`docs/store.md` says there is).
What happens: Google's UMP rules require a way to reopen the consent form when
consent was required. Without it, AdMob can limit serving and Play review can
flag it.
Fix: a "privacy choices" row in settings' help group, shown when the consent
info says a privacy options entry point is required, calling
`ads.privacyChoices()`.

### Store and platform

**7. There is no Android app to upload (critical).**
Where: repo root.
What happens: no `capacitor.config.ts`, no `android/` folder, and
`@capacitor/cli` and `@capacitor/android` aren't installed. The AdMob
application id, orientation lock, icons, splash, `versionCode` and signing
don't exist yet.
Fix: add Capacitor config (`com.tomblack.endlessspace`, web dir `dist`), add the
packages, `npx cap add android`, put the AdMob app id in
`AndroidManifest.xml`, lock to portrait, generate icons and splash
(`@capacitor/assets`), and document the signed bundle build.

**8. The store listing promises something that's no longer true (high).**
Where: `docs/store.md` description ("Nothing you can buy makes you faster in
ranked") and the premium note in `src/game.ts:840`.
What happens: cores now swap for credits (`CONFIG.economy.shop.swaps`), and
credits buy upgrades that make the ship faster and stronger. Leagues cap
active upgrade points in ranked, so the claim is half true there, but the
endless and solo boards aren't bracketed at all. A false claim in a listing is
a Play policy problem and a review-score problem.
Fix: either take the swap out, or reword to something true ("ranked groups
pilots by ship power") and drop the line from the premium note.

## 4. Fix soon

**9. Rewarded ads that fail lose the reward silently.** `src/ads/ads.ts:64-73`
returns "skipped" when an ad fails to load, and `game.ts:1018` (revive) and
`game.ts:1031-1034` (double credits, which hides the button first) treat that as
"no". On a no-fill the revive ends the run and the double-credits offer is
gone. Preload the rewarded ad, say "no ad available right now", and fall back
to cores for the revive.

**10. Real ad units in test builds.** `createAdNetwork()` uses the production
ids whenever they're set; there is no `isTesting` or test-device setup. Tapping
your own live ads during testing is what gets AdMob accounts suspended. Use
Google's test ids or `isTesting: true` unless it's a release build.

**11. The unbracketed boards can be bought, and edited.** The endless and solo
boards (`0003_leaderboards.sql`, league 0) rank every ship together, and
upgrades are bought with credits, which are device-side and can be set to
anything with `sync_credits` (`0007`, accepts up to 1,000,000,000) or by
editing local storage. `check_run` only checks plausibility. Either bracket
those boards by upgrade points like ranked, or base them on a fixed ship.

**12. The client says which league it is in.** `submit_run` takes `p_league`
from the client (`0003:49,80`). A maxed ship can post into bronze. Store the
league server-side (from the last accepted runs) or derive it from upgrade
points sent with the save.

**13. A paid season pass isn't restorable.** `season_pass` is consumable and the
premium track lives only in the device save (`src/economy/pass.ts`); the server
records the purchase but `purchases()`/`grantProduct` ignore it. A lost save
loses a paid pass. Grant it from `store_events` for the current season.

**14. Daily rewards follow the device clock.** `dayKey(Date.now())` drives the
login calendar, goals and gifts. Setting the clock forward collects tomorrow's
credits today (cores are still capped by the server's day). Acceptable for a
single-player game, but worth knowing; the server-claimed rewards in item 2
fix the valuable part.

**15. The privacy policy doesn't mention ship looks on the boards.**
`public/privacy.html` lists names and scores; `set_ship` (`0006`) now publishes
each player's equipped looks too. Add a line.

**16. The second WebGL context is never released.** `src/portrait.ts` makes its
own `WebGLRenderer` for leaderboard pictures and keeps it for the session. On
older Android phones contexts are scarce and this one holds GPU memory. Dispose
it when the boards close, or draw the portraits with the main renderer into a
render target.

**17. No orientation lock.** Nothing locks portrait; on a phone with
auto-rotate the layout is unusable in landscape (the title screen only scrolls).
Lock portrait in the Android project (item 7).

## 5. Polish

- The login-reward popup can open on top of the mandatory name screen; dismissing it reveals the name screen, but it's untidy. Hold popups until the name is set.
- The revive offer hides the cores option whenever an ad is available; a player with cores can't choose to pay instead of watching.
- Cores bought online appear after a fixed 2.5 s wait (`game.ts:1163`); if the webhook is slower they show up only on the next focus refresh. Poll a few times instead.
- The webhook's `CORES` table duplicates `CONFIG.economy.store.products`; a test that compares them would stop drift.
- Taking a newer cloud save copies its keys over the device's but leaves keys the cloud doesn't have (`src/server/sync.ts:41-44`).
- Labels at 10-11 px (`.bar-btn`, `.goal-reroll`, setting notes) are small on phones; most body text is mono at 13-14 px.
- All-lowercase copy reads as a style, but makes names, ranks and league names harder to scan.
- `game.ts` is 3,200 lines; moving the shop, goals and boards controllers out would make future changes safer.

## 6. Gameplay and design notes

- **The core loop is strong.** A run starts in one tap, the camera, speed lines and environment changes give a real sense of pace, and the weekly ranked run gives a reason to come back. Determinism and the fairness tests mean the ranked board is about skill.
- **The first five minutes matter most.** The onboarding practice run, the staged reveal and the mandatory name screen are good, but a new player still meets a lot of currencies and screens by run five (credits, cores, XP, LP, pass XP, goals, achievements). Consider hiding the pass and cores until the first ranked run.
- **Difficulty can't be judged from code alone.** The curve looks reasonable on paper (levels speed up, rooms get denser), but it needs ten people on real phones. Watch where they die in their first three runs; that's where people quit.
- **Pay-to-win perception is the biggest design risk.** With cores buying credits and credits buying upgrades, the cleanest story is "money buys looks and convenience; ranked groups ships by power". Make the boards match that story (items 11 and 12) before reviewers notice.
- **Cosmetics are the right thing to sell.** The generated season looks, the ship pictures on the boards and the rank colours give looks a social reason to exist. Those are the levers to push, not credits.

## 7. Launch checklist

**Code (in order):**
1. Migration revoking `grant_cores` from `public` (item 1), with a test.
2. Server-claimed rewards or a much lower `earn_cores` cap (item 2).
3. RevenueCat `logIn` after sign-in, and no cores sales without an account (item 3).
4. Webhook: transactional grant, proper duplicate handling, refunds (items 4 and 5).
5. Privacy choices row (item 6), test ad ids in non-release builds (item 10), failure handling for rewarded ads (item 9).
6. Reword the listing and the premium note (item 8); add ship looks to the privacy policy (item 15).
7. Capacitor config, Android project, AdMob app id, portrait lock, icons, version code (items 7 and 17).
8. Then the board fairness work (items 11 and 12) and the pass restore (item 13).

**Tom:**
1. Run `npm run db:apply` after the server fixes land.
2. Google Play developer account (identity check takes days), then the app in Play Console with package `com.tomblack.endlessspace`.
3. Start recruiting 12 testers now: new personal accounts need a 14-day closed test before production.
4. AdMob account, Android app, a rewarded ad unit, the UK/EU consent message, `app-ads.txt` at the root of a site you control (`tomblack9452.github.io` needs its own repo for that), payment details.
5. In-app products in Play Console, RevenueCat project and webhook (`docs/store.md`).
6. Data safety form (anonymous id, gameplay data, purchase history, advertising id), content rating, target audience (not children), privacy URL, and the account deletion URL (`https://tomblack9452.github.io/endless/privacy.html#deleting-your-data`, after adding that anchor).
7. Store assets: 512 px icon, 1024×500 feature graphic, phone screenshots.
8. Build and sign the bundle in Android Studio; keep the upload key safe.
