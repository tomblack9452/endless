---
name: android
description: Building, signing, testing and releasing Endless Space's Android app (Capacitor 8), and debugging what only shows up on a phone - Google sign-in, AdMob ads, RevenueCat purchases, Play Console tracks. Use for anything about the Android build, a new release or upload, the AAB, versionCode, keys and SHA-1s, Logcat errors, or where the Play launch stands.
---

# Endless Space on Android

A Vite + TypeScript game wrapped with Capacitor 8. The web build in `dist/` is
copied into `android/` and run in a WebView. App id `com.tomblack.endlessspace`.
The longer guides live in `docs/play-console.md` (Play Console, step by step)
and `docs/store.md` (store, RevenueCat, AdMob and Google sign-in setup).

## Rules

- Never commit `.env` or any `.jks` / keystore file. The upload key is a `.jks`
  on Tom's home PC; it is the only key that may sign a bundle for Play.
- Commits go out as `git -c user.name="Tom Black" -c user.email="tom.black9452@gmail.com" commit ...`
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
     Play refuses a versionCode it has seen before.
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
`0012_trusted_clock.sql`) only reach the live database with `npm run db:apply`.
After adding one, remind Tom to run it. RevenueCat purchases arrive through the
`revenuecat-webhook` edge function, which writes `store_events`.
A refund renames the row's product to `refunded:<product>`.

## Google sign-in (`src/account.ts`)

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
  The game logs `google sign-in failed <code> <message>`.

## Ads (AdMob, `@capacitor-community/admob`)

- The rewarded unit is `ca-app-pub-4447582079973716/1921212980`, used for
  revives and doubling credits.
- Test ads show until `VITE_ADMOB_LIVE=1`. Never tap live ads on your own phone.
- GDPR and US consent messages are set up in AdMob > Privacy & messaging.
- `app-ads.txt` is served from the root of the `tomblack9452.github.io` user
  site repo, not this repo's Pages site.

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
- "Restore purchases" reads the server's records for this account. A purchase
  made on another phone shows up only after signing in with the same Google account.

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

## Checks before handing back a change

`npx tsc --noEmit` and `npx vitest run` must pass. For UI work, use Playwright
with Chromium at `/opt/pw-browsers/chromium` against `npm run dev`. Look at
360x640 and a tall phone (e.g. 427x952) and make sure nothing overflows sideways.
