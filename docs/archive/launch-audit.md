# Launch audit

> **Historical (archived).** Four passes over the game before launch, up to
> 1.0.6 (14 October 2026); the first is from before the Android build, Google
> sign-in and the store page. The game as it is now is described in the
> [README](../../README.md) and [docs/game.md](../game.md).

A pass over the game before it goes on the stores: every screen played in a
browser at phone size (390x844, 375x667 with the largest text) and on a
desktop window, the code read for flow bugs, and the store rules checked.

Each item says what's wrong, where, and what the fix is. **Must** blocks the
launch, **should** is worth doing first, **nice** can wait.

**Status:** every must and should item is fixed and on main. Added on the
way: a pilot name box on the welcome screen and in settings, swapping cores
for credits in the shop, and the camera leaving the showroom when the
practice run starts.

## Must

1. **Leaving the practice run by the pause menu keeps you invincible.**
   `toMainMenu()` never clears the practice state, so the next real run
   can't crash and the tutorial box stays on screen. Fix: end practice on the
   way out, and go back to the welcome screen if onboarding isn't done.
2. **The boost lesson can't be finished on a first run.** The boost meter
   starts empty and needs filling before boost works, so the lesson waits.
   Fix: fill the meter when the boost lesson starts.
3. **Any lesson can stall.** If a player never does the thing (no pickup on
   their line, say), the practice run goes on forever. Fix: move on by
   itself after 20 seconds.
4. **Desktop players are offered tilt.** Tilt needs a phone. Fix: on a
   device without touch, choose drag and say the arrow keys work too.
5. **Account and data deletion.** Both stores now require a way to delete
   your account from inside the app. Fix: a settings row, with a
   confirmation, that deletes the server account (and with it the cloud
   save and leaderboard rows) and clears the device.
6. **Privacy policy and support pages.** Both stores need a privacy policy
   link and a support link, in the listing and in the app. Fix: two plain
   pages served with the game, linked from settings.
7. **Android back button.** On Android, back closes the app from any
   screen. Fix: back closes the open screen, pauses a run, and only leaves
   from the title.

## Should

8. **Locked features open from side doors.** A new player can tap the cores
   chip and land in the shop before it's revealed (also the rank badge and
   the record links). Fix: the same "opens after N runs" notice the bar
   buttons give.
9. **The ship stays on the title screen** after closing the pass when it was
   opened from the shop, and after the end of onboarding. Fix: hide the ship
   whenever the title screen comes back.
10. **Practice runs count.** They can unlock looks and show the in-run hints
    over the lesson box. Fix: practice never unlocks and shows no hints.
11. **"Beat par in ranked" goals before ranked opens.** A new player can be
    given a goal for a mode they don't have yet. Fix: until ranked opens, any
    run counts, and the goal says so.
12. **Swapping a daily goal needs an ad,** and on the web there are no ads,
    so the swap never shows. Fix: one free swap a day where there's no ad
    network.
13. **Bottom bar labels run into each other** with the largest text on a
    375 wide phone ("leaderboard", "service record"). Fix: let the labels
    wrap and shrink with the screen.
14. **The title screen doesn't scroll** in a short, wide window, so the play
    buttons can be cut off. Fix: let it scroll.
15. **"Replay the tutorial" is under "sound"** and its button is blank. Fix:
    its own "help" group with privacy, support and delete, labelled.

## Nice to have

16. Crash reporting (Sentry or similar). Left out: it needs an account and
    changes the privacy policy. Easy to add later. **Done in 1.0.7** without a
    new service: the game's own error reports (`client_errors`, `0018`), with
    the privacy policy updated.
17. Store screenshots and a short trailer. Something only you can make from
    a phone build.
18. A "rate the game" prompt after a good run. Better added once there are
    players.
19. Interstitial ads stay off. Rewarded ads only, as agreed.
20. Moving progress to a new phone. Done for Android: settings > keep it with
    google, and "played before? sign in with google" on a new phone's welcome
    screen. Sign in with Apple is still to come for iOS.

## Checked and fine

- A run to a crash, the game over screen, revive and retry.
- Settings save and come back after a reload.
- The fps counter and dev panel only show on the dev server.
- Running with no server (offline) and with a slow one.
- Shop prices, pass tiers and goals add up as in `docs/archive/design.md`.
- Ranked, weekly and solo seeds are the same for everyone.
- Restoring purchases is at the bottom of the store page (in the apps).
- No console errors apart from the browser blocking vibration before a tap.

## Second audit (8 October 2026)

Every system read against the README, the database run for real (PGlite), and
every screen opened at 360x640 and 427x952 in light and dark mode (dark mode
turned on in the game's settings).

**Fixed:**

- Back during the revive offer (or before it showed) left the run unrecorded:
  no stats, credits, best or board. Back now turns the offer down and shows
  the game-over screen; leaving to the menu settles the run first.
- A run quit from the pause menu counted for stats and credits but not for its
  best. It counts for both now.
- A league's weekly reward could be lost: a ranked run or a promotion in a new
  week rolled the week over without paying it. League weeks, the ranked week
  shown on the title and the weekly board read now follow the server's clock.
- A server error while renewing the session started a brand new anonymous
  account, leaving the player's server progress behind. Now only a refresh the
  server refuses for good does that; requests renew the session one at a time.
- The cloud save could be pushed before it was compared with the server's
  (a slow connection on start-up), overwriting a newer save from another phone,
  and a save that couldn't be read counted as "no save". Neither can happen now.
- The goals' all-done cores were named by today's date, not the goals' own day
  (wrong after midnight). Google sign-in's plugin is set up again after a
  failed start instead of failing for good.
- `0014`: purchases keep RevenueCat's purchase time (`store_purchase_at`), and
  `earn_cores` pays one reward at a time per player (two calls at once could
  both pay).
- `.gitignore` covers keystores, signing settings and `.env.*`.
- The season pass's premium column was too faint to read (light and dark), the
  pass card's line was cut off on a 360 wide phone, and a long set name was cut
  off in the shop.

**Open** (needs a decision or more work), all **closed in 1.0.7**:

- ~~A refunded season pass keeps its premium track and the rewards it paid.~~
  Closed: `0016` takes back the cores its premium tiers paid, and the game
  closes the track (a pass unlocked with cores is never touched).
- ~~The ranked board trusts the league the game sends (leagues live on the
  device), so a run can be sent to a lower league's board.~~ Closed: the
  server keeps each player's league (`0015`).
- ~~The season looks in the catalogue are fixed at start-up by the phone's clock;
  a phone set weeks behind misses a new season's looks until it restarts.~~
  Closed: they follow the server's clock once it's known.

## Third pass (1.0.5, 14 October 2026)

The bugs left from the second audit, and what the closed testers asked for.

**Fixed:**

- Going to the background only paused a run: on the title screen or a menu the
  music and engine kept playing. The sound now stops whenever the game is
  hidden, and comes back when it's in front again (a paused run stays quiet
  until it's resumed).
- Escape only closed settings or paused; now it does exactly what Android's
  back button does (`back()`), short of leaving the page.
- The pause button was a `<span>` that only answered a press. It's a button
  now for keyboards and screen readers (`role="button"`, `aria-label`,
  `tabindex`, click and Enter).

**Added (tester feedback):**

- **Send feedback** in settings and on the pause screen: a mail to
  tomblackdev@proton.me with the version and build, the device and Android
  version, and the screen it came from.
- **Ask before closing:** back on the title screen asks "close endless
  space?" in the app (a setting, on by default).
- **First-run tips:** a short, skippable walkthrough over the first runs
  (steering, obstacles, near misses and chains, pickups, power-ups and boost),
  with replay tips in settings.

## Fourth pass (1.0.6, 14 October 2026)

The tutorial, rebuilt from what testers said: the steering choice was three
plain words, and the practice run only said what to do in a line of text, so
the pickups and power-ups were still a mystery after it.

**Changed:**

- Choosing controls is a card for each way (drag, tap sides, tilt where the
  phone has it, keys on a computer), each with a small looping diagram, how it
  works and what it's good for. The diagrams stand still with reduce motion.
- The practice run has six lessons (the same six as the first-run tips), each
  with an indicator in the top or bottom band, progress dots and a skip. A
  lesson moves on when it's done, or after a gentle timeout.
- The practice course now brings a boost pickup, a shield, a magnet and a
  slow-mo, each with a card (icon, colour, and its real numbers from `CONFIG`)
  and a marker in the world; a missed one comes round again. The course
  itself is unchanged (the same random draws; a test checks it).
- After it: a recap of the pickups and power-ups (also settings > help >
  pickups & power-ups), then "how did that feel?", where another way to steer
  can be tried for 15 s, as often as wanted, before dressing the ship.

**Checked:** a save that finished onboarding never sees it again unless it's
replayed; skipping the tutorial keeps every first-run tip; skipping part way
keeps the tips for the lessons not reached; nothing in the practice run or a
trial counts (no stats, bests, boards or unlocks); the level banner and the
in-run tips stay out of the practice run. Tilt needs checking on a real phone.

## Fifth pass (1.0.7, 15 October 2026)

**Fixed** (the second audit's open items): leagues on the server (`0015`), a
refunded season pass takes back what it gave (`0016`), season looks follow
the trusted clock, and the store webhook checks its secret in constant time.

**Added:** reporting a pilot from their card on the boards, with a name reset
after three reporters and SQL snippets for the rest (`0017`); the game's own
error reports (`0018`); a "what's new" card after an update; quick retry (a
setting); and the title's ranked line wraps in two even lines on a 360 wide
phone.

## Sixth pass (1.0.11, 26 October 2026)

The first public release. A pass over everything added since 1.0.7 (server
leagues, refunds, reports, error logging, what's new, quick retry, the daily
challenge, reminders, share, offline, comfort settings, the new power-ups,
milestones, risk lanes, gate runs, zen, run details, the crash moment, the
rival's ghost and the graphics setting): the code read for flow bugs, the
database run for real (PGlite) with every function's grants listed, every
screen and dialog captured with Playwright at 360x640, 412x915 and 1280x800 in
light and dark mode (checked by eye, and by a script for sideways overflow,
clipped text and tap targets under 44 px), and the heap watched over ten
rounds of opening every screen and eight runs.

**Fixed:**

- **Cores spent or earned with no signal** (high): the wallet took the
  server's balance as soon as it could reach it again, so a look or revive
  bought offline was refunded (and kept), and a reward earned offline was
  lost. The same lost the day's login reward when it was claimed while
  start-up was still signing in (it was never sent). Cores changes now wait
  in a list on the phone and go to the server in order before its balance is
  taken (`wallet.ts`, `tests/wallet.test.ts`).
- **The outbox and the 8-second rate limit** (medium): a run turned away as
  "too quickly" (a short run with quick retry, or a backlog after a spell
  offline) waited for the next run to end, burning one of its 8 tries each
  time, and every later run's rank notice was lost behind it. It's sent again
  by itself 9 seconds later, without using a try, and its "#n on the board"
  notice shows then (off a run) (`tests/server.test.ts`).
- **A ranked run that waited past Monday** (medium) landed on the new week's
  board with last week's course. It's let go, as a daily run after midnight
  is (`tests/leaderboard.test.ts`).
- **Android back** (medium) acted on the screen under a card or question: on
  the what's-new card or a reward it asked to close the game; on the
  reminders offer it put "close endless space?" over it and lost the offer.
  Back now closes the card (one at a time), says no to the question, and
  cancels a report's reasons on a pilot's card.
- **The pilot name screen was a dead end** (medium) with no signal or no name
  in mind: it had no way out and came back after every run. It has **later**
  (and back), and asks again on the next start.
- **Reminders away from UTC** (low): "today's challenge is flown" skipped the
  phone's today, but in most time zones an evening reminder falls in the next
  game day, with a new challenge. It now skips only reminders in the game day
  that's done (`tests/reminders.test.ts`, run in Los Angeles time).
- **A date-dependent test** (low): the decal check read the hand-made art
  only, so it failed as soon as season 2's generated decal joined the
  catalogue (today). The game already drew it; the test now does too.
- **The end screen** said "solo: canyon opens at level 4" to a maxed-out
  player with everything open; "delete my account" could go back to "delete"
  while a slow delete was still going.
- **0023** (low, nothing changes for the game): `on_new_user()` could be called
  through the API (it refused, being a trigger function) and four functions
  had no `search_path` of their own, both flagged by Supabase's linter. A
  test now lists every function's grants: signed-out callers can run only
  `server_now` and two pure date helpers, and every function has its
  `search_path`. Another checks `delete_my_account` takes reports (both
  ways), error reports, the league and daily bests with it.

**UI:**

- A hit area of at least 44 x 44 round every smaller button (tabs, the wallet
  chips, small pills, claim and buy buttons, the shop's set tools, text links,
  pause), with no change to how they look; the name boxes are 44 tall.
- On a 360 x 640 phone the dress step's **ready** was half hidden under the
  sheet's edge; the pass's "unlock premium · 550 cores" wrapped to two lines.
- The service record's "xp a run" row was three lines of small print
  right-aligned; it's three rows now.
- Reduce motion: the promotion on the end screen fades in instead of popping,
  and the showroom's ship turns only when dragged.

**Added (small, from the list of ideas):**

- Spending 100 cores or more asks first ("spend 550 cores?"): the set, the
  vault, the pass, dearer looks and swaps. A revive never asks.
- The first look at the shop or the store says what credits and cores are
  and where each comes from.

**Checked and fine:** revive (free, ad, 50 cores, refused, back), the crash
moment never eating into the revive timer, rewards paid once (`recorded`,
the server's reward names), the daily run across UTC midnight (the run keeps
its day; the outbox drops its board entry), the league week paying out before
a run in a new week, restore, the double-credits ad (the offer comes back if
the ad doesn't pay), the gift and goal swap re-checking after the ad, pause
and resume in the countdown, settings migration from 1.0.7 and 1.0.9 saves,
colour-blind and left-handed modes in the HUD, guide and power-ups, no
listeners added twice (361 before and after ten rounds of screens and eight
runs), geometries steady (46 to 47) and textures at 2, and every security
definer function with its `search_path`. The heap grew by about 0.1 MB a run
in the dev build, with no growth in DOM nodes, listeners or GPU objects.

**Open** (not fixed; small):

- A cores spend whose answer was lost after the server took it (the signal
  dropping at exactly that moment) is sent again and charged twice. A
  fix: send each spend with an id and have `spend_cores` take each id once
  (a new migration). Fixed in 1.0.12: `0024_spend_once.sql`.
