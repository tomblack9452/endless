# Brief: the wreck, a key-gated environment of ship debris

Repo: `/home/user/endless`. Read `CLAUDE.md`, `docs/architecture.md`,
`docs/game.md` (above all "Themes and biomes": the asteroid belt, the canyon's
ramps, the volcanic hazards and the interior's sections), `docs/server.md`,
`docs/store.md` and `.claude/skills/android/SKILL.md` first, and follow their
rules (commits, branches, checks, migrations, comments, voice). Work on a
branch from `main` and commit in checkpoints that pass `npm run check`.

This is a big piece of work: build it in the phases at the end, and stop for
Tom to fly each phase's build before the next.

## The idea

A capital ship has just been torn apart in orbit. You launch from what's left
of its hangar, burst out through a hole blasted in its side, and dive down
through the wreckage while it's still exploding: hull plates tumbling,
girders spinning, fires venting, secondary blasts rippling along the
broken spine. At the bottom, the reactor goes, and you race out into clear
space.

It's the hardest place in the game, open only with a **key**, and it pays
rewards found nowhere else. Hard, but never unfair: every blast is readable
and the way through always exists.

**Inspiration: Halo's set pieces** (the Pillar of Autumn's escape, the
wrecked hulls over Installation 04, frigates breaking up). Take from them:
- the scale: hull sections the size of buildings, ribs and spars showing
  through the torn skin, a planet huge below;
- the chain reactions: blasts that ripple down a hull in sequence, fire that
  vents and then is snuffed out by vacuum, shockwave rings;
- the light: cold blue running lights and emergency strobes against hot
  orange fire, with long shafts of sunlight through the gaps;
- the escape at the end: everything coming apart behind you as you get out.

Use original designs only: no Halo ships, shapes, logos, names or sounds.

**Concept renders** (made in Three.js, in the game's low-poly style, so they
show what's buildable): `docs/art/wreck-breach.png` (the hangar wall blasted
open onto the debris field) and `docs/art/wreck-descent.png` (diving down the
broken spine, blasts rippling along the hull, the planet below). The final
art should be brighter and busier than these, at the same frame cost.

**Pillars**
1. **Spectacle.** The most dramatic thing in the game: always something
   exploding, falling or burning in view.
2. **Readable.** Every hazard is telegraphed and driven by distance, as the
   lava geysers and swaying asteroids already are, so where it will be is
   known at any speed. Explosions never cover the safe lane when you get there.
3. **Hard, not impossible.** A good player finishes in a few tries, and a new
   one sees the reactor within an expedition (three runs, see "Keys").
4. **Short and worth it.** One run is about two and a half minutes, ends at a
   finish line, and pays rewards.

## Where it sits in the game

- A seventh solo environment, **the wreck**, after the volcanic plain in the
  solo list (`ENVIRONMENTS` in `src/world/courses.ts`), shown from the start
  with a key icon and its relic progress ("3 of 8 relics"). It isn't part of
  the endless loop, ranked or the daily challenge.
- A run has a finish line, like the daily challenge (`CONFIG.daily.length` is
  the model): about **3,000 distance points in 4 sectors**, below.
- Its own seed for each season: the same course for everyone that season
  (fair for its board), new every season. Keep the generator deterministic
  (`tests/determinism.test.ts` must cover it).
- Upgrades work as in solo (no league cap); assist mode off.
- Its own board: "deepest wreck run" (distance, then time), off ranked.

## The run, sector by sector

### 1. The hangar (about 0–350)

You start inside the ship's main hangar bay (the interior's "hangar with
blast doors" family is the starting point; `src/world/pieces/`):
- red alert lighting and the klaxon from the first second (the interior's red
  alert event, always on here), smoke and sparks, small fires on the deck;
- wrecked fighters and loading gantries along the sides, cargo sliding loose,
  a gantry crane swinging (distance-driven, like the hooks);
- the bay's far wall has been **blasted open**: a huge jagged hole with torn
  plates bent outward, glowing hot edges, cables whipping, and air streaming
  out through it (particles pulled towards the hole);
- **the breach:** you fly out through the hole. The ship gets a little push
  forward, the sound muffles (inside to vacuum: the music filter opens, the
  klaxon cuts), the camera pulls back a touch, and the view opens up to the
  whole wreck below and the planet beyond. This is the money shot of the
  environment: give it a clear second with nothing to dodge.

### 2. The debris field (about 350–1,200)

Open space like the asteroid belt (the space sky, dust streaming past, no
floor to fall from), but everything is wreckage:
- **walls** of big hull sections instead of the belt's giant asteroids, held
  at the field's edges;
- **drifting debris:** hull plates (flat and wide: dodge round the edge),
  girders (long and thin, slowly spinning end over end), cargo containers,
  escape pods, turret mounts, engine cowlings. Built on the belt's drift
  fields and clusters, swaying as a function of distance;
- **fire vents:** gas venting from torn pipes in short bursts that flare and
  die, on a distance cycle (like the steam vents), one on the lane always off
  when you reach it;
- **first secondary explosions** off to the sides: pure spectacle, never on
  the lane, so players learn the look of the warning before it matters.

### 3. The descent (about 1,200–2,400)

The heart of the run: **diving down through the layers of the wreck**, with
big elevation changes along set paths.
- **Height:** the course has a height profile the ship follows, as the
  canyon's ramps do, but steeper and much larger: dives of 15–25 units, short
  climbs over debris, and flat stretches between. The ship and camera follow
  the path, nosing down hard on a dive. Each dive is announced: the path ahead
  visibly drops away with running lights along it.
- **Set paths:** where the way down is through a structure, the lane is
  framed so it reads:
  - **the spine:** down along the ship's broken keel, a long girder corridor
    with ribs passing overhead like a tunnel, and gaps where ribs have fallen
    in (weave between them);
  - **through a section:** short enclosed runs through a torn-open deck (a
    corridor piece from the interior pack, open to space at both ends);
  - **the drop chute:** a vertical gap between two massive hull sections,
    diving steeply with plates jutting from both sides (alternate left and
    right);
  - **splits:** the belt's upper and lower routes, here an outside route
    along the hull and an inside route through the deck, the riskier one with
    the bonus pickups and shards.
- **Explosions on the path** (see Hazards): blasts ripple along hull sections
  as you pass, debris thrown towards the lane with landing rings, a fuel tank
  that goes as you reach it with its gap opening just in time.

### 4. The reactor (about 2,400–3,000)

- The flagship's reactor core: a big glowing chamber, open to space,
  pulsing brighter as you near it; the music builds.
- **Chain blasts:** a line of explosions racing along a hull alongside you
  (same speed as you, never on the lane; the rumble and the light are the
  point).
- **Critical:** a white flash and a shockwave ring from behind, the screen
  shakes a little (respect reduce motion), and everything starts coming apart.
  The last stretch is an **escape**: wide and fast, debris falling across
  with clear telegraphs, and then you're out: clear space, the planet, quiet.
- **The finish line** is the edge of the blast. The run ends with the ship
  gliding out, then the end screen.

## Hazards (all distance-driven, all on the safe-lane rules)

The course keeps the game's **safe lane** (`docs/game.md`, "How it plays"):
always flyable at the current speed, drifting sideways at most at the slope
limit, and nothing ever covers it when the ship gets there.

| Hazard | What it does | Fairness rule |
|---|---|---|
| Drifting debris | Plates, girders, containers, pods swaying or tumbling | Moves by distance, not time; lane kept clear with room for how far it moves while you pass (the belt's rule) |
| Spinning girder | A long beam turning end over end across part of the path | Gap on the lane is open on arrival; never two in a row needing opposite moves |
| Fire vent | A jet of fire from a pipe, on a cycle | On the lane it's always off on arrival; a glow builds before each burst |
| Secondary explosion | A blast on a hull next to the path, then a cloud of debris | Never on the lane; a pulsing glow and a hiss at least 1.2 s ahead at top speed |
| Thrown debris | Burning chunks flung towards the path (like lava bombs) | A landing ring at least 1 s ahead at top speed; never lands on the lane |
| Fuel tank | A tank on or near the lane that bursts as you reach it | Its blast is over and its gap open when you arrive; a countdown flicker shows it |
| Collapsing rib | A rib of the spine falling across the corridor | Falls on a distance trigger; the lane is the gap it leaves |
| Shockwave ring | A ring from a big blast, sweeping past | Visual only: it never ends a run |

General rules:
- No hazard ends a run without its own warning (light, sound, or both), and
  colour-blind mode gets shapes for the warnings, as the power-ups do.
- At most one "must-react" warning at a time on the lane: the next can't
  start until the last has passed.
- Difficulty rises through the sectors, not with score: sector 1 is gentle,
  sector 3 the hardest, sector 4's escape fast but wide.
- Explosions use the shield like any hit (a shield saves you), except the
  reactor's shockwave, which is visual.

## Hard, not impossible: how to tune it

- **Speed:** a fixed band, starting around 55 and reaching about 72 by the
  reactor (under the game's 75 cap), whatever the player's level.
- **Fairness tests:** extend `tests/fairness.test.ts` with the wreck: the
  headless pilot must finish every season's seed (and 100 random ones) on the
  safe lane, at the top speed, with the slope and steering limits. The
  timing windows above go in the tests as numbers.
- **Targets to watch after release** (analytics, below): about a third of
  players finish on their first expedition, most within three expeditions.
  Tune with `CONFIG` numbers (density, warning time, dive steepness), never by
  changing the season's seed mid-season.
- **Deaths should feel earned:** the run summary says what hit you
  ("a spinning girder", "a fuel tank") and the crash moment shows it.

## Keys and expeditions

- **A key opens an expedition:** up to **3 runs within 24 hours**. A crash
  early on then costs a run, not the key. The HUD shows "run 2 of 3"; the end
  screen shows how many are left and when the expedition ends.
- **Revives** inside work as everywhere (free daily one, ad, or cores), and
  don't use up a run.
- **Getting keys:**

  | Way | Suggested |
  |---|---|
  | The first key | free, once, so everyone sees it |
  | Money | `wreck_key_1` £0.99, `wreck_key_3` £1.99 (new Play products, consumable) |
  | Cores | about a week of free play's cores (set from analytics: around 150) |
  | Pass | one key on the free track mid-season |
  | Goals | one key for finishing all the weekly goals, once a month |
  | Pilot's club | one key a month for members |

  Keep credits out of it: they're the everyday currency.
- **On the server**, like cores: a key balance per account, granted by the
  webhook (purchases) and by `earn`-style rules (pass, goals, club), and
  spent through a function that starts the expedition and records its
  24 hours. A new migration with its `MADE` marker and PGlite tests: a key
  spends once, an expedition can't be restarted for free, a resent webhook
  event grants once, the free first key only once.

## Rewards: earned by skill, not chance

- A **relic track** for the season: 8 looks found nowhere else (salvage
  themed: a scorched paint, a salvaged-plating hull, a plasma trail, a
  beacon decal, a reactor-glow engine and so on), always earned **in order**:
  no duplicates and no random drops.
- **Shards** at milestones along the run (the end of each sector, the reactor,
  the finish, and on the risky route's shards); every 3 shards earn the next
  relic. Finishing pays more than reaching the reactor.
- Paid entry with **random** rewards would be a loot box: Google Play then
  asks for published odds and some countries ban it. This design has no
  chance in it; keep it that way.
- Shards and relics are paid through the server's once-only rules (as
  `earn_cores` does), so a replayed or faked run can't farm them.
- A new relic track each season, the old one gone (owned looks are kept).

## Flow

1. **Solo list:** the wreck with a key icon, "3 of 8 relics", and "you have 2 keys".
2. **Its screen:** the scene behind (the wreck from space), the relic track
   (owned, next, the rest silhouetted), the board, and "use a key" or
   "get keys" (the store, at a new keys section; `view_store` source `wreck`).
3. **Expedition:** the hangar countdown, the run, the end screen with shards
   gained, progress to the next relic, runs left, and "fly again" (the next
   run of the expedition) or, when it's over, "come back with a key".
4. **Relic earned:** a celebration card with the look on the ship, and "put it on".

## Look and sound

- **Palette:** deep space blues and blacks, cold white-blue running lights,
  red emergency strobes, hot orange-white fire, the planet's blue-green glow
  below and the sun low and bright. Fog-free, so depth comes from scale and
  light. Its own entry in `src/world/atmosphere.ts`.
- **Wreckage:** built from boxes and simple shapes in the game's low-poly
  style, with the interior's block textures (`blockTextures.ts`: plates, ribs,
  hazard stripes) on the outsides, glowing torn edges on breaks, and running
  lights. Instanced, as the belt's rocks are.
- **Explosions:** a hot flash, an expanding fireball that cools from white to
  orange to dark smoke, debris flung outward, and a ring; in vacuum the
  fire snuffs out fast and the smoke hangs. Pooled and reused.
- **Sound:** muffled deep booms (vacuum), the hull groaning, the klaxon only
  in the hangar, a rising drone at the reactor, and its own music track
  (tense, building to the reactor; `src/audio/`).
- **Performance:** it must hold the asteroid belt's frame times on a
  mid-range phone (`docs/development.md`, "Measuring performance"). Cap
  explosions and particles on screen, and in low graphics: fewer particles,
  no light flashes, simpler debris. Measure before and after.
- Reduce motion: no screen shake, softer flashes. High contrast and
  colour-blind modes: warnings keep shapes as well as colours.

## Analytics

Add to `Events` in `src/platform/analytics.ts`:
`wreck_key_earned` (how), `wreck_key_bought`, `wreck_expedition_start`,
`wreck_run_end` (sector reached, what hit you, finished or not, run of 3),
`wreck_relic_earned`. Then in `docs/analytics.md`: the funnel from the solo
list to the first key used, to buying a key, and how far runs get by sector
(the tuning numbers above).

## Build in phases

1. **Greybox:** the course generator for the four sectors with plain shapes,
   every hazard working with its warnings, the height profile and set paths,
   the finish line, fairness and determinism tests. Tom flies it (dev panel)
   and says if it's hard enough.
2. **Art, effects and sound:** the hangar and the breach, the wreckage, the
   explosions, the reactor and escape, the music; performance measured.
3. **Keys, expeditions and relics:** the server (migration, tests, webhook
   for the key products), the store section, the screens, analytics.
4. **Polish and release:** screenshots at 360×640, 412×915 and 1280×800,
   light and dark; docs (`game.md`, `server.md`, `store.md`, `play-console.md`
   for the new products, `analytics.md`, `development.md`); version bump,
   what's new and release notes.

## Checks

- `npm run check` and `npm run test:browser` pass; the fairness and
  determinism tests cover the wreck.
- Unit tests: the expedition rules (3 runs, 24 hours), the relic track's
  order, shards at milestones.
- SQL tests: keys and expeditions as above.
- Browser tests: the solo list's locked wreck, using the free first key, an
  expedition's runs counting down, the store's keys section.

## Questions for Tom before phase 3

- The name: "the wreck", or the ship's own name ("wreck of the …")?
- The relic looks: which 8, and is the season's set themed?
- Key prices in cores and money once 1.0.14's data shows how many cores
  players earn a week.
- Should finishing once also unlock a free "practice" mode with no rewards?

## Report back

After each phase: what was built, screenshots, test results, frame times
against the asteroid belt, and anything left for the next phase.
