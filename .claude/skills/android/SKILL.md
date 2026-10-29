---
name: android
description: Building, signing, testing and releasing Endless Space's Android app (Capacitor 8), and debugging what only shows up on a phone - Google sign-in, AdMob ads, RevenueCat purchases, Play Console tracks. Use for anything about the Android build, a new release or upload, the AAB, versionCode, keys and SHA-1s, Logcat errors, or where the Play launch stands.
---

# Endless Space on Android

A Vite + TypeScript game wrapped with Capacitor 8. The web build in `dist/` is
copied into `android/` and run in a WebView. App id `com.tomblack.endlessspace`.
The longer guides live in `docs/play-console.md` (Play Console, step by step)
and `docs/store.md` (store, RevenueCat, AdMob and Google sign-in setup);
`docs/README.md` lists every doc. The code is grouped by area under `src/`
(core, world, ship, progression, ui, platform, ...): see the README's project layout.

## Rules

- Never commit `.env` or any `.jks` / keystore file. The upload key is a `.jks`
  on Tom's home PC; it is the only key that may sign a bundle for Play.
- Commits go out as Tom Black (`git -c user.name="Tom Black" -c user.email=<Tom's
  personal address> commit ...`; ask him for it, it never goes in a file),
  with no Co-Authored-By, session links or mention of AI.
- The public contact address is tomblackdev@proton.me. Never publish the gmail.
- Run Capacitor commands from the project root, never from `android/`.

## Builds

Always from the root:

```sh
npm run build              # tsc + vite build into dist/
npx cap sync android       # copies dist/ and the plugins into android/
npx cap open android       # Android Studio
```

- **Testing on a phone** (Android Studio > Run): leave `VITE_ADMOB_LIVE` unset,
  so only Google's test ads show. Purchases fail here with "this version of the
  app is not configured for billing" - expected; billing only works on a build
  installed from Play.
- **Release** (an upload to a Play track):
  1. Raise `versionCode` (and `versionName`) in `android/app/build.gradle`.
     Play refuses a versionCode it has seen before. (1.0.11 is versionCode 12.)
  2. Set `VITE_ADMOB_LIVE=1` in `.env` for this build only, then
     `npm run build && npx cap sync android`.
  3. Android Studio > Build > Generate Signed App Bundle > Android App Bundle,
     signed with the home `.jks` (release variant). Output:
     `android/app/release/app-release.aab`.
  4. Play Console > Test and release > the track (closed testing: Alpha) >
     Create new release > upload the AAB > notes > Next > Save > send for review.
  5. Set `VITE_ADMOB_LIVE` back to empty.
- Signed with the wrong key (e.g. on another PC)? Play rejects it. Don't upload
  it; rebuild at home with the right `.jks`. A bundle already on Play can be
  reused on another track with "Add from library".

## Environment (`.env`, from `.env.example`)

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL` (db:apply only),
`VITE_GOOGLE_WEB_CLIENT_ID` (the *Web* OAuth client, not the Android one),
`VITE_REVENUECAT_GOOGLE_KEY`, `VITE_ADMOB_REWARDED_ANDROID`,
`VITE_ADMOB_INTERSTITIAL_ANDROID`, `VITE_ADMOB_LIVE`. These are baked into the
build, so a change needs a rebuild and `cap sync`. They don't go in GitHub
secrets unless a CI build is added. `npm run check-server` says what's missing.

## Server

Supabase. New migrations in `supabase/migrations/` (now up to
`0024_spend_once.sql`) only reach the live database with
`npm run db:apply`. Never edit one that has shipped: add the next number, add its
marker to `MADE` in `scripts/apply-db-lib.mjs` (a table or function it makes, or a
`select ... as there` query when it makes nothing, like `0023`), then `npm run db:setup`. After
adding one, remind Tom to run `db:apply`. `0012` is the trusted clock
(`server_now`: days, weeks and seasons follow the server, not the phone), `0013`
the service records on the boards (public ids, `pilot_record`), `0014` the
purchase time and one-at-a-time `earn_cores`, `0015` leagues on the server
(`players.league`, checked in `submit_run`), `0016` refunded season passes,
`0017` reports (`report_pilot`), `0018` error reports (`log_errors`), `0019`
the daily challenge (the `daily` board, `daily_period`, the streak's cores in
`earn_cores`), `0020` name reports only from trusted reporters
(`trusted_reporter`), `0021` error reports clearing themselves after 60 days
(`prune_client_errors`), `0022` ghost rivals (`rival_path`: the run just above
you on your ranked board, with only the pilot name), `0023` function hygiene
(only the trigger runs `on_new_user`; every function has its own
`search_path`; nothing changes for the game), `0024` a cores spend taken once
(`spend_cores_once` with the spend's id; `spend_cores` stays for older builds).

The splash: Android 12+ shows its own (the icon on `#1d2031`, styles.xml),
then the game's full-screen splash in `index.html` (lifted by
`src/ui/splash.ts`); Android 11 and older show `res/drawable*/splash.png`, the
same picture. The webview's background (`capacitor.config.ts`) and the first
system bar style match its night sky.

RevenueCat purchases arrive through the `revenuecat-webhook` edge function,
which calls `store_purchase_at` (0014; apply it before redeploying the webhook)
and writes `store_events` with RevenueCat's purchase time. A refund renames the
row's product to `refunded:<product>`. A refunded season pass (bought with
money) takes back the cores its premium tiers paid and closes the premium track
(`0016`); one unlocked with cores is never touched. After `db:apply`, redeploy
the webhook when its code changes (1.0.7: a constant-time secret check; 1.0.8
and 1.0.9 leave it alone, and so do 1.0.10 and 1.0.11).

## Google sign-in (`src/platform/account.ts`)

`@capgo/capacitor-social-login`, Credential Manager, plus Supabase identity linking.

- Google Cloud needs three OAuth clients:
  - one Web client, whose id goes in `.env`;
  - an Android client per signing key, all with package `com.tomblack.endlessspace`:
    - debug key: `1C:F1:43:59:40:86:EB:1E:44:D6:52:85:AB:0D:08:AE:46:A5:5F:38`
    - upload key: starts `57:78:08`
    - Play App Signing key: from Play Console > Test and release > App integrity
      > App signing. Installs from Play are signed with this one.
- `[16] Account reauth failed` (or the account picker coming back twice and
  then nothing) almost always means the installed build's SHA-1 has no Android
  client. Check which key signed it.
- Don't pass `scopes` to the plugin. It rejects the login unless MainActivity
  is replaced.
- The nonce: the SHA-256 goes to Google and the raw value to Supabase.
- `identity_already_exists` means that Google account already keeps another
  player. The game switches to it.
- Debug from the phone: Android Studio > Logcat, filter `Capacitor/Console`.
  The game logs `google sign-in failed <code> <message>`. Since 1.0.7 the
  same failures (and crashes, purchases, ads, cloud saves) also land in the
  `client_errors` table: `docs/server.md`, "Error reports".

## Reminders (`@capacitor/local-notifications` 8.3.1, since 1.0.8)

`src/platform/reminders.ts`: an opt-in local notification once a day at most
(settings > reminders, 18:00 by default), planned a week ahead on the phone.
No push server and no Firebase.

- The manifest has `POST_NOTIFICATIONS`; Android 13+ asks only when the player
  turns reminders on (or says yes to the one offer after the 5th valid run),
  never at start-up. A refusal turns the setting back off, and once refused
  Android won't ask again: settings > apps > Endless Space > notifications.
- The plugin also asks for `SCHEDULE_EXACT_ALARM`; the manifest removes it
  (`tools:node="remove"`): reminders are inexact (`isExactNotification:
  false`), so there's no exact alarm declaration in the Play Console.
- The status bar icon is `res/drawable/ic_stat_endless.xml` (the dart ship),
  set with the amber in `capacitor.config.ts` (`LocalNotifications`).
- They use ids 1080-1086 and their own channel, `reminders`.
- Testing on a phone: turn reminders on, pick the next time slot (or set the
  phone's clock just before it), put the game in the background. Logcat
  `Capacitor/Console` shows `reminders schedule` failures, and they also land
  in `client_errors`.
- After `npm install`, `npx cap sync android` adds the plugin to the Android
  project (`capacitor.settings.gradle` and `app/capacitor.build.gradle` are
  already updated in the repo).

## Sharing (`@capacitor/share` 8.0.3 and `@capacitor/filesystem` 8.1.5, since 1.0.9)

`src/platform/share.ts`: the share card (a PNG of a new best) is written to
the app's cache directory (`endless-space-share.png`, written over each time)
and handed to Android's share sheet with "score · mode · endless space" and
the Play listing (`https://play.google.com/store/apps/details?id=com.tomblack.endlessspace`).
The web keeps the Web Share API (or saves the picture).

- No permissions: the cache needs none, and the share plugin brings its own
  FileProvider in its manifest.
- After `npm install`, `npx cap sync android` adds both plugins
  (`capacitor.settings.gradle` and `app/capacitor.build.gradle` are already
  updated in the repo by `npx cap update android`).
- Testing on a phone: finish a run with a new best (or any ranked run), tap
  share; the sheet should offer the picture to messaging apps. Closing the
  sheet is quiet; a failure shows "sharing isn't available here". Logcat
  (filter `Capacitor`) shows the plugin calls.

## Ads (AdMob, `@capacitor-community/admob`)

- The AdMob app id (in `AndroidManifest.xml`) is
  `ca-app-pub-4447582079973716~3555140115`.
- The rewarded unit is `ca-app-pub-4447582079973716/1921212980`, used for
  revives (once the day's free one is used, the player picks an ad or 50
  cores), doubling credits, the daily gift and swapping a daily goal.
- Test ads show until `VITE_ADMOB_LIVE=1`. Never tap live ads on your own phone.
- GDPR and US consent messages are set up in AdMob > Privacy & messaging.
- `app-ads.txt` is served from the root of `https://tomblack.online` (the
  Vercel site, repo `tomblack-website`, `public/app-ads.txt`), the website in
  the Play listing.
- Web pages live on `apps.tomblack.online`: the `tomblack9452.github.io` repo
  (home page, Search Console file) with a custom domain, and this repo's Pages
  under `/endless/` (game, privacy, support). Google needs the home page and
  privacy policy on a domain we own; `github.io` doesn't count.

## Purchases (RevenueCat, `@revenuecat/purchases-capacitor`)

- Products are fetched by ID; no entitlements or offerings are used.
- The IDs are `cores_100`, `cores_550`, `cores_1200`, `cores_2500`,
  `starter_pack`, `season_pass`, `premium`.
- The store icons are in `public/store/` (160px) and `docs/store-assets/products/`
  (512px, for Play).
- Testing:
  - The tester's Google account must be a license tester (Play Console >
    Settings > License testing).
  - The app must be installed from a Play track.
  - Cores land when the webhook delivers, which `awaitPaidCores()` waits for.
- "Restore" (bottom of the store page) reads Google Play's records and the
  server's for this account. A purchase made on another phone shows up only
  after signing in with the same Google account.

## Play launch status

These are external steps; ask Tom where each stands rather than assuming.

- The closed testing track (Alpha) uses the Google Group
  endless-space-testers@googlegroups.com. A personal account needs 12+ testers
  opted in for 14 days before it can apply for production.
- Google Auth Platform branding verification is pending; the domain was
  verified in Search Console.
- The payments profile was being verified (it set off the red "developer
  profile will be removed" banner).
- Still to do: US tax forms (W-8BEN) and the AdSense test deposit.

## Orientation and edge to edge

- Portrait on phones only: `MainActivity` holds the screen upright when the
  smallest width is under 600dp and leaves tablets, unfolded foldables and
  Chromebooks free to turn (it re-checks on fold and unfold). The manifest has
  no `screenOrientation`; don't add one back (Play's large-screen check).
  Landscape plays in a centred portrait column (`--play-w`, `renderer.ts`).
  Tilt steering reads beta instead of gamma when the screen is on its side.
- Edge to edge everywhere: `EdgeToEdge.enable` in `MainActivity`. Capacitor's
  SystemBars (`capacitor.config.ts`, `insetsHandling: 'css'`) passes the insets
  to `env()` on WebView 140+ and sets `--safe-area-inset-*` on older ones;
  `src/ui/styles/base.css` reads both into `--safe-top/bottom/left/right`. Anything placed
  against a screen edge uses those.
- The bar icons follow what's behind them, not the phone's theme:
  `src/ui/systemBars.ts`, from the open screen, dark mode and the scene's text
  colour.
- No deprecated edge-to-edge calls (`setStatusBarColor`, cutout modes,
  `statusBarColor` theme items) in our code or resources. Any Play still lists
  come from libraries (androidx.activity on old Android versions, AdMob...);
  the Play Console warning names the class.
- Check a change on a tablet emulator in both orientations, and on a real
  phone that the status bar and gesture bar cover nothing.

## Target SDK

`targetSdk` and `compileSdk` are 36, `minSdk` 24 (`android/variables.gradle`).
Since 31 August 2026 Play needs API 36 for new apps and updates; the next rise
(37) is expected in August 2027. On API 36 large screens ignore an orientation
lock anyway, which is why the game only holds phones upright.

## Checks before handing back a change

`npx tsc --noEmit` and `npx vitest run` must pass. For UI work, use Playwright
with Chromium at `/opt/pw-browsers/chromium` against `npm run dev`. Look at
360x640 and a tall phone (e.g. 427x952) and make sure nothing overflows sideways.
