# Store and server setup

What has to be set up by hand before the server and purchases go live. The game
runs without any of it: with no keys in `.env`, everything stays on the device,
and the web build sells nothing.

## 1. Supabase (accounts, cloud save, cores, leaderboards)

The short version is in [leaderboards.md](leaderboards.md). In full:

1. Create a project at supabase.com.
2. Authentication > Sign In / Providers: turn on **anonymous sign-ins**.
3. The database: `npm run db:apply` with `SUPABASE_DB_URL` in `.env` (see
   leaderboards.md), or paste the files in `supabase/parts/` into the SQL editor one at a
   time, in order. (Or with the CLI: `supabase link`, then `supabase db push`.)
4. Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project settings > API). `.env` is never committed.
5. For the live site, add the same two values as repository secrets
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`); `deploy.yml` passes them to
   the build.
6. `npm run check-server` checks all of the above.
7. Only for store purchases (section 3): deploy the webhook.
   ```
   supabase secrets set REVENUECAT_WEBHOOK_SECRET=<a long random string>
   supabase functions deploy revenuecat-webhook --no-verify-jwt
   ```

## 2. App Store Connect and Google Play

1. Create the app in each (bundle id `com.tomblack.endlessspace`).
2. Create these in-app products (all **consumable** except where noted). The
   ids must match `CONFIG.economy.store.products` in `src/config.ts`:

   | id | type | gives | suggested price |
   |---|---|---|---|
   | `cores_100` | consumable | 100 cores | 0.99 |
   | `cores_550` | consumable | 550 cores | 4.99 |
   | `cores_1200` | consumable | 1,200 cores | 9.99 |
   | `cores_2500` | consumable | 2,500 cores | 19.99 |
   | `starter_pack` | non-consumable | 500 cores and the nova hull | 2.99 |
   | `season_pass` | consumable (one per season) | the pass's premium track | 4.99 |
   | `premium` | non-consumable | no ads, ad rewards without the ad, the halo hull, regalia paint and crown flame, an extra free revive a day, a badge on the boards | 4.99 |

   The webhook keeps every purchase in `store_events`; owning `premium` (or the
   starter pack) is a row there, so it follows the account to a new device. In
   the game, `src/store/entitlements.ts` is what everything asks.

## 3. RevenueCat

1. Create a project; add the iOS and Android apps with their store credentials.
2. Import the products above.
3. Put the public SDK keys in `.env`: `VITE_REVENUECAT_APPLE_KEY` and
   `VITE_REVENUECAT_GOOGLE_KEY`.
4. Integrations > Webhooks: the `revenuecat-webhook` function's URL, with the
   Authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>`.

## 4. Ads (AdMob)

Rewarded ads only at launch (a revive, doubled run credits, a daily gift, a new
daily goal); interstitials are off in `CONFIG.ads.interstitial`. Premium players
never see an ad and get those rewards free. The web build has no ads.

1. Create an AdMob account and add the two apps.
2. Make a **rewarded** ad unit in each (and an interstitial one, for later).
3. Put the ad unit ids in `.env` (and the repository secrets, for builds):
   `VITE_ADMOB_REWARDED_IOS`, `VITE_ADMOB_REWARDED_ANDROID`, and, for later,
   `VITE_ADMOB_INTERSTITIAL_IOS`, `VITE_ADMOB_INTERSTITIAL_ANDROID`. Without
   them the apps run with no ads.
4. After `npx cap add` (below), put the AdMob **app** ids in the native projects:
   `GADApplicationIdentifier` in `ios/App/App/Info.plist`, and the
   `com.google.android.gms.ads.APPLICATION_ID` meta-data in
   `android/app/src/main/AndroidManifest.xml`. On iOS also add
   `NSUserTrackingUsageDescription` ("Lets ads be more relevant to you.").
5. In AdMob > Privacy & messaging, publish a GDPR message (UK and EU) and an
   IDFA explainer. The game shows Google's consent form and Apple's tracking
   prompt on first start; if either is declined, ads are non-personalised.
   Settings has a "privacy choices" row to change it later.

## 5. Building the apps

The Android project is in `android/` (Capacitor 8, package
`com.tomblack.endlessspace`, portrait only, AdMob app id in
`android/app/src/main/AndroidManifest.xml`, icons and splash from the game's
icon). Each time the game changes:

```
npm run build
npx cap sync android
```

Then open the `android/` folder in Android Studio (it needs JDK 21, which
Android Studio includes):

- **Run on your phone:** plug it in with USB debugging on and press Run.
- **A bundle for Play:** Build > Generate Signed App Bundle > Android App
  Bundle. The first time, create an upload key (a `.jks` file) and keep it
  and its passwords somewhere safe; every update must be signed with it.
  Upload the `.aab` from `android/app/release/` to Play Console.
- **Each upload needs a higher `versionCode`** (and usually a new
  `versionName`) in `android/app/build.gradle`.

Ads are Google's test ads in every build until `VITE_ADMOB_LIVE=1` is in `.env`
when you build. Set it only for the build you release, never while testing:
tapping your own live ads can get the AdMob account closed.

iOS later: `npm install @capacitor/ios`, `npx cap add ios`, then the same in
Xcode, with `GADApplicationIdentifier` and `NSUserTrackingUsageDescription`
in `Info.plist`.

## 6. Store listing checklist

- **Name:** Endless Space
- **Subtitle (iOS, 30 characters):** Fly the endless frontier
- **Short description (Play, 80 characters):** A fast, calm space runner. A new
  ranked run every week.
- **Description:**
  > Steer a small ship through canyons, ice fields, volcanic plains, asteroid
  > belts and the decks of a great ship, faster and faster.
  >
  > Every week there's a new ranked run, the same for everyone: fly it as often as you like to set your best. Climb seven
  > leagues, earn your rank, and fly your weekly best again and again. Or play
  > solo: pick a place and see how far you get, or work through the set levels
  > for stars.
  >
  > Daily rewards, daily quests, a season pass and a shop of ship looks. Ranked
  > groups pilots into leagues by ship power, so you always race ships like
  > yours.
- **Keywords (iOS):** runner,space,arcade,endless,ship,ranked,weekly,flying
- **Category:** Games > Arcade (Racing as the second)
- **Age rating:** 4+ / Everyone (no violence beyond crashing, no chat), with
  ads and in-app purchases declared. Not listed as made for children (ads can
  be personalised, with consent).
- **Privacy:** an anonymous account id, gameplay data (scores, runs),
  purchase history, and for ads the device's advertising id when the player
  allows it (AdMob). Needs a privacy policy URL.
- **Screenshots** (6.7" iPhone 1290×2796, 5.5" 1242×2208, Android phone
  1080×1920 at least), in this order:
  1. a canyon run at speed, with a near-miss chain
  2. the title screen (ranked button, wallet bar)
  3. inside the ship, a hand-made section with lasers
  4. the ice field in a blizzard
  5. the volcanic plain with lava bombs falling
  6. the league screen after a promotion
  7. the hangar with a premium paint
- **App preview video:** 15-30 s of play, no menus.
