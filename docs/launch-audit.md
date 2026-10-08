# Launch audit

> The first pass below is **historical** (before the Android build, Google
> sign-in and the store page). The second, at the end, is the current one.

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
    changes the privacy policy. Easy to add later.
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
- Shop prices, pass tiers and goals add up as in `docs/design.md`.
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

**Open** (needs a decision or more work):

- A refunded season pass keeps its premium track and the rewards it paid.
- The ranked board trusts the league the game sends (leagues live on the
  device), so a run can be sent to a lower league's board.
- The season looks in the catalogue are fixed at start-up by the phone's clock;
  a phone set weeks behind misses a new season's looks until it restarts.
