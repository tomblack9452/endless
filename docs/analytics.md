# Usage stats (Firebase Analytics)

From 1.0.13 the Android app can send usage stats to Google Analytics for
Firebase. They answer questions like "how many players tap an ad offer?" and
"how many open the store but don't buy?". The web build never sends any.

The code is `src/platform/analytics.ts`. Every event and its fields are typed
there (`Events`), so a new event or field has to be added there first.

## When anything is sent

All four must hold:

1. **The Android app.** On the web, `analytics` has no plugin and does nothing.
2. **A build with Firebase.** That means `VITE_ANALYTICS=1` in `.env`, plus
   `android/app/google-services.json`. Without the json, Gradle leaves the
   google-services plugin out (`android/app/build.gradle`) and the build works
   as before. Neither file is committed: `google-services.json` is in `.gitignore`.
3. **Consent.** The player agreed on Google's consent form, the one the ads
   already show (UMP), or the law where they are doesn't ask for it. On iPhone,
   they must also allow tracking. This is `ads.consented`. It's checked again
   after "ad privacy choices" in settings.
4. **The setting.** Settings > share usage stats is on (the default). The row
   only shows in a build that can send.

Until the consent form answers, events wait in memory (20 at most), for
example the anonymous sign-up on first launch. They are sent once the player
agrees, and dropped if they don't. Nothing waits on disk.

The manifest also switches collection off until the game turns it on
(`firebase_analytics_collection_enabled` false). The advertising id is never
collected (`google_analytics_adid_collection_enabled` false), and
ad-personalisation signals are off.

**No personal data:** no names, emails, pilot names, or Supabase account ids.
Events are tied to the random **app instance id** Firebase makes for each
install. Tom can choose to also set the Supabase user id as the analytics
user id, which would link one player's phones together. That isn't done
unless he says so; it's a single `setUserId` call, and privacy.html would
need a line about it.

## Events

| Event | Fields | Sent when |
|---|---|---|
| `screen_view` (Firebase's own) | screen name | a menu screen opens (`ui.show`) |
| `run_start` | mode: ranked, solo, endless, daily, level, zen | a run starts (not the tutorial course) |
| `run_end` | mode, score, distance, seconds, level, outcome: crashed / finished / quit | the run ends or is left from pause |
| `tutorial_complete` | controls | the last lesson is done |
| `tutorial_skip` | step ("lesson 3") | "skip" during the practice run |
| `sign_up` | method: anonymous / google | a new account is made / kept with Google |
| `login` | method: google | switched to the account a Google login keeps |
| `ad_offer_shown` | placement | an ad offer is on screen (the gift and goal swap count once a session) |
| `ad_offer_tapped` | placement | the player taps it |
| `ad_rewarded` / `ad_skipped` / `ad_unavailable` | placement | how the ad went |
| `view_store` | source: dock, wallet, shop, short, results, hub | the store opens (a redraw doesn't count) |
| `view_item` | item_id, source | the pass screen opens; a pack offered on the short-of sheet |
| `begin_checkout` | item_id | a buy button is tapped (before Google Play's sheet) |
| `purchase` | item_id | Google Play says it's bought |
| `purchase_cancelled` | item_id | the player closed Google Play's sheet |
| `earn_virtual_currency` | virtual_currency_name: credits / cores, value, source | the wallet gains (run, goal, gift, stars...) |
| `spend_virtual_currency` | virtual_currency_name, value, item_name | the wallet pays (look, upgrade, revive, swap...) |

Ad placements are `revive`, `double_credits`, `daily_gift`, `goal_swap` and
(1.0.14) `free_cores`. `interstitial_shown` (with the player's run count) logs
each interstitial, from 1.0.14.
Premium players see no ads, so no ad events are sent for them.

`purchase` carries **no price on purpose**. Firebase already records real
money from Google Play by itself (`in_app_purchase`, with the price and
currency), so adding a value to our event would count the money twice. Use
`in_app_purchase` for revenue and `purchase` / `purchase_cancelled` for the
funnel.

## Answering the questions

In the Firebase console, under Analytics:

- **How many tap ads:** Events > `ad_offer_shown`, `ad_offer_tapped` and
  `ad_rewarded`, split by `placement`. Register `placement` as a custom
  dimension first (Custom definitions > Create, event-scoped). Shown → tapped
  is the offer's pull; tapped → rewarded is how often an ad actually plays out.
- **How many look at the store but don't buy:** In Google Analytics (Firebase
  links to it), Explore > Funnel exploration, with the steps `view_store` →
  `begin_checkout` → `purchase`. Do the same by `source` (a custom dimension)
  to see which prompt leads to sales. `purchase_cancelled` is the people who
  saw Google Play's price sheet and backed out.
- **Where the tutorial loses people:** `tutorial_skip` by `step`, against
  `tutorial_complete`.
- **How runs go:** `run_end` by `mode` and `outcome`.

**Offers (1.0.14):** `offer_shown` and `offer_tapped` with `offer` (the title's
store card: `starter`, `pass`, `week:<pack>`, `sale:<product>`; the end screen's
`vault`). A funnel per offer: `offer_shown` → `view_store` (its source:
`starter_offer`, `week_pack`, `sale`, `pass_card`) → `begin_checkout` →
`purchase`. `interstitial_shown` counts the ads between runs; watch retention
(day 1, day 7) next to it.

Custom dimensions worth making: `offer`, `placement`, `source`, `mode`, `outcome`,
`item_id`, `step`, `virtual_currency_name`.

**Accounts.** Firebase counts installs that agreed. To count every account,
including the ones that didn't agree, run this in Supabase's SQL editor:

```sql
select * from public.account_counts();
```

It gives the total accounts, anonymous and Google accounts, new in 7 and 30
days, and pilots with a run in 7 and 30 days. It returns counts only, never
who, and only the service role can call it (migration 0025).

## Setting it up (Tom)

1. **Make the Firebase project.** At console.firebase.google.com, add a
   project. Pick the existing Google Analytics account, or let it make one.
2. **Add the Android app** with package `com.tomblack.endlessspace`. Download
   `google-services.json` into `android/app/`. Don't commit it (it's in `.gitignore`).
3. **Add `VITE_ANALYTICS=1`** to `.env`. Then build as usual: `npm run build`,
   `npx cap sync android`, then the release steps in `.claude/skills/android/SKILL.md`.
4. **Data settings**, in Analytics > Admin > Data settings:
   - Set Data retention to **2 months**, as privacy.html says.
   - Under Data collection, keep **Google signals off**.
   - In Project settings > Integrations, leave **data sharing with Google**
     (benchmarking, technical support, account specialists) **off** unless
     you're happy to update the Data safety form.
5. **Check it works.** Plug in a phone and run
   `adb shell setprop debug.firebase.analytics.app com.tomblack.endlessspace`.
   Open the app, agree on the consent form, play a run, and watch the events
   arrive in Analytics > DebugView. Turn debug off with
   `adb shell setprop debug.firebase.analytics.app .none.`.
6. **Update the Data safety form** in Play Console; the steps are in docs/play-console.md, part 4f.

## Linking to Google Ads

Linking lets Google Ads use the events: count `purchase` or
`tutorial_complete` as conversions for an app campaign, and build audiences,
for example "opened the store, never bought".

1. Firebase console > Project settings > **Integrations** > Google Ads >
   **Link**. Pick the Google Ads account; you need admin on both.
2. In Google Ads, go to Goals > Conversions > New conversion action > App >
   **Google Analytics 4 properties (Firebase)**. Import `in_app_purchase` (it
   carries the revenue), and `tutorial_complete` if you want an install-quality
   signal.
3. For audiences, open Google Analytics > Admin > Audiences. Build one from
   events, for example `view_store` without `purchase` in 30 days. Audiences
   go to Google Ads once the accounts are linked.

What changes when you link:

- Google then uses the data for advertising. On the Data safety form, the
  analytics rows become **Shared**, with the purpose **Advertising or
  marketing**. Add a line to privacy.html as well.
- Campaigns optimise better with the advertising id. That means removing
  `google_analytics_adid_collection_enabled` from
  `android/app/src/main/AndroidManifest.xml` (Google's consent form already
  covers it), updating the Device or other IDs row on the form, and editing
  the privacy page's "advertising id isn't collected" line.
- Conversions from players who declined consent are only modelled by Google, not counted.
