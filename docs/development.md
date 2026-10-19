# Development

For working on the code: what every file does, where the numbers live, the
dev tools, the tests and the deploy. Getting started (install, the dev server,
the scripts) is in the [README](../README.md#running-it).

## Contents

- [File table](#file-table)
- [Tuning](#tuning)
- [Dev tools](#dev-tools)
- [Testing](#testing)
- [Deploying](#deploying)

## File table

The folder map is in the [README](../README.md#project-layout). File by file:

| File | What it does |
|---|---|
| `src/main.ts` | Entry point: fonts and styles, blocks browser gestures, starts the game (and the dev panel in dev) |
| `src/core/config.ts` | Every tunable value |
| `src/core/dev.ts` | Dev-only panel |
| `src/core/game.ts` | State machine, main loop, scoring, boost, power-ups, menus |
| `src/core/rng.ts` | Seeded random numbers (mulberry32): `rand()`, and `featureRand()`, a second stream from the same seed for risk lanes and gate runs |
| `src/core/runBonus.ts` | Distance milestones and gate run bookkeeping (when one is ahead, clean or spoilt) |
| `src/core/crashMoment.ts` | The crash moment: when it plays, its slowed clock, and when the revive offer or end screen may come |
| `src/core/retry.ts` | When a tap after a crash flies again (the retry lock, quick retry) |
| `src/core/settings.ts` | Settings table and storage |
| `src/core/storage.ts` | The async key/value store every save goes through |
| `src/world/atmosphere.ts` | Day/night and theme colour blending |
| `src/world/biomes.ts` | Biome looks and names |
| `src/world/blockTextures.ts` | Procedural metal textures |
| `src/world/courses.ts` | The set levels, the solo environments, the week's ranked run and the day's challenge course |
| `src/world/difficulty.ts` | Difficulty as smooth, capped functions of score |
| `src/world/events.ts` | Meteor shower, sandstorm, red alert |
| `src/world/field.ts` | Instanced pool: collision, sine and ramp motion |
| `src/world/fx.ts` | Animated interior detail: liquids, steam, blinkers, holograms, sparks |
| `src/world/itemColours.ts` | Colour-blind mode's palette (blue against orange) and the power-ups' shapes |
| `src/world/interior.ts` | Ship room looks (name, light, height, windows, decor) and the room API sections build with |
| `src/world/palette.ts` | Live palette shared by every material |
| `src/world/pieces/` | The hand-made ship sections: format and checks, the grid builder, and the pack by family |
| `src/world/props.ts` | Low-poly trees, rocks, crystals, shuttles, pipes, gems |
| `src/world/renderer.ts` | Renderer, camera, ground, planet, adaptive resolution |
| `src/world/sky.ts` | Stars, galaxy, shooting stars |
| `src/world/speedLines.ts` | Boost streaks |
| `src/world/terrain.ts` | Hills, ramps, split heights and chasms (JS and GLSL) |
| `src/world/weather.ts` | Snow and ash: particles, fog and tint |
| `src/world/world.ts` | Pools, theme generators, safe lane, pits, rooms, the power-up pool (`pickPower`), risk lanes and gate runs |
| `src/ship/catalogue.ts` | Every hand-made look, how to get each, the sets and the vault (plus the season looks) |
| `src/ship/decals.ts` | Wing decal pictures |
| `src/ship/ghost.ts` | The ghost of your weekly best, and a rival's (`rivalGhost`: times rebuilt for a path from the server) |
| `src/ship/hangar.ts`, `src/ui/hangarView.ts` | The hangar's model and its screen (looks and the upgrades chip) |
| `src/ship/looks.ts` | What you own and what's on; how an unlock reads |
| `src/ship/player.ts` | Ship shapes, shield, banking, crash and fall |
| `src/ship/portrait.ts`, `src/ship/showroom.ts` | Other pilots' ships drawn for the leaderboard; the showroom camera's spin and drag |
| `src/ship/trail.ts` | Ship trails |
| `src/ship/upgrades.ts` | Ship upgrade systems, points and the standard ship |
| `src/progression/challenge.ts` | The daily challenge on the device: today's best, the streak and its reward ladder |
| `src/progression/achievements.ts`, `src/progression/goals.ts` | The 53 goals (counted from existing stats) and which have paid |
| `src/progression/leagues.ts` | Leagues, divisions, league points, weekly rewards, emblems |
| `src/progression/legacy.ts` | Carries older saves' mission unlocks over to the looks (missions were removed) |
| `src/progression/progress.ts` | Stats, set level results, weekly, endless and environment bests |
| `src/progression/ranks.ts` | Rank ladder, XP, run credits, insignia, ranked history |
| `src/progression/reveal.ts` | What new players see, in stages |
| `src/progression/season.ts`, `src/ship/seasonLooks.ts` | Season timing, and each season's generated looks |
| `src/progression/unlocks.ts` | What opens solo environments and how far off it is |
| `src/progression/wallet.ts` | Credits and cores |
| `src/economy/` | Daily rewards and goals, weekly goals, the shop (today, the weekly set, the vault), the season pass, and their screens |
| `src/ui/goalsView.ts` | The goals screen: daily, weekly and achievements, with claiming |
| `src/ui/guide.ts`, `src/ui/controlArt.ts`, `src/ui/tutorialView.ts` | The pickup and power-up cards (from `CONFIG`), the control diagrams, the tutorial's indicators and recap |
| `src/ui/hints.ts` | The first-run tips (walkthrough) |
| `src/ui/runSummary.ts` | The end screen's details: the speed line, where the run ended, near misses, best chain |
| `src/ui/report.ts`, `src/ui/whatsNew.ts` | The report link on a pilot's card; the "what's new" lines for each version |
| `src/ui/onboarding.ts` | First launch: the steps, the control cards, the practice run's lessons, the starter set |
| `src/ui/scrollHint.ts`, `src/ui/systemBars.ts` | The always-visible scroll bar under sideways rows; Android's status and gesture bar icon colours per screen |
| `src/ui/ui.ts`, `src/ui/style.css`, `index.html` | HUD and screens |
| `src/platform/account.ts` | Keeping an account: Google sign-in and linking it to the anonymous player |
| `src/platform/exit.ts`, `src/platform/feedback.ts` | Android back on the title screen (ask before closing); the feedback mail |
| `src/platform/errors.ts` | Error reports: caught on the device, scrubbed, kept and sent a batch at a time (`log_errors`) |
| `src/platform/input.ts` | Drag, side taps, tilt, keyboard, boost control |
| `src/platform/haptics.ts` | Vibration at the strength the settings pick (off, light, full) |
| `src/platform/nameFilter.ts`, `src/platform/nameWords.json` | The pilot-name profanity check and its word list (`npm run names:build`) |
| `src/platform/share.ts` | The share card: a picture of a new best with your ship, in the store art's dusk; in the app written to the cache and shared with `@capacitor/share` |
| `src/platform/reminders.ts` | Reminders: local notifications, planned a week ahead, once a day at most (`@capacitor/local-notifications`) |
| `src/audio/` | Sound engine, synth helpers, generative music |
| `src/server/` | The server behind one interface: Supabase, or the device alone; cloud save, the run outbox (a daily run that waited past midnight is dropped), the leaderboard boards, and whether the server can be reached (the offline marker) |
| `src/store/` | In-app purchases (RevenueCat in the apps, nothing on the web) and what's owned for good |
| `src/ads/` | Ads (AdMob in the apps, nothing on the web) and their rules |
| `tests/fairness.test.ts` | Headless survivability test |
| `tests/pieces.test.ts`, `tests/pieces-pairs.test.ts` | Every ship section on paper, every route flown, every pair back to back |
| `tests/determinism.test.ts` | No unseeded randomness or clock in course generation; risk lanes and gate runs the same however a run is flown |
| `tests/depth.test.ts` | 1.0.9: the power-up weights, the second random stream, milestones, gate run bookkeeping, the crash moment's timing, the run summary, the rival's ghost |
| `tests/share.test.ts` | Sharing from the app: the cache file and the share sheet with the Play link |
| `tests/economy.test.ts` | The calendar, quests, the shop, the pass and the revive |
| `tests/server.test.ts` | Offline fallback and the store webhook |
| `tests/clock.test.ts` | The trusted clock: the server's time, the Date header, the device's offline; whether the server can be reached |
| `tests/account.test.ts`, `tests/session.test.ts` | Keeping an account with Google; signing in again without losing the player, and the cloud save never pushed before it's compared |
| `tests/sql.test.ts`, `tests/leaderboard.test.ts` | The database run for real (PGlite): checks (with room for double points), boards (the daily one too), names, reports (trusted reporters), error reports (and their upkeep), ghost rivals (`rival_path`), row security, and the game's server code against it |
| `tests/collisions.test.ts` | Every solid pool checked against its mesh across every area |
| `tests/unlocks.test.ts` | Solo environment unlocks |
| `tests/ranks.test.ts` | Rank ladder, XP and credit maths |
| `tests/courses.test.ts` | Set levels fly to the finish; twelve weeks of ranked runs and every environment are survivable; three weeks of daily challenges fly to their finish; the course depends only on its seed |
| `tests/challenge.test.ts` | The daily challenge: the day's seed by the trusted clock, the streak across midnight and missed days, the ladder, the board |
| `tests/settings.test.ts` | Older saves' settings get the defaults (vibration on/off carried over), the comfort settings, colour-blind mode's palette |
| `tests/reminders.test.ts` | Reminders: once a day at most, a week ahead, at the chosen time, the Monday one |
| `tests/input.test.ts` | Double-tap and hold to boost |
| `tests/leagues.test.ts` | League brackets, LP, divisions, promotion, weekly rewards, prices |
| `public/` | Icons, manifest, service worker |
| `supabase/` | Database migrations, `setup.sql` (all of them in one file), `parts/` (the same in small pieces to paste; made by `npm run db:setup`, not committed) and the store webhook |
| `docs/` | The guides: [docs/README.md](README.md) lists them |

## Tuning

Nearly every number lives in `src/core/config.ts`, grouped by system:

- `speed` and `score`: pace, level length, near-miss rules
- `field`: spawn depth and pool sizes
- `themes`: lane rules, open ground, canyon (ramps, chasms, bridges,
  upper and lower routes), every interior room and the ship's ramps
- `boost` and `powers`: pickups and power-ups (phase, double points and the
  pool's `weights`)
- `risk`, `gateRuns`, `milestones`: risk lanes, gate runs (endless) and the
  distance milestones; `zen`, `crashMoment` and `summary`: zen's speed cap
  and fade, the crash moment's length and slow-down, the end screen's speed
  samples
- `events`, `biomes`, `terrain`: weather, biome looks, hills
- `assist`: assist mode
- `courses`: credits per set level star (rank, upgrade and look tables live in
  `ranks.ts`, `upgrades.ts` and `looks.ts`)
- `daily`: the daily challenge's length, difficulty, the seconds a run needs
  to keep the streak, and the streak's reward ladder (keep its cores within
  `earn_cores`' 3 a day, and the length within `check_run`'s, `0019`)
- `audio`: every gain, the music and the engine
- `hazards`, `weather`: ice and lava lakes, lava bombs, snow and ash
- `economy`: run credits, revives, the login calendar, quests, the shop, the
  pass and the store's products
- `render`: pixel ratio, adaptive-resolution thresholds and performance mode

After changing anything in `themes`, run `npm test`.

## Dev tools

`npm run dev` adds a `dev` link (top left of the title and end screens)
that opens a panel. It isn't in production builds.

- **Start just before** any level from 1 to 12
- **Invincible**, **full boost** and **autopilot** (flies the safe lane, as
  the tests do) toggles
- **Replay seed:** replays the last run's course from where it started
- **Ship room:** forces every interior room to one family
- **Section:** forces one hand-made ship section wherever it fits
- **Show routes:** draws each section's routes on the floor (main white,
  alternative teal, risky amber)
- **Add 500 cores:** a stand-in for purchases
- From the console: `game.backend.online = true; game.backend.reachable = false`
  shows the offline marker and the boards' offline message without a server
- **Unlock all:** the same as maxing out a player ([server.md](server.md#supabase-settings)): the top rank and
  league, every look, every upgrade, every solo environment and set level,
  and 100,000 credits (saved in that browser)
- **Reset all progress:** clears everything but settings
- an FPS readout with the pixel ratio and draw calls

The store has a free "+500" and a premium on/off toggle in dev. `window.game` is
exposed in dev for poking at state from the console.

## Testing

`npm test` runs `tests/fairness.test.ts` headlessly with Vitest. For 8
seeds, an autopilot follows the recorded safe lane from the start of every
theme across the first two and a half loops. That covers every biome. It
steers at the normal limit with no boost, and any crash or fall fails the
test. A guard test checks that a ship that never steers does crash, so the
harness can't pass by accident. A second pilot takes the other way at every
fork, both canyon splits (the upper or lower branch) and forked bridges over
chasms, looking well ahead as a player would; it also checks that splits and
chasms really happen. Every ship room is flown on its own, back to back, for
four seeds. Since 1.0.9 a pilot takes every **risk lane** on the plains
(levels 1, 2, 28, 29) and must get through and collect its pickups, and the
safe-lane pilot flies the **gate runs** of levels 2, 5, 11, 14, 20 and 23 for
every seed (checking enough gates stand). The practice run's risk lanes bring
no pickups.

`tests/courses.test.ts` flies every set level from start to finish at each
section's speed and checks each runs 100-260 seconds, flies twelve weeks of
ranked runs for 90 seconds each, every solo environment for 40 seconds on
three seeds, and three weeks of daily challenges to their finish line
(checking each is the same all day, new each day, 3,600 units and 45-90
seconds).

`tests/challenge.test.ts` checks the daily challenge's streak by the trusted
clock: it grows a day at a time, holds within a day, turns over at UTC
midnight to the millisecond, lapses after a missed day, pays the ladder once a
day, and gives nothing for a day before the last one played (a clock put
back). `tests/settings.test.ts` loads 1.0.7's settings and checks every
choice is kept and the new settings get their defaults.

`tests/input.test.ts` checks double-tap and hold: a quick double-tap boosts,
a slow one, a long press, a drag or taps on opposite sides don't, and the
ship still steers while boosting.

`tests/ranks.test.ts` checks the rank ladder, that ranks are reached on XP
alone, XP from every mode (doubled for the day's first three) and from goals,
and credit rates.

The pilots steer the way the ship really does: through its easing, sliding on
ice, and dying in lava or pits as a player would. Courses also have to be the
same however they're flown: one test flies a week's ranked run twice, once on
the lane, once weaving and boosting with a different upgrade, and checks the
lane matches row for row.

`tests/pieces.test.ts` checks every ship section on paper and flies each of
its routes slow and fast; `tests/pieces-pairs.test.ts` flies every pair of
sections back to back. `tests/determinism.test.ts` bans `Math.random`,
`Date.now` and `performance.now` from the generator files.
`tests/economy.test.ts` covers the login calendar, quests,
the shop, the pass, and that a revive leaves a clear lane.
`tests/looks.test.ts` checks the catalogue: every way to get a look is real,
every goal unlocks something, sets are buyable, old ids and prices are kept;
`tests/legacy.test.ts` that a save with mission unlocks keeps them.
`tests/seasons.test.ts` checks the season looks are the same every time, nine a
season, unique, clear of the hand-made colours, priced right, overridable, and
the pass's rewards from season 2.
`tests/shop.test.ts` covers the day's picks (no reshuffle on a purchase), the
weekly set's cycle and bundle price, and the vault's calendar.
`tests/hangar.test.ts` covers the cards and the buy or equip button for each kind
of unlock. `tests/ships.test.ts` checks every hull, marking, decal and flame can be
drawn and that no hull is wider than the ship's footprint allows.
`tests/server.test.ts` checks the game runs without a server and that the
server functions' numbers match the game's.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which runs the tests,
builds, and publishes `dist/` to GitHub Pages. Other branches run
`.github/workflows/test.yml` (typecheck and tests).

To turn Pages on: in the repo, open **Settings → Pages**, set **Source** to
**GitHub Actions**, then re-run the workflow.

