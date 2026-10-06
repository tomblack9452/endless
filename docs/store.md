# Store and server setup

What has to be set up by hand before the server and purchases go live. The game
runs without any of it: with no keys in `.env`, everything stays on the device,
and the web build sells nothing.

## 1. Supabase (accounts, cloud save, cores, leaderboards)

The short version is in [leaderboards.md](leaderboards.md). In full:

1. Create a project at supabase.com.
2. Authentication > Sign In / Providers: turn on **anonymous sign-ins**.
3. SQL editor: paste all of `supabase/setup.sql` and run it. (Or with the CLI:
   `supabase link`, then `supabase db push`.)
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
   | `starter_pack` | non-consumable | 500 cores, 3 tickets, the nova hull | 2.99 |
   | `season_pass` | consumable (one per season) | the pass's premium track | 4.99 |

## 3. RevenueCat

1. Create a project; add the iOS and Android apps with their store credentials.
2. Import the products above.
3. Put the public SDK keys in `.env`: `VITE_REVENUECAT_APPLE_KEY` and
   `VITE_REVENUECAT_GOOGLE_KEY`.
4. Integrations > Webhooks: the `revenuecat-webhook` function's URL, with the
   Authorization header `Bearer <REVENUECAT_WEBHOOK_SECRET>`.

## 4. Building the apps

```
npm install @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Endless Space" com.tomblack.endlessspace --web-dir dist
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

Then open `ios/` in Xcode and `android/` in Android Studio to sign and upload.

## 5. Store listing checklist

- **Name:** Endless Space
- **Subtitle (iOS, 30 characters):** Fly the endless frontier
- **Short description (Play, 80 characters):** A fast, calm space runner. A new
  ranked run every week. No ads.
- **Description:**
  > Steer a small ship through canyons, ice fields, volcanic plains, asteroid
  > belts and the decks of a great ship, faster and faster.
  >
  > Every week there's a new ranked run, the same for everyone, with five tries to set your best. Climb seven
  > leagues, earn your rank, and fly your weekly best again and again. Or play
  > solo: pick a place and see how far you get, or work through the set levels
  > for stars.
  >
  > Daily rewards, daily quests, a season pass and a shop of ship looks. Nothing
  > you can buy makes you faster in ranked.
- **Keywords (iOS):** runner,space,arcade,endless,ship,ranked,weekly,flying
- **Category:** Games > Arcade (Racing as the second)
- **Age rating:** 4+ / Everyone (no violence beyond crashing, no chat)
- **Privacy:** an anonymous account id, gameplay data (scores, runs) and
  purchase history; nothing personal, no tracking. Needs a privacy policy URL.
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
