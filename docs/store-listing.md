# Store listing (Google Play)

The text for Play Console > Grow users > Store presence > Main store listing,
for 1.0.6. Every claim was checked against the code (the notes at the end say
what changed from the live text and why). Paste the text between the rules;
Play counts every character, line breaks included.

## Short description

80 characters at most. This one is 78:

---

One-thumb space runner: dodge, fly close, and top a new ranked run every week.

---

## Full description

4,000 characters at most. This one is about 3,000.

---

Steer a small ship through canyons, ice fields, volcanic plains, asteroid belts and the decks of a great ship, faster and faster. One thumb, one ship, and a course that never ends.

Endless Space is a calm, quick arcade space game: an endless runner (an endless flyer, really) that comes down to reflexes and nerve. Drag, tap or tilt to steer, slip past rocks by a hair, and see how far you get.

A NEW RANKED RUN EVERY WEEK
Every Monday brings a new ranked course, the same for every pilot. Fly it as often as you like; your best counts. Race the ghost of your best run this week, climb your league's weekly leaderboard, and move up seven leagues, from bronze to grand champion. Leagues group pilots by their ship's upgrades, so you always race ships like yours. Tap a pilot on a leaderboard to see their service record: rank, runs and bests.

SIX PLACES TO FLY
Alien open ground, deep canyons, frozen ice fields, burning volcanic plains, asteroid belts, and the cargo bays, server halls and reactor rooms inside a great ship. Day turns to night as you fly, meteor showers and sandstorms roll in, and the music is made as you play, speeding up with you.

SET LEVELS
Nine hand-built levels with a finish line, from first light to core breach. Each has three stars to win: finish it, fly it without a hit, and beat its score target.

FLY CLOSE
Near misses score more, and chaining them scores more still, up to ten times. Grab the glowing pickups to fill your boost, hold to go faster, and catch power-ups: a shield, a magnet and slow-mo. There is always a way through, so every crash is one you can learn from. Crashed? One revive a day is free.

MAKE IT YOURS
Over 160 looks for your ship: hulls, paints, markings, fins, engine colours, wing decals and flames, with new looks every season. Drag to spin your ship round in the hangar and the shop to see it from every side. Upgrade your thrusters, deflector, tractor beam and more with the credits you earn by flying.

SOMETHING EVERY DAY
A login calendar, three daily goals and five weekly ones, 53 achievements, a daily shop of looks, and a six-week season pass with a free track. Earn your way up 35 ranks, from recruit to general.

PLAY YOUR WAY
- One-hand play: drag, tap the sides, or tilt your phone, with adjustable sensitivity
- Boost with a button on the left, right or middle, or double-tap and hold anywhere
- Reduce motion, larger text, high contrast, dark mode, and an assist mode that slows the game and marks a safe line
- A hands-on tutorial (try each way to steer, then a practice run that shows every pickup and power-up) and short tips on your first runs, all skippable and replayable
- Plays offline; leaderboards need a connection
- Made for phones and tablets: on a tablet, play upright or on its side
- Keep your progress with Google sign-in, and take it to a new phone

Contains optional rewarded ads and in-app purchases.

Questions, bugs or ideas? Write to tomblackdev@proton.me, or tap "send feedback" in the game's settings.

---

## Tags

Play Console > Store settings > Tags (up to five; pick from Play's own list,
where these names may differ slightly):

1. Arcade
2. Endless runner
3. Space
4. Flying
5. Racing
6. Single player
7. Offline
8. Stylized

The first five are the best fit.

## Release notes for 1.0.7

<en-GB>
Quick retry: turn it on in settings and one tap after a crash flies again. Report a pilot from their card on the leaderboards. Fairer ranked: the server now checks which league a run belongs to. New season looks arrive on time, whatever your phone's clock says. A short "what's new" card after each update. Plus fixes, and error reports to help find the next ones.
</en-GB>

## Release notes for 1.0.6

> A new tutorial: pick how you steer from cards that show each way in motion, then a practice run with an indicator for every lesson and a card for each pickup and power-up, with its real numbers. Afterwards, switch controls and try them for 15 seconds. Pickups & power-ups is now in settings > help.

## Release notes for 1.0.5

> Send feedback from settings or the pause screen, a check before back closes the game, and short tips on your first runs. Plus fixes: no sound in the background, and Escape works like back.

## Screenshots

In `docs/store-assets/screenshots/`, for Play Console > Main store listing >
Graphics. All real captures of the game (Chromium, the dev build), with a
caption in the game's own type (Host Grotesk and Geist Mono) and colours, on its
paper background; no device frames.

| File | Size | Caption | What it shows |
|---|---|---|---|
| `phone-01.png` | 1080 × 1920 | one thumb. endless sky. | open ground, level 3, the forest path |
| `phone-02.png` | 1080 × 1920 | six places to fly | the ship's open deck, level 8 |
| `phone-03.png` | 1080 × 1920 | a new ranked run every week | the title screen, with this week's ranked best |
| `phone-04.png` | 1080 × 1920 | 160+ looks for your ship | the hangar, paints |
| `phone-05.png` | 1080 × 1920 | something new every day | goals: the login calendar and today's goals |
| `phone-06.png` | 1080 × 1920 | climb the ranks | the service record |
| `tablet-01.png` | 1920 × 1080 | six places to fly | the ice field, level 11, on a tablet held sideways |
| `tablet-02.png` | 1920 × 1080 | 160+ looks for your ship | the hangar on a tablet held sideways |

How they were made: a fresh save with the dev panel's "unlock all" (every
look, the top rank and league), the phantom hull in the aurora paint, three
ranked runs flown by the dev autopilot (the best this week, the runs on the
record), and runs started with the dev panel's "start just before level N".
The fps counter and dev link are hidden. The boards need the live server, so
no leaderboard is shown and no other pilots appear anywhere.

## What was checked, and what changed

| Claim | In the code | Wording used |
|---|---|---|
| Six places to fly | `ENVIRONMENTS` in `src/world/courses.ts`: open ground, canyon, ship interior, ice field, asteroid belt, volcanic plain | six, named |
| Ghost of your best run | Ranked only, and it's the best run **this week** (`ghost.ts`, the "ghost of your weekly best" setting) | "race the ghost of your best run this week" (it was "your best run") |
| Seven leagues | `LEAGUES` in `src/progression/leagues.ts`: bronze to grand champion | true |
| Over 160 looks | 164 hand-made (168 in `LOOKS` with season 1's four), plus each season's | "over 160 looks" |
| 35 ranks | `RANKS` in `src/progression/ranks.ts`, recruit to general grade 4 | true |
| Set levels | `COURSES`: nine, three stars each | true |
| 53 achievements, 5 weekly goals, 3 daily goals | `ACHIEVEMENTS`, `CONFIG.economy` | true |
| Chains up to ten times | `CONFIG.nearMiss.maxCombo` | true |
| A way through | Every course is built round a safe lane (`docs/game.md`, "How it plays") | "there is always a way through" |
| One free revive a day | `daily.freeRevivesLeft` (two with premium), outside ranked | "one revive a day is free" |
| Drag to spin your ship | `.showroom-spin` over the hangar, shop and welcome | hangar and shop |
| Tap a pilot for their record | `pilot_record` (migration 0013), on the boards when online | true |
| Tablets | `MainActivity` only holds phones upright; landscape plays in a centred column, and tilt reads the side-on lean | true |
| Offline | The whole game runs on the device; the boards, sign-in, ads and purchases need the server | "plays offline; leaderboards need a connection" |
| Accessibility | reduce motion, text size (three), high contrast, dark mode, assist mode, tap-sides steering, boost button position, vibration off | listed as they are. There is no colour-blind mode or screen-reader support in a run, so neither is claimed |
| Ads | Rewarded only; interstitials are off (`CONFIG.ads.interstitial`) | "optional rewarded ads" |
| "Free" | Play's rules (`docs/play-console.md`) rule out "free" as a selling point | only the free daily revive, which is a feature; no "free to play" |
| Tutorial | `src/ui/onboarding.ts`: control cards with moving diagrams, a six-lesson practice run with a card for the boost pickup, shield, magnet and slow-mo, a 15 s trial of other controls; skip and replay in settings | "a hands-on tutorial", as listed |
| Upgrades | thrusters, capacitor, tractor beam, deflector, stabilisers, scanner | named ones that exist ("shield" isn't one: it's the deflector) |

Keywords worked in, once each where they fit: space game, arcade, endless
runner, endless flyer, race, reflexes, one thumb / one-hand, offline,
leaderboard, ship looks (customisation).
