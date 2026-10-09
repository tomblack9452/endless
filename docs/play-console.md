# Google Play Console, step by step

Everything from an empty developer account to Endless Space live on Google
Play, in the order that gets you there fastest. Play Console moves its menus
now and then: if a name below isn't where it says, type it into the search bar
at the top of Play Console.

The long pole is the **closed test: 12 testers, opted in for 14 days in a
row**, which new personal accounts must finish before Google lets them publish.
So the order is: create the app, get a build into testing, start the closed
test, and do everything else while the 14 days run.

| Part | What | When |
|---|---|---|
| 0 | Before you start: the release bundle | Tonight |
| 1 | Create the app | Tonight |
| 2 | Internal testing: your first upload | Tonight |
| 3 | App signing and the Google sign-in fingerprints | Tonight |
| 4 | App content (the policy forms) | Before the closed test |
| 5 | Store listing and store settings | Before the closed test |
| 6 | Closed test: 12 testers, 14 days | As soon as 4 and 5 are done |
| 7 | Payments profile and license testers | During the 14 days |
| 8 | In-app products | During the 14 days |
| 9 | Apply for production | After the 14 days |
| 10 | The production release and launch day | After approval |
| 11 | Every update after that | Ongoing |
| 12 | When something goes wrong | |

---

## 0. Before you start: the release bundle

Play takes an **Android App Bundle** (`.aab`), signed with your **upload key**.

1. In the `endless` folder, check `.env`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`: set.
   - `VITE_GOOGLE_WEB_CLIENT_ID`: set (Google sign-in).
   - `VITE_ADMOB_REWARDED_ANDROID`: your rewarded unit, if you've made it (without it there are simply no ads).
   - `VITE_REVENUECAT_GOOGLE_KEY`: once RevenueCat is set up (without it the store's real-money cards say they're in the app and nothing can be bought).
   - `VITE_ADMOB_LIVE`: **empty** for every testing build. Only `1` for the production build (part 10). Tapping your own live ads can get the AdMob account closed.
2. Build and copy into the Android project:
   ```
   npm run build
   npx cap sync android
   ```
3. Check the version in `android/app/build.gradle`:
   ```
   versionCode 1
   versionName "1.0.0"
   ```
   `versionCode` is a whole number Play uses to tell builds apart: **every bundle
   you upload must have a higher one than any before it**, on any track. Start at
   1. `versionName` is what players see; change it as you like (1.0.0, 1.0.1...).
4. In Android Studio: **Build > Generate Signed App Bundle or APK > Android App Bundle > Next**.
   - Key store path: your `endless-upload.jks`, its password, alias `upload`, key password.
   - **Next**, choose **release**, **Create**.
   - The file is `android/app/release/app-release.aab`.
5. **Back up the `.jks` and its passwords** (a password manager and a USB stick).
   Every update must be signed with it. If it's ever lost, Play support can
   reset it, but that takes days.

---

## 1. Create the app

1. Go to [play.google.com/console](https://play.google.com/console), signed in
   as the developer account.
2. On **Home** (the list of all apps), click **Create app**.
3. **App details:**
   - **App name:** `Endless Space` (up to 30 characters; this is the name on the store, and can be changed later).
   - **Default language:** English (United Kingdom) – en-GB. It's the language your listing is written in.
   - **App or game:** **Game**. This puts it in the games part of the store and the game categories.
   - **Free or paid:** **Free**. Free apps can have in-app purchases and ads. A free app can never become paid, which is fine.
4. **Declarations:**
   - **Developer Program Policies:** tick (you agree to follow them).
   - **US export laws:** tick (the app uses ordinary encryption, HTTPS, which counts and is allowed).
5. **Create app**.

You land on the app's **Dashboard**. It has a list of tasks, grouped as
"Start testing now", "Set up your app", "Release your app". Every task in it
is covered below; each one links straight to its form, and gets a tick when
done.

---

## 2. Internal testing: your first upload

Internal testing is a private track for up to 100 testers, with **no review**:
a build is installable within minutes. Uploading here first also turns on Play
App Signing and lets you create in-app products, which need an uploaded build.

### 2a. Testers
1. Left menu: **Test and release > Testing > Internal testing**.
2. Open the **Testers** tab.
3. **Create email list**:
   - **List name:** `Me`.
   - **Add email addresses:** the Gmail on your phone (and the second account you use for testing, if you like). Press Enter after each.
   - **Save changes**.
4. Back on the Testers tab, **tick the list** you made, and **Save**.
5. Further down, **How testers join your test**: there's a **Copy link** button
   ("Join on the web"). Keep the link; you'll open it on your phone.
6. **Feedback URL or email address:** `tomblackdev@proton.me`. **Save**.

### 2b. The release
1. Top right of the Internal testing page: **Create new release**.
2. **Play App Signing** (shown on the first release only): leave it on
   **"Use Google-generated key"** (the default) and continue. This means Google
   holds the key that signs what players download, and your `.jks` is only the
   **upload key** that proves uploads come from you. It's what Google recommends,
   and it's what lets them reset a lost upload key.
3. **App bundles:** **Upload** and pick `android/app/release/app-release.aab`.
   It takes a minute to process. Warnings you can ignore on this game:
   - *"This App Bundle contains Java/Kotlin code, which might be obfuscated. We recommend you upload a deobfuscation file"*: the game doesn't shrink its code, so there's nothing to upload.
   - *"This App Bundle contains native code, and you've not uploaded debug symbols"*: from the ads and store libraries; harmless.
   - Play's large-screen and edge-to-edge checks (they flagged release 4,
     1.0.3) are answered in the app; see "Orientation and edge to edge" below.
   Errors you can't ignore:
   - *"Version code 1 has already been used"*: raise `versionCode` and build again.
   - *"Your APK or Android App Bundle was signed in debug mode"*: you built **debug**; build **release** with your `.jks`.
   - *"You uploaded an APK or Android App Bundle that is signed with a different key"*: you signed with a key other than the first upload's.
4. **Release details:**
   - **Release name:** filled in for you (`1 (1.0.0)`). Leave it.
   - **Release notes:** between the `<en-GB>` tags, e.g. `First test build.`
5. **Next**. Play checks the release and lists any **errors** (must fix) and
   **warnings** (can go ahead). A common one for a new app: *"You haven't
   finished setting up your app"*: internal testing is allowed anyway.
6. **Save and publish** (sometimes **Save**, then **Go to overview**, then
   **Send changes for review** / **Start rollout to Internal testing**). For
   internal testing it's live within minutes.

### 2c. Install it from Play
1. On your phone, open the **Join on the web** link (signed in as the tester Gmail).
2. **Accept invite**, then **Download it on Google Play**.
3. Install. If your Android Studio build is on the phone, **uninstall it first**:
   it's signed with the debug key, and Android won't install a differently
   signed copy over it.
4. If the Play page says the app isn't available, wait 10–30 minutes after
   the first rollout and try again.

---

### 2d. Orientation and edge to edge

Play warned on release 4 (1.0.3) about edge-to-edge, deprecated edge-to-edge
APIs, and the portrait lock on large screens. What the app does now:

- **Orientation:** no lock in the manifest. `MainActivity` holds phones
  upright (smallest width under 600dp) and lets tablets, unfolded foldables
  and Chromebooks turn freely; it checks again when a foldable folds or opens.
  In landscape the game plays in a centred portrait column.
- **Edge to edge:** `MainActivity` calls `EdgeToEdge.enable`, so the game draws
  under the status bar and the gesture bar on every Android version.
  Capacitor's SystemBars (`capacitor.config.ts`) hands the insets to the CSS,
  and `style.css` keeps everything clear of them (`--safe-*`). The bars' icons
  are set from the game (`src/systemBars.ts`): dark over a light sky, light
  over a night sky or a dark-mode panel.
- **Deprecated APIs:** none in the game's own code or resources. If Play still
  lists calls such as `setStatusBarColor` or `LAYOUT_IN_DISPLAY_CUTOUT_MODE_*`,
  its warning names the class: `androidx.activity` (EdgeToEdge, only on older
  Android versions), the AdMob SDK or another library. Those can only be fixed
  by updating the library; the warning doesn't block a release.

After a change here: a higher `versionCode`, and a look on a tablet emulator in
both orientations and on a real phone (nothing under the status bar or the
gesture bar).

## 3. App signing and the Google sign-in fingerprints

Builds installed **from Play** are signed with Google's key, not yours, so
Google sign-in needs that key's fingerprint registered, or it fails with
`[28444] Developer console is not set up correctly` on Play installs only.

1. **Test and release > Setup > App integrity**, then the **App signing** tab
   (or **Play app signing > Settings**).
2. Two certificates are listed:
   - **App signing key certificate**: Google's. Copy its **SHA-1 certificate fingerprint**.
   - **Upload key certificate**: your `.jks`. Copy its SHA-1 too (it saves you the keytool step).
3. In [Google Cloud](https://console.cloud.google.com) > **Google Auth Platform >
   Clients > Create client > Android**, make one client per fingerprint:
   - `Android Play signing`: package `com.tomblack.endlessspace`, the app signing SHA-1.
   - `Android upload`: same package, the upload SHA-1.
   You then have three Android clients (debug, upload, Play signing) and one Web
   client. None of the Android client ids go in the code.
4. Changes can take a while to reach phones. Test "keep it with google" on the
   Play-installed build after that.

---

## 4. App content (the policy forms)

Left menu: **Policy and programs > App content** (also linked from the
Dashboard). Each section has **Start** (or **Manage**). All of these must be
done before the closed test can be sent for review.

### 4a. Privacy policy
- **Privacy policy URL:** `https://tomblack9452.github.io/endless/privacy.html`
- **Save**. The page must be public and load without signing in (it does).

### 4b. App access
"Is all or some functionality in your app restricted?"
- **All functionality in my app is available without any access restrictions.**
  (No login is needed: the account is made automatically; Google sign-in is optional.)
- **Save**.

### 4c. Ads
"Does your app contain ads?"
- **Yes, my app contains ads.** Rewarded ads count, even though they're
  optional. Answering no while AdMob is in the build gets the app rejected.
- **Save**. The listing will show "Contains ads".

### 4d. Content rating
This is the IARC questionnaire; it produces the age ratings for every country
(PEGI in the UK/EU, ESRB in the US...).

1. **Start questionnaire**.
2. **Email address:** `tomblackdev@proton.me` (the rating certificate is sent here).
3. **Category:** **Game** ("Games: ...").
4. Questions (the wording changes a little; answer in this spirit):
   - **Violence:** No. The ship crashes into rocks and walls; there are no characters harmed, no weapons, no blood.
   - **Fear / horror:** No.
   - **Sexuality / nudity:** No.
   - **Language (swearing):** No. Pilot names are filtered for swearing.
   - **Controlled substances (drugs, alcohol, tobacco):** No.
   - **Crude humour:** No.
   - **Gambling:** No. **Simulated gambling:** No. The shop sells named items for a set price; nothing is random for money.
   - **"Does the app allow users to interact or exchange content?"**: **Yes.** Players' chosen names show on public leaderboards, and tapping a pilot shows their ship and service record (rank, XP, runs, time played, distance, bests). If asked for detail: no chat, no messaging, no photos; names are checked against a word list.
   - **"Does the app share the user's current physical location with other users?"**: No.
   - **"Does the app allow users to purchase digital goods?"**: **Yes.**
   - **"Is the app a web browser or search engine?"**: No.
5. **Save > Next** shows the calculated ratings (expect **PEGI 3 / Everyone**,
   with the notes *In-app purchases* and *Users interact*). **Submit** / **Apply rating**.

### 4e. Target audience and content
1. **Target age:** tick **13–15**, **16–17** and **18 and over**. Don't tick
   anything under 13. Choosing under-13s puts the game under Google's Families
   policy: only certified ad networks with child-safe settings, extra review,
   no personalised ads. The game isn't built for that.
2. **"Could your store listing unintentionally appeal to children?"** **No.** (A
   minimalist space game with no cartoon characters. If Google disagrees they
   ask you to change the listing; it isn't a strike.)
3. **Next > Save**.

### 4f. Data safety
What the game collects, for the "Data safety" box on the store page. It must
match what the app and its libraries actually do; Google checks.

**Overview: Data collection and security**
- **Does your app collect or share any of the required user data types?** **Yes.**
- **Is all of the user data collected by your app encrypted in transit?** **Yes** (everything goes over HTTPS).
- **Which of the following methods of account creation does your app support?**
  - Tick **OAuth** (Sign in with Google).
  - If there's an option like "Other", the automatic anonymous account fits it; if you can only pick from a fixed list, OAuth is enough.
- **Delete account URL:** `https://tomblack9452.github.io/endless/support.html`
  (it explains deleting in the game, settings > delete my account and data, or by email). Google requires a web address for this whenever an app has accounts.
- **Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account?** **No.**

**Data types.** Tick these, and for each one answer the follow-up questions:

| Data type | Collected | Shared | Processed ephemerally | Required or optional | Purposes |
|---|---|---|---|---|---|
| Personal info > **Email address** | Yes | No | No | **Optional** (only with Google sign-in) | Account management |
| Personal info > **User IDs** | Yes | No | No | Required | App functionality, Account management |
| Financial info > **Purchase history** | Yes | No | No | Required | App functionality |
| App activity > **App interactions** | Yes | No | No | Required | App functionality |
| App activity > **Other user-generated content** (the pilot name) | Yes | No | No | Required | App functionality |
| Device or other IDs | Yes | **Yes** (AdMob) | No | Required | Advertising or marketing |
| Location > **Approximate location** | Yes | Yes (AdMob, from the IP address) | No | Required | Advertising or marketing |
| App info and performance > **Crash logs**, **Diagnostics** | Yes | Yes (AdMob) | No | Required | Advertising or marketing, Analytics |

Notes:
- The pilot name, ship and service record summary (rank, XP, runs, time
  played, distance, furthest level, chains, near misses, pickups and bests)
  are shown to other players on the leaderboards. Check the form's own
  wording for data other users can see when you fill it in.
- "Shared" means sent to a **third party for its own use**. Supabase and
  RevenueCat work for you (service providers), so what goes to them isn't
  "shared". AdMob uses data for Google's advertising, so it is.
- The AdMob rows come from the SDK, not the game. Google's page **"Prepare your
  Data safety section for Google Play" in the AdMob help** lists exactly what
  the Mobile Ads SDK collects; if it differs from the table, follow that page.
- **Next** through to the preview of the store's Data safety box, then **Save**.

### 4g. Advertising ID
"Does your app use advertising ID?"
- **Yes.** The AdMob SDK adds the `AD_ID` permission to the app automatically.
- **Purpose:** **Advertising or marketing** (tick also **Analytics** if offered and you want to match the table above).
- **Save**. Answering no while the permission is in the build blocks releases
  with *"This release includes the com.google.android.gms.permission.AD_ID permission but your declaration on Play Console says your app doesn't use advertising ID."*

### 4h. The rest (all "no")
- **Government apps:** No.
- **Financial features:** "My app doesn't provide any financial features."
- **Health apps:** "My app does not have any health features."
- **News apps:** No.
- **COVID-19 apps:** "My app is not a publicly available COVID-19 contact tracing or status app."
- **Data deletion** may also appear here as its own section: same URL as in 4f.
- **Photo and video permissions / Foreground service / Exact alarms / Full-screen intents:** won't appear; the game uses none of them.

---

## 5. Store listing and store settings

### 5a. Store settings
**Grow users > Store presence > Store settings**
- **App category:** Category **Game**, then **Arcade**.
- **Tags:** **Manage tags**, pick up to 5 that fit (e.g. Arcade, Racing, Casual, Single player, Space/Sci-fi if offered). They help Play show the game to the right people.
- **Store listing contact details:**
  - **Email:** `tomblackdev@proton.me` (shown publicly on the store).
  - **Phone:** leave empty.
  - **Website:** `https://tomblack9452.github.io/endless/`. **Important for AdMob later:** `app-ads.txt` must live at the root of this site's domain (see part 10).
- **External marketing:** leave on (lets Google advertise the game outside Play).
- **Save**.

### 5b. Main store listing
**Grow users > Store presence > Main store listing**

**App details**
- **App name:** `Endless Space`
- **Short description** (80 characters max):
  `A fast, calm space runner. A new ranked run every week.`
- **Full description** (4,000 max): the description in `docs/store.md`, section 6.
  Rules: no "best game", "#1", no prices or "free" claims, no other games'
  names, no keyword lists.

**Graphics**
- **App icon:** 512 × 512 PNG, up to 1 MB. Use the 512 icon from `public/icons/`.
  It must be square and full-bleed; Play rounds the corners itself.
- **Feature graphic:** **1024 × 500**, JPG or PNG with **no transparency**.
  It's the banner at the top of the store page and in some features. Keep the
  important part in the middle (it gets cropped on some screens). An idea: a
  screenshot of the ship flying through the canyon, with "Endless Space" in the
  game's font.
- **Phone screenshots:** 2 to 8, PNG or JPG, each side between 320 and 3,840 px,
  portrait 9:16. For a game to be eligible for featuring, at least **4 at
  1080 × 1920 or more**. Take them on your phone (power + volume down) from the
  test build; suggested order:
  1. a canyon run at speed, near-miss combo on screen
  2. the title screen
  3. inside the ship, the laser room
  4. the hangar with a dressed-up ship
  5. the leaderboard with ships by the names
  6. the asteroid belt or the volcanic plain
  Screenshots must show the real game; no device frames needed.
- **7-inch / 10-inch tablet screenshots:** optional. The game is phone-first,
  but it runs on tablets in either orientation (a centred play column), so
  these can be added later.
- **Video:** optional. A YouTube link (public or unlisted, ads off, no age
  restriction), landscape works best. Can be added later.
- **Save**.

---

## 6. Closed test: 12 testers for 14 days

### 6a. What Google requires
For personal developer accounts made after November 2023: before you can apply
for production, you must run a **closed test** with **at least 12 testers who
have opted in**, and they must stay opted in for **the last 14 days in a row**.
Testers leaving partway can reset the count, so invite more than 12 (15–20).

Who to ask: friends and family with Android phones and a Google account.
Testers must:
1. Use a Gmail / Google account you add to the list.
2. Open the join link and press **Become a tester**.
3. Install the game from Play, and keep it installed.
4. Ideally open it now and then over the two weeks; Google asks about
   engagement when you apply.

### 6b. Set up the track
1. **Test and release > Testing > Closed testing**. There's a default track
   named **Closed testing – Alpha**. Click **Manage track**.
2. **Countries / regions** tab: **Add countries / regions**: the **United
   Kingdom** and anywhere your testers live. A tester in a country not on
   the list can't install it.
3. **Testers** tab:
   - **Email lists:** **Create email list**, name `Closed testers`, add every
     tester's Google address (you can also paste a comma-separated list or upload
     a CSV). **Save**, tick it, **Save**.
     *Or* **Google Groups:** make a group at groups.google.com, add the email
     address of the group here, and let people join the group: handy if people
     come and go.
   - **Feedback URL or email address:** `tomblackdev@proton.me`.
   - **Copy link** under "Join on the web": this is what you send testers.
4. **Releases** tab (or the track's overview): **Create new release**.
   - **App bundles: Add from library**, pick the bundle you uploaded to internal
     testing (version code 1). The same build can go to several tracks; no new
     upload needed.
   - **Release notes:** e.g. `Thanks for testing! Fly a few runs, try the shop and the hangar, and tell me what's confusing.`
   - **Next > Save**.
5. **Publishing overview** (left menu): **Send changes for review**. The first
   closed-test release is reviewed: anywhere from a few hours to several days
   (up to a week isn't unusual for a new account). You get an email.
6. When it's approved, send the testers the join link.

### 6c. During the 14 days
- The **Dashboard** shows how many testers have opted in and how many days are
  left.
- You can **ship updates** to the closed test whenever you like (new bundle,
  higher versionCode, Create new release on the same track). The 14 days keep
  counting; updates are reviewed but usually faster.
- Testers can leave private feedback from the game's Play page; you'll see it
  under **Monitor and improve > Ratings and reviews > Testing feedback**.
- Keep a note of feedback and what you changed: you'll be asked about it.

---

## 7. Payments profile and license testers

These are **account-wide** settings: go back to **All apps** (top left), then
the left menu.

### 7a. Payments profile (so you can sell)
1. **Settings > Payments profile** (or **Set up a merchant account** if asked).
2. Create one (or link the one Google Pay already made for you):
   - **Account type:** Individual.
   - Your **name and address** (not shown publicly, but used for tax).
   - **Tax information:** the questionnaire for the US (W-8BEN as a UK person,
     which claims the UK–US treaty rate so less is withheld).
   - **Bank account** for payouts.
3. Until this is done, in-app products can't be made active.

### 7b. License testing (free test purchases)
1. **Settings > License testing**.
2. Add the Gmail addresses that will test purchases (yours, and any testers you
   trust to try the shop): an email list as before.
3. **License response:** `RESPOND_NORMALLY`.
4. **Save**. These accounts see purchases marked as tests ("Test card, always
   approves" and similar) and are never charged. Test purchases still go
   through RevenueCat and the webhook, so you can check cores arrive.

---

## 8. In-app products

**Monetize with Play > Products > One-time products** (in-app products). This
needs an uploaded build (part 2) and the payments profile (7a).

For each product, **Create one-time product**:
1. **Product ID**: exactly as below. It can **never** be changed or reused,
   even after deleting. Typos mean a new ID.
2. **Name** and **Description**: shown in Google's purchase sheet (name up to
   55 characters, description up to 200).
3. **Purchase option**: add one (Buy), with the **default price** in GBP.
   Play converts it to other currencies (you can adjust each country if you
   like). **Tax:** prices are tax-inclusive in the UK/EU.
4. **Save**, then **Activate**.

| Product ID | Name | Description | Price |
|---|---|---|---|
| `cores_100` | 100 cores | 100 cores to spend in the shop. | £0.99 |
| `cores_550` | 550 cores | 550 cores to spend in the shop. | £4.99 |
| `cores_1200` | 1,200 cores | 1,200 cores to spend in the shop. | £9.99 |
| `cores_2500` | 2,500 cores | 2,500 cores to spend in the shop. | £19.99 |
| `starter_pack` | Starter pack | 500 cores and the nova hull. Once per account. | £2.99 |
| `season_pass` | Season pass | The premium track of this season's pass. | £4.99 |
| `premium` | Premium | No ads, ad rewards without the ad, the halo hull, regalia paint, crown flame, an extra free revive a day and a board badge. | £4.99 |

- Play has no "consumable" switch: whether a product can be bought again is
  decided when it's **consumed**. In RevenueCat, set the cores and the season
  pass as **consumable**, the starter pack and premium as **non-consumable**.
- The IDs must match `CONFIG.economy.store.products` in `src/config.ts` and the
  webhook (`supabase/functions/revenuecat-webhook`). They already do for the
  table above.

---

## 9. Apply for production

When the Dashboard shows 12+ testers opted in for 14 days, **Apply for
production** appears on the Dashboard. The form has three parts; answer
plainly and specifically (Google rejects vague answers like "it went well"):

**About your closed test**
- *How did you recruit users?* e.g. "Friends, family and colleagues with
  Android phones, invited by email. 15 joined."
- *How easy was it to recruit testers?* Honest answer.
- *Describe the engagement you received from testers:* how often they played,
  e.g. "Most played several times a week; testers flew N runs between them,
  reached the canyon and the ship, and tried the shop and the hangar."
  (The Supabase `runs` table tells you how many runs were played.)
- *Summarise the feedback you received and how you collected it:* the main
  points, and that it came by email, in person, and through Play's testing
  feedback.

**About your app**
- *Who is the intended audience?* "Players 13 and over who like quick arcade
  runs; a new ranked course each week for players who like leaderboards."
- *Describe how your app provides value to users:* what's distinctive (weekly
  ranked run, leagues, hand-built ship interior, calm look).
- *How many installs do you expect in your first year?* A realistic range.

**Your production readiness**
- *What changes did you make based on the closed test?* List them (with the
  version codes if you like).
- *How did you decide your app is ready for production?* e.g. "Testers
  completed runs without crashes, all areas played through, purchases and
  restore tested with license testers, fixes for the reported issues shipped."

Submit. A reply usually takes up to about 7 days. If refused, the email says
why; the usual fix is a longer test or more detailed answers, then apply again.

---

## 10. The production release and launch day

### 10a. The live build
1. `.env`: everything filled in, and **`VITE_ADMOB_LIVE=1`**.
2. Raise `versionCode` (e.g. to whatever the last test build was, plus 1) and set
   `versionName` to `1.0.0`.
3. `npm run build`, `npx cap sync android`, Generate Signed App Bundle (release).
4. **Then take `VITE_ADMOB_LIVE=1` back out of `.env`**, so the builds you run
   on your own phone from now on show test ads.

### 10b. The release
1. **Test and release > Production**.
2. **Countries / regions** tab: **Add countries / regions**. All countries is
   fine (the game is in English; prices are converted). You can leave out ones
   you don't want.
3. **Create new release**: upload the live bundle, release notes
   (`First release.`), **Next > Save**.
4. **Managed publishing** (optional, in **Publishing overview**): turn it on if
   you want to choose the moment the game goes live after approval, rather than
   automatically.
5. **Publishing overview > Send changes for review**. Production reviews take
   from hours to a few days.
6. **Staged rollout** is offered (e.g. 20% of users first): for a new game with
   no users it makes no difference; 100% is fine.

### 10c. Launch day checklist
- **Google Cloud > Google Auth Platform > Audience > Publish app.** Until then,
  only your test users can use Google sign-in.
- **AdMob:**
  - **Apps > Endless Space > App settings > link to the store listing**, once
    the game is findable on Play (can take a day after release).
  - **app-ads.txt:** AdMob reads it from the root of the website in your
    listing: `https://tomblack9452.github.io/app-ads.txt` (not under
    `/endless/`). That root is served from a separate GitHub repository named
    exactly **`tomblack9452.github.io`**: create it, add a file `app-ads.txt`
    with the line AdMob gives you (**Apps > View all apps > app-ads.txt**), and
    turn on Pages for it (Settings > Pages > deploy from the main branch).
    AdMob checks it within a day or so.
- **Play Console > Monitor and improve > Android vitals:** watch for crashes
  and "app not responding" in the first days.
- Reply to early **reviews**; it helps.

---

## 11. Every update after that

1. Make the changes, then `npm run build`, `npx cap sync android`.
2. **Raise `versionCode`** in `android/app/build.gradle` (always), and `versionName` (usually).
3. Generate Signed App Bundle (release, your `.jks`). `VITE_ADMOB_LIVE=1` only for builds going to production.
4. Upload to **internal testing** first, check it on your phone, then **Promote
   release** to closed testing or production (the same bundle moves up; no new
   upload).
5. Web-only changes (anything in the game itself) also go live on GitHub Pages
   when they're merged; the app only gets them with a new bundle.

Google also requires apps to target a recent Android version: each August the
minimum target goes up by one. Since 31 August 2026 new apps and updates must
target API 36 (Android 16); the project targets 36 (`android/variables.gradle`),
so it meets that. The next rise (API 37) is expected in August 2027; Play
Console warns you months before it matters. On API 36, large screens (600 dp
and wider, e.g. tablets) ignore the portrait lock, so check the game on a
tablet emulator before a production release.

---

## 12. When something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| "Version code N has already been used" | Every upload needs a new number | Raise `versionCode`, rebuild |
| "Signed in debug mode" | You built debug | Build **release** with the `.jks` |
| "Signed with the wrong key" | Not your upload key | Use the same `.jks` as the first upload; if lost, App integrity > Request upload key reset |
| Release blocked: AD_ID permission | Advertising ID declaration says no | App content > Advertising ID: Yes |
| Rejected: Data safety mismatch | The form doesn't match what the app or an SDK collects | Check part 4f against the AdMob data disclosure page, resubmit |
| Rejected: "Missing privacy policy" or broken link | The URL didn't load | Check the privacy page opens in a private browser window |
| Testers: "App not available" | Their account isn't on the list, they haven't pressed Become a tester, or their country isn't on the track | Check all three |
| Google sign-in `[28444]` on the Play install only | Play's signing SHA-1 isn't registered | Part 3 |
| Purchases say "item unavailable" | Product not active, ID mismatch, or the install isn't from Play | Activate it, check the ID, install from the testing link |
| Rewarded ads never load (test build) | No ad unit id, or no network | `VITE_ADMOB_REWARDED_ANDROID` set before the build |
| Apply for production refused | Not enough testers/days, or thin answers | Keep the test going, write more specific answers, reapply |
