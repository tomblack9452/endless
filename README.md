# Endless Space

A minimal 3D endless runner for phones. You steer a small ship across alien
ground, through canyons and asteroid belts, and down the rooms of a starship,
dodging everything in the way. It's built with Three.js, TypeScript and Vite,
and is set up for Capacitor packaging (app id `com.tomblack.endlessspace`).

Everything is procedural: the courses, the textures, the props, the sound
effects and the music. There are no image or audio files apart from the app
icons. The ship's interior is built from a pack of hand-made sections drawn
as text grids.

There's a light free-to-play layer on top: daily rewards and quests, a daily shop of ship looks, a season pass and a premium currency
(cores). It all works on the device; a Supabase server and RevenueCat store
plug in behind it when their keys are set (see [Server and store](#server-and-store)).
Nothing you can buy makes a ship faster in ranked.

Play it at https://tomblack9452.github.io/endless/.

## Contents

- [Running it](#running-it)
- [Controls](#controls)
- [How it plays](#how-it-plays)
- [Themes and biomes](#themes-and-biomes)
- [Scoring, boost and power-ups](#scoring-boost-and-power-ups)
- [Modes](#modes)
- [Ranked](#ranked)
- [Leagues](#leagues)
- [Solo and endless](#solo-and-endless)
- [Credits, upgrades and looks](#credits-upgrades-and-looks)
- [Cores and daily rewards](#cores-and-daily-rewards)
- [Settings](#settings)
- [Sound](#sound)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Tuning](#tuning)
- [Dev tools](#dev-tools)
- [Testing](#testing)
- [Server and store](#server-and-store)
- [Deploying](#deploying)

## Running it

```bash
npm install
npm run dev
```

The dev server runs on port 5190 and listens on your network, so a phone on
the same Wi-Fi can open `http://<your-computer-ip>:5190`.

Phones only give motion sensor data (tilt steering) to secure pages. For that
there is an HTTPS server with a self-signed certificate on port 5191:

```bash
npm run dev:https
```

Accept the certificate warning once on the phone.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (HTTP, port 5190) |
| `npm run dev:https` | Dev server (HTTPS, port 5191) for tilt on phones |
| `npm run build` | Typecheck, then build into `dist/` |
| `npm run preview` | Serve the built `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm test` | Fairness, collision, database and server tests (see [Testing](#testing)) |
| `npm run db:setup` | Rebuild `supabase/setup.sql` and `supabase/parts/` from the migrations |
| `npm run db:apply` | Set up or update the Supabase database from your terminal (needs `SUPABASE_DB_URL`) |
| `npm run check-server` | Check the Supabase keys and database, and say what's missing |

## Controls

| | Phone | Desktop |
|---|---|---|
| Steer | Drag anywhere, tap the sides, or tilt | Arrow keys or A / D |
| Boost | Hold the boost button, or double-tap and hold anywhere | Shift, W, Up or Space |
| Pause | `pause`, top right (play resumes after a 3-2-1) | Esc or P |
| Start | `ranked`, `solo` or `endless` on the title screen | Space or Enter (ranked) |
| Retry | Tap | Space or Enter |

The boost button is a dial whose ring fills with the meter. It sits bottom
right by default; settings move it to the left or the middle. Double-tap and
hold: a quick tap, then a press within 250 ms near the same spot, boosts for
as long as you hold it and still steers. A drag isn't a tap, and taps on
opposite sides (tap-sides steering) don't count, so it never gets in the way.

Tilt steering is calibrated to however you're holding the phone when a run
starts, with a small deadzone. On iOS the game asks for motion permission on
your first tap. If you deny it, it falls back to touch.

On a wide screen the game plays in a centred portrait column.

## How it plays

- The world moves towards the ship. The ship stays centred and the world
  slides sideways when you steer.
- Levels are 1,000 distance points long and come in groups of three, one
  group per theme. Themes loop forever.
- Speed climbs from 36 to a hard cap of 75 units/s on an easing curve.
  Obstacle density rises the same way. Both are capped, so it never becomes
  impossible.
- Every course is built around a hidden **safe lane** that the ship can
  always follow at the current speed. Obstacles, pits and moving parts never
  cover it. The lane can only drift sideways at 35% of your steering speed.
- Day turns to night and back over ten levels, with a blue night rather
  than a black one.
- Near a theme change the path is kept clear for a stretch so you can read
  the new theme.
- First-run hints explain steering, boost, pickups, near misses and floor
  gaps, each shown once.

## Themes and biomes

Each loop of nine levels runs: ground theme (levels 1-3), second theme
(4-6), ship interior (7-9). The outdoor themes rotate through biomes:

| Loop | Levels 1-3 | Levels 4-6 | Levels 7-9 |
|---|---|---|---|
| 1, 4, 7... | Alien open ground | Canyon | Interior |
| 2, 5, 8... | Ice field | Asteroid belt | Interior |
| 3, 6, 9... | Volcanic plain | Canyon | Interior |

**Open ground.** Mushroom trees, spire trees, crystals, boulders, bushes,
dead trees and standing rock spires, mixed differently in each biome. Level 2
adds rock clusters. Level 3 is a forest path: dense forest on both sides of
a winding, clear path. Around them:

- rolling hills, with a few big hill sections per theme (they change the
  view only, and the ship noses up and down with the slope)
- grass tufts, and patches of greener grass and bare dirt in the ground
- rock faces running alongside the path for a stretch
- natural rock arches over the path
- flat-topped mesas on the horizon

- *Ice field:* pale ground and sky, mostly crystals and spires, and denser
  and harder than other open ground.
  - **Ice lakes:** sheets of open ice the lane runs across. On the ice you
    slow down a little and slide: steering takes a moment to bite.
  - **Snow** gets heavier through the field: light at level 1, medium at
    level 2, a blizzard at level 3 (thicker fog, white-out, gusting wind), and
    heavier again on later loops.
- *Volcanic plain:* dark basalt, a smoky sky, glowing lava cracks, and a
  light ship so it stays visible. Basalt columns stand about in clusters.
  - **Lava lakes:** glowing pools beside the lane. Touch one and the run
    ends, shield or not.
  - **Lava rivers:** from level 1, a river of lava runs across the whole
    plain and a basalt causeway carries you over it. The causeway follows the
    lane and gets narrower deeper in (about 5.2 wide at level 1, 4 at level 3).
    Fly off it and the run ends, shield or not.
  - **Lava geysers:** vents that erupt on a cycle of distance, a glowing mouth
    marking each. One on your lane is always down when you reach it, so you
    watch it blow and slip through; the rest stand off the lane.
  - **Lava bombs:** from level 2, chunks of lava thrown up by eruptions fall
    in front of you in salvos (a pair at level 2, three at level 3), landing
    either side. A glowing ring marks where each will land, with time to
    steer clear; they never land on the lane.
  - **Ash and smoke** thicken the deeper you go, so you can see less far.

**Canyon.** Rock walls that wind, with bands of rocks and pillars across
the floor and gaps through them. Alien cacti stand along the floor and
tumbleweeds roll across it (both solid; a tumbleweed always ends its roll clear of the safe lane). Obstacles are dark so they read against the
walls. Rocks run from small floor pebbles to huge cliffs towering over the
walls; bands mix small, medium and big boulders; natural bridges span the
canyon overhead.

**Ramps and drops:** the canyon floor climbs up ramps onto platforms, then
drops back down short steep drops or ramps down again (up to about 7 units
above where it started and 4 below, and level again by the exit). The ship
and camera follow the floor, and the ship noses up and down with it.

**Chasms:** now and then the floor falls away into a dark chasm and a bridge
carries the lane across. Fly off the planks and you fall.

- level 1 of the canyon: railed rope bridges
- from level 2: wide bridges with stretches of planks missing on one side or
  the other, so you weave across
- from level 3: bridges that fork, the second branch swinging out over the
  drop and back, with pickups on it

Bridges get longer and chasms more frequent as the canyon goes on. The rails
are joined from plank to plank, and the chasm's dark sides follow the walls.

Some bridges climb or dip as they cross.

**Upper and lower routes:** now and then a low rocky island (with crystals
along it) divides the canyon in two, and the two sides part ways: the branch
with the bonus line climbs onto a ledge while the other dips. Your lane runs
down one branch. The other has its own clear line, more rocks and bonus
pickups: the reward for taking it. Both are guaranteed passable, with clear
stretches before and after to cross.

- *Asteroid belt:* open space. The ground falls away into the dark, the sky
  opens to stars and the galaxy, and dust streams past to show your speed. The
  field is much wider than a canyon, held in by walls of giant asteroids, with
  no floor to fall from (no chasms, bridges, cacti or tumbleweeds). It has its
  own set pieces, and the ramps, splits and funnel into the ship still apply:
  - level 1, **drift fields:** scattered rocks across the field, some swaying
    side to side as you come up to them
  - level 2 adds **clusters** (a knot of rocks to fly round) and **gates** (two
    big asteroids with the way through between, trailing off either side)
  - level 3 adds **orbiting pairs:** two rocks swinging opposite ways that are
    either side of the lane just as you reach them, so you watch the gap open
    and close

  Swaying rocks move as a function of distance, not time, so where each will be
  on arrival is known exactly at any speed (the same trick as pistons), and the
  lane is kept clear of it with room for how far it moves while you pass. It
  gets busier through the three levels and with score, and nothing is placed
  before a split is due so the way to its other branch is open.

**Interior.** A chain of rooms joined by corridors, built from a pack of
about 40 hand-made **sections** (`src/pieces/`). Each section is drawn as a
text grid, one character per unit and one line per row, with a legend:

```
.  floor        #  wall           c  crate       L  laser
   pit (space)  |  divider        C  crate stack o  reactor core
=  catwalk      S  server rack    T  tank        v  steam vent
~  water        K  console        P  pillar      m  molten metal
```

plus overlays for moving and animated parts (hooks, sliders, pistons, doors,
fans, debris, steam, sparks, holograms, drips). A section lists its routes
(main, alternative and risky, with pickups as the reward) and which ship
levels it suits. Every section is checked on paper (symmetric walls, every
route clear and on floor, routes starting and ending together) and flown in
the tests, on its own and next to every other section.

The families: cargo bays, cargo lifts, server halls, the command deck,
observation decks, labs, hydroponics, laser gates, the reactor and reactor
collapse, the engine room's pistons, the foundry, coolant plant, steam vents
and ventilation fans, the flooded section, gantries and hull breaches, the
drop shaft, the hangar with its blast doors, junctions, forks, chicanes,
islands and uneven decks, joined by corridors. Ship level 1 uses the easier
sections, levels 2 and 3 the harder ones.

Walls are dressed with pipes, panels, cables and canisters, and the ship's
outer hull shows outside the windows. Crates, racks and walls use eight wall
textures and four top textures (plates, grates, ribs, hazard stripes,
hatches, treads), varied by family.

**Theme events.** As the middle level of a theme begins, there's a chance
(the same for a given seed) of an event:

- meteor shower outdoors
- sandstorm in the canyon (thicker air, blowing grit, stronger wind)
- red alert inside (red emergency lighting and a klaxon)

Events change the look and sound only, never the course.

## Scoring, boost and power-ups

- **Distance:** 0.85 points per unit travelled. Only distance moves you
  through levels.
- **Near misses:** an obstacle passing within 0.8 of the hitbox. Each one in
  a chain pays 25 × the chain length, up to ×10. The chain breaks after 2.5 s
  without one. As a chain grows, the music builds: a pulse, then an
  arpeggio, then hats.
- **Boost pickups** (gold diamonds) sit on the safe lane, so they also show
  the way. Each one is worth 50 points and 15% boost.
- **Boost:** the meter fills slowly by itself (60 s from empty) and from
  pickups. Holding boost gives 1.45× speed and 50% more distance points. It
  also widens the view, pulls the camera back and adds speed lines. A full
  meter lasts 3.5 s.
- **Power-ups** are rarer gems that replace a boost pickup now and then:
  - **Shield** (blue): survives one hit, then gives a moment of grace to
    get clear. Walls still hold you in while shielded (steer into one and
    you slide along it). It doesn't save you from falling into a pit.
  - **Magnet** (purple): pulls boost pickups ahead towards you for 9 s.
  - **Slow-mo** (green): drops you to 62% speed for 6 s.

## Modes

The title screen leads with **ranked**, a big button showing your best on
this week's run, with **solo** and **endless** under it. Above it, **live
cards** show the season pass (your tier and the XP to the next), today's goals,
and a daily reward when one is waiting. Along the bottom, a bar of five:
**hangar**, **shop**, **goals**, **leaderboard** and **service record**, each
with a dot when something there needs you. Settings is the gear top left;
credits and cores sit top right (tapping them opens the shop).

New players see the game in stages (`src/reveal.ts`), so the first screen isn't
a wall of buttons: at first the big button flies endless and the bar has the
hangar and goals; solo, the shop and the service record open after 3 runs;
ranked, leagues and the leaderboard after 5 (and the tutorial). Each stage is
announced once, and a line under the menu says what opens next.

| | Ranked | Solo | Endless |
|---|---|---|---|
| Course | Endless on the week's seed: the same for everyone, new every Monday | An environment, endless; or a set level | Every area in turn, forever |
| Ship | Your upgrades, up to your league's cap | Your upgrades, no cap | Your upgrades, no cap |
| Assist mode | Off | Allowed | Allowed |
| Revive | No | Once a run | Once a run |
| Ghost | Your weekly best | - | - |
| Earns | The most XP, league points, full credits | XP, credits at half rate | XP, credits at half rate |
| Best score | Your best this week | One per environment (and set level) | Endless best |

**The weekly run** is endless, through every area in turn, on a seed that
belongs to the week. Everyone flies the same course all week (it doesn't
change with how you steer, boost or which upgrades you own), and a new one
starts every Monday at midnight UTC. Fly it as often as you like; your best
counts.

Ranked is played in leagues (below), so everyone in a league flies a ship
with about the same upgrades. Every ranked run is kept with its score, date,
week and seed, and its path (the ship's sideways position every 4 units).
Your best run of the week is flown as a faint **ghost** ship next to you, and
with the server on, runs go to the **weekly leaderboard** for your league
(on the league screen). After a ranked run, **share** makes a picture of it
for the share sheet. Looks are allowed
everywhere, because every hull shares one hitbox.

## Ranked

Your **rank** is your lifetime level: 35 ranks from recruit to general grade
4, earned with **XP** from everything you do. It never goes down; how well
you do in ranked is what leagues are for.

- **Runs:** ranked earns 1 + 1 per 800 points, solo and endless 1 per 4,000
  (nothing for a run under 500). Your first 3 runs each day earn double.
- **Goals:** 30 XP each.

| Rank | XP |
|---|---|
| Recruit | 0 |
| Apprentice, G2 | 10, 25 |
| Private, G2 | 50, 80 |
| Corporal, G2 | 120, 175 |
| Sergeant, G2, G3 | 250, 350, 450 |
| Gunnery Sergeant, G2, G3 | 600, 800, 1,000 |
| Lieutenant, G2, G3 | 1,300, 1,650, 2,000 |
| Captain, G2, G3 | 2,500, 3,100, 3,750 |
| Major, G2, G3 | 4,500, 5,400, 6,400 |
| Commander, G2, G3 | 7,500, 9,000, 10,500 |
| Colonel, G2, G3 | 12,500, 15,000, 17,500 |
| Brigadier, G2, G3 | 20,000, 24,000, 28,000 |
| General, G2, G3, G4 | 33,000, 38,000, 44,000, 50,000 |

Older saves also needed a skill number for each rank; it's gone, so ranks are
reached on XP alone and nobody dropped.

A regular player (15 runs a day) reaches general in about a year. Every promotion pays credits (50 x the new
rank's place on the ladder) and gets its own moment: a full-screen card with
the new insignia, turning rays and what it gave you.

Insignia are drawn in code: chevrons for enlisted ranks (with rockers for
sergeants), bars and diamonds for officers, stars for generals, and pips for
grades. The **service record** (the bar, or tap your rank on the title screen) leads
with the XP you need for the next rank, big, with a bar and roughly how many
runs that is. Under it: what the next rank gives (credits, a new insignia,
any looks), a chart of the XP from your last 20 ranked runs, how XP is earned, double-XP runs left
today, your bests, and the whole ladder in its own scrolling box, opened at
your rank, with what every rank needs and gives.

## Leagues

Your personal rank is your lifetime level; **leagues** are brackets by ship
power. Every upgrade tier you own is one **upgrade point** (30 at most).

| League | Active points allowed | Get in by | Par (of the weekly target) | Promotion reward |
|---|---|---|---|---|
| Bronze | 0-4 | starting | 55% | - |
| Silver | 5-9 | finish Bronze 3, own 5 points | 65% | 500 |
| Gold | 10-14 | finish Silver 3, own 10 | 75% | 1,250 |
| Platinum | 15-19 | finish Gold 3, own 15 | 85% | 2,500 |
| Diamond | 20-24 | finish Platinum 3, own 20 | 95% | 5,000 |
| Champion | 25-29 | finish Diamond 3, own 25 | 105% | 8,750 |
| Grand Champion | 30 | finish Champion 3, own 30 | 115% | 12,500 |

- **Cap:** in a league your switched-on upgrades can't be over its top. If
  they are, ranked opens the hangar to switch some off first.
- **Divisions** 1-3, 100 league points (LP) each. A run earns LP against the
  league's par: +10 at par, up to +25 at 150%, 0 at 75%, down to -15 under 50%.
  Moving up a division pays 300 x the league number in credits.
- Divisions can drop; leagues never do. Finishing division 3 without the next
  league's points leaves you "promotion ready" until you buy them (buying the
  last one promotes you straight away).
- **Weekly reward:** credits for the highest division you reach each week
  (150 in Bronze 1 up to 2,250 in Grand Champion), paid when the next week
  starts.
- Each league above Bronze unlocks a paint, and the wing decal can show your
  league emblem.
- The **league screen** (tap your league on the title screen) works like the
  service record: the LP to your next division, big; the upgrade points the
  next league needs; what the next division and league give; a chart of the
  LP won and lost over your last 20 runs; this week's par; and every league.
  Moving up a division or a league gets the same full-screen moment as a
  rank.

## Solo and endless

Solo has two tabs.

**Environments:** pick open ground, canyon, ship interior, ice field,
asteroid belt or volcanic plain and fly it endlessly. It stays there and
keeps getting harder, through its three flavours. Each has its own high
score and its own leaderboard. They open as you get to them: an environment
unlocks when a ranked or endless run reaches the level where its area first
appears (canyon at level 4, ship at 7, ice field at 10, asteroid belt at 13,
volcanic plain at 19). Locked ones show what opens them and a bar for how far
off that is, and the solo screen names the next unlock. Solo runs, set levels
and dev starts don't count towards it.

**Levels:** the set levels, hand-built runs that are the same every time,
with a finish line. Each is a script of named sections: an area, how hard it
is, and set pieces (slaloms, stone gates, arch runs, pickup trails, forced
events, a chosen order of ship rooms).

| # | Level | Where |
|---|---|---|
| 1 | first light | plains, an arch run, the forest path |
| 2 | stone garden | spire slalom, stone gates, a meteor shower |
| 3 | frost and fire | ice field and frozen forest into the burning plain |
| 4 | dry river | riverbank down into the gorge and the narrows |
| 5 | twin gorge | splits, a sandstorm, a pillar run |
| 6 | asteroid run | the asteroid belt from end to end |
| 7 | maintenance deck | cargo, servers, laser gates, the coolant plant, the hangar |
| 8 | red alert | steam vents, gantries, pistons and the foundry, in a power failure |
| 9 | core breach | burning plain, gorge, then the ship to the reactor collapse |

Each runs about 2-4 minutes and has three stars: **finish**, **no hits** (a
shield save counts as a hit) and **beat the score target**. Your best time
and score are kept. Finishing a level opens the next (a locked level says which to finish). New
stars are worth 50 credits each.

**Endless** runs through every area in turn, forever: open ground, canyon,
ship, then the next loop's biomes. It has its own high score.

## Credits, upgrades and looks

**Credits** come mostly from runs (1 per 125 points in ranked, 1 per 250 in
solo and endless, plus 1 for every pickup), and also from quests, goals,
promotions, league rewards and set level stars. Spend them in
the **hangar**.

**Upgrades** work everywhere: solo and endless have no cap, ranked is up to
your league's cap.
Five tiers each at 500 / 1,500 / 4,000 / 10,000 / 25,000 credits: 41,000 a
system, 246,000 for the whole ship. Tier 3 needs Gold, tier 4 Platinum and
tier 5 Diamond. Any bought system can be switched off in the hangar.

| System | Per tier | At tier 5 |
|---|---|---|
| Thrusters | Boost lasts 8% longer | +40% |
| Capacitor | Boost refills 10% faster | +50% |
| Tractor beam | Pickup reach +12%, magnet +1 s | +60%, +5 s |
| Deflector | Shield grace +0.2 s | Every run starts shielded |
| Stabilisers | Steering 3% quicker | +15% |
| Scanner | Power-ups 8% more often | +40% |

**The hangar** is where the ship is dressed and upgraded: one screen over the
ship, opened from the title screen or from the shop. The chips along the top
are the slots of looks, with an **upgrades** chip at the end.

**Looks** (any mode) are **157 of them** across seven slots, every one allowed
in ranked because every hull shares one hitbox. Tap a look to see it on the
ship; the button under the grid puts it on, buys it, or says how to get it, with
how far along you are. Each slot is a chip with its count.

| Slot | What's in it |
|---|---|
| Hull (12) | dart; wing, needle, manta (early goals); arrow, talon, viper (credits); nova, phantom (cores); raptor (season pass); kite, comet (goals) |
| Paint (72) | plain colours for credits, rank paints (copper to pearl), a paint for each league, star paints, premium paints for cores, and paints for finishing goals (one for each area you reach, and each place you master) |
| Markings (13) | stripe, twin stripes, split, hazard (credits); dots, bands (cores); chevron, two-tone (stars); spine, wing tips, checker, nose cap (goals) |
| Fins (7) | tail fin, winglets, crest (credits); twin fins (stars); blade, swept fins (goals) |
| Engine colour (27) | single colours and two-colour flames (root to tip) for credits, cores, rank, goals and the pass |
| Wing decal (16) | your rank insignia, your league emblem, and pictures: flame, wings, rocket (credits); star, moon, target, crown, skull, bolt, laurel, atom, planet (goals) |
| Flame (10) | glow only; line, dashes, ion, long, twin, pulse (goals); triple (credits); wide (cores); ribbon (the vault) |

**Ways to get a look:** credits, cores, a rank, a league, set level stars, a
**goal**, the login calendar or the season pass, or the
vault. Each look says which on its card.

**Goals** (the goals button on the title screen): 53 of them in four groups
(flying, skill, places, collection), each with a progress bar. They count what
the game already keeps, so a save that existed before has its progress already.
Finishing one pays credits and unlocks a look to wear; there's a card for each
when you finish a run. Examples: fly 50 runs, 10,000 near misses, a chain of
15, reach level 19 (the volcanic plain), score 4,000 in each area on its own,
finish all nine set levels, own 25 looks.

**Season looks** are made by code (`src/seasonLooks.ts`), so every six-week
season brings new ones with no drawing and no app update. Each season has a
theme (a name like "hollow relay" and a base hue that steps round the colour
wheel) and makes nine looks: a paint, an engine colour, a wing decal and a
two-tone paint on the pass's premium track, a paint on the free track at tier
25, and two paints and two engine colours for 2,000 to 20,000 credits, one of
which the daily shop features each day of the season. Season 1's pass keeps its
hand-made looks, so it only adds the shop four. Colours keep clear of the
hand-made paints, decals are built from an outline, a mark and pips, and a look
stays in the catalogue for good once its season has come.
`CONFIG.seasons.overrides` renames, recolours or vetoes any of them.

**Sets** are themed groups of four or five looks you can buy (ember forge, deep sea, neon
night, royal guard, toxic waste, sunset strip). Own every look in one for a
bonus of cores.

## Cores and daily rewards

Everything here is in `src/economy/` and tuned in `CONFIG.economy`. Days
turn over at midnight UTC, the same moment for everyone.

- **Cores** are the premium currency. They come slowly from play (login
  rewards, quests, the season pass) and, in the apps, from the store. They buy
  premium looks, revives and the pass's premium track. Ranked used to take a
  ticket a try; it's unlimited now, and older saves were paid 30 cores for each
  ticket they had beyond the week's 5.
- **Revive:** outside ranked, once a run, a crash offers to carry on (with a
  6 s timer). The first each day is free, then 20 cores. The ship goes back
  onto the safe lane, obstacles near the lane just ahead are cleared, it gets
  a shield and a moment of grace, and a 3-2-1 starts it again.
- **Daily:** a 7-day login calendar (credits, cores, and the aurora
  paint on day 7), collected with a card when you open the game. A missed day
  just waits. Three **daily quests**, the same for everyone that day (play
  runs, score, reach a level, near misses, pickups, boost time, ranked runs,
  ship rooms), each paying 60 to 120 credits and 30 pass XP; all three pay 4
  cores.
- **Shop:** a showroom, with the camera circling your ship above a sheet of
  cards. Tap a card to put the look on the ship, then buy it with the button
  under the cards (tap an owned one to wear it). Three tabs, all the same for
  everyone and all turning over on the UTC clock:
  - **today:** four looks a day, at least one premium, one a deal at a quarter
    off. Looks you don't own come first, and the day's picks are kept for the
    day, so buying one doesn't reshuffle the rest.
  - **weekly set:** one themed set a week, as a bundle for what you're missing
    at a fifth off (in cores). Every set comes round once before any repeats.
  - **vault:** one rare look a month, for cores. When it goes it's away for the
    rest of the cycle.
  Also: core packs in the apps.
- **Season pass:** six weeks (six weekly runs), 30 tiers of 600 XP, paced so
  a regular player finishes in about five weeks. Runs earn XP (1 per 500
  points, up to 30) and each quest 30. The free track pays credits and cores;
  the premium track (550 cores, or a purchase in
  the apps) pays more, with the frost and ember paints, the solar engine and
  the raptor hull. Rewards are paid as you reach each tier, and unlocking
  premium pays every premium tier already reached.
- After a run, the end screen lists any quests finished and the pass XP
  earned, and the counters in the top bar bump as things land.

**Stats** (the service record's second tab) show runs, time played, distance, your best this
week, your endless best and your best in each solo environment, furthest
level, best chain, near misses, pickups, and where you crash most. Every run has a seed, and the same seed always builds the same course.

## Settings

Settings are under `settings` on the title screen or the pause menu, and
are saved on the device.

- **Sound:** sound on/off, music level, effects level.
- **Controls:**
  - tilt to steer, and tilt sensitivity
  - touch steering: drag, or tap sides
  - drag sensitivity
  - where the boost button sits: right, left or middle
  - double-tap and hold to boost, on or off
  - vibration
- **Display:**
  - reduce motion: no shake, roll or speed lines
  - text size
  - high contrast
  - ghost of your weekly best, on or off
  - performance mode: a lower render scale and lighter snow and ash, for
    older phones
- **Assist mode:** 80% speed and teal markers along the safe line. Assisted
  runs never count as a best score.

## Sound

Everything is synthesised with the Web Audio API on the first tap.

- The engine hum is tuned to D. Effects go through buses with a reverb and
  an echo that turns into a long canyon echo.
- The music is generative and in D throughout:
  - open ground: major pentatonic
  - canyon: minor pentatonic
  - interior: Phrygian, with a metallic FM lead
  - ice field: Lydian, with the bell lead
  - volcanic plain: Phrygian dominant
  - asteroid belt: Mixolydian pentatonic, with the bell lead
- Tempo follows speed, density follows level and boost, and brightness
  follows the time of day.
- Near-miss chimes climb the current scale.

## How it works

**The field.** Every kind of object lives in an `InstancedField`: one
`InstancedMesh` pool with per-instance position, scale, rotation, collision
box and colour. Instances are stored relative to the ship sideways and by
absolute distance along the run, so moving forward is just a change in the
distance. Collision is a swept box test on both axes, so high speeds can't
tunnel through thin walls. Moving parts are functions of distance, not
time. That means the generator knows exactly where a piston, door or piece
of debris will be when the ship reaches it, at any speed.

**The generator** (`world.ts`) builds rows 230 units ahead. It steers the
safe lane within the slope limit, then places a theme's obstacles with
`clearOf` checks against the lane. Inside the ship, each room is a
hand-made section (`src/pieces/`) read row by row from its grid; the room's
look (light, height, windows, decor) comes from `interior.ts`, and the world
handles walls, floors, pits, splits and the joins between rooms. Bridges,
rails and other set pieces outside are built as whole assets too, never from
random parts, so they always fit together.

**Look.** Block textures are drawn to canvases at startup and mapped in
world space through a material patch. Props are low-poly meshes with shading
baked into vertex colours, so there's no lighting cost. Colours come from
one live palette. Time of day, theme blends, biome tints and events all write
into it each frame.

**A course is its seed.** Generation only uses the seeded `rand()`, never
`Math.random`, the clock or frame timing, and nothing is placed relative to
where the ship is: canyon mouths, scatter and props all follow the lane. So
the week's ranked run is the same for everyone however they fly, and a server
can check a run from its inputs. A test enforces both.

**Heights** (`terrain.ts`). Hills, ramps, platforms and drops are one height
function of distance, plus a sideways part for a split's upper and lower
routes and a list of chasms. The instance matrices and a ground vertex shader
both use it, drawing everything relative to the ship's own height, so the
ship stays put while the floor ahead climbs and drops. Floors, ceilings and
bridge planks lean with the slope so neighbouring rows meet. Collision never
sees heights: everything at one spot rises together, so ramps can't make a
course unfair. Chasms are the one place the floor matters: off a bridge, the
fall check finds nothing under the ship.

**Performance.**
- All the obstacles draw in a few dozen calls.
- The pixel ratio adapts: it steps down after a run of slow frames and back
  up when there's headroom.
- three.js ships as its own chunk so it stays cached between updates.
- The build includes Latin font files only.

**Offline.** The production build registers a service worker and a web
manifest, so the game installs to a home screen and works offline. Each
new build drops the old build's cached scripts and styles.

## Project layout

| File | What it does |
|---|---|
| `src/config.ts` | Every tunable value |
| `src/game.ts` | State machine, main loop, scoring, boost, power-ups, menus |
| `src/world.ts` | Pools, theme generators, safe lane, pits, rooms |
| `src/interior.ts` | Ship room looks (name, light, height, windows, decor) and the room API sections build with |
| `src/pieces/` | The hand-made ship sections: format and checks, the grid builder, and the pack by family |
| `src/field.ts` | Instanced pool: collision, sine and ramp motion |
| `src/props.ts` | Low-poly trees, rocks, crystals, shuttles, pipes, gems |
| `src/biomes.ts` | Biome looks and names |
| `src/terrain.ts` | Hills, ramps, split heights and chasms (JS and GLSL) |
| `src/events.ts` | Meteor shower, sandstorm, red alert |
| `src/weather.ts` | Snow and ash: particles, fog and tint |
| `src/player.ts` | Ship shapes, shield, banking, crash and fall |
| `src/trail.ts` | Ship trails |
| `src/renderer.ts` | Renderer, camera, ground, planet, adaptive resolution |
| `src/sky.ts` | Stars, galaxy, shooting stars |
| `src/atmosphere.ts` | Day/night and theme colour blending |
| `src/palette.ts` | Live palette shared by every material |
| `src/blockTextures.ts` | Procedural metal textures |
| `src/speedLines.ts` | Boost streaks |
| `src/input.ts` | Drag, side taps, tilt, keyboard, boost control |
| `src/ranks.ts` | Rank ladder, XP, run credits, insignia, ranked history |
| `src/wallet.ts` | Credits and cores |
| `src/economy/` | Daily rewards and quests, the shop (today, the weekly set, the vault), the season pass, and their screens |
| `src/server/` | The server behind one interface: Supabase, or the device alone; cloud save, the run outbox and the leaderboard boards |
| `src/unlocks.ts` | What opens solo environments and how far off it is |
| `src/store/` | In-app purchases (RevenueCat in the apps, nothing on the web) and what's owned for good |
| `src/ads/` | Ads (AdMob in the apps, nothing on the web) and their rules |
| `src/ghost.ts` | The ghost of your weekly best |
| `src/share.ts` | The share card |
| `src/upgrades.ts` | Ship upgrade systems, points and the standard ship |
| `src/leagues.ts` | Leagues, divisions, league points, weekly rewards, emblems |
| `src/catalogue.ts` | Every hand-made look, how to get each, the sets and the vault (plus the season looks) |
| `src/season.ts`, `src/seasonLooks.ts` | Season timing, and each season's generated looks |
| `src/looks.ts` | What you own and what's on; how an unlock reads |
| `src/achievements.ts`, `src/goals.ts` | The 53 goals (counted from existing stats) and which have paid |
| `src/hangar.ts`, `src/hangarView.ts` | The hangar's model and its screen (looks and the upgrades chip), and the goals list |
| `src/legacy.ts` | Carries older saves' mission unlocks over to the looks (missions were removed) |
| `src/decals.ts` | Wing decal pictures |
| `src/progress.ts` | Stats, set level results, weekly, endless and environment bests |
| `src/courses.ts` | The set levels, the solo environments and the week's ranked run |
| `src/fx.ts` | Animated interior detail: liquids, steam, blinkers, holograms, sparks |
| `src/settings.ts` | Settings table and storage |
| `src/hints.ts`, `src/haptics.ts` | First-run hints, vibration |
| `src/rng.ts` | Seeded random numbers (mulberry32) |
| `src/audio/` | Sound engine, synth helpers, generative music |
| `src/ui.ts`, `src/style.css`, `index.html` | HUD and screens |
| `src/dev.ts` | Dev-only panel |
| `tests/fairness.test.ts` | Headless survivability test |
| `tests/pieces.test.ts`, `tests/pieces-pairs.test.ts` | Every ship section on paper, every route flown, every pair back to back |
| `tests/determinism.test.ts` | No unseeded randomness or clock in course generation |
| `tests/economy.test.ts` | The calendar, quests, the shop, the pass and the revive |
| `tests/server.test.ts` | Offline fallback and the store webhook |
| `tests/sql.test.ts`, `tests/leaderboard.test.ts` | The database run for real (PGlite): checks, boards, names, row security, and the game's server code against it |
| `tests/collisions.test.ts` | Every solid pool checked against its mesh across every area |
| `tests/unlocks.test.ts` | Solo environment unlocks |
| `tests/ranks.test.ts` | Rank ladder, XP and credit maths |
| `tests/courses.test.ts` | Set levels fly to the finish; twelve weeks of ranked runs and every environment are survivable; the course depends only on its seed |
| `tests/input.test.ts` | Double-tap and hold to boost |
| `tests/leagues.test.ts` | League brackets, LP, divisions, promotion, weekly rewards, prices |
| `public/` | Icons, manifest, service worker |
| `supabase/` | Database migrations, `setup.sql` (all of them in one file), `parts/` (the same in small pieces to paste) and the store webhook |
| `docs/leaderboards.md` | Turning the leaderboards on, what's checked, and the cheating roadmap |
| `docs/store.md` | Server, store and app setup, and the store listing |

## Tuning

Nearly every number lives in `src/config.ts`, grouped by system:

- `speed` and `score`: pace, level length, near-miss rules
- `field`: spawn depth and pool sizes
- `themes`: lane rules, open ground, canyon (ramps, chasms, bridges,
  upper and lower routes), every interior room and the ship's ramps
- `boost` and `powers`: pickups and power-ups
- `events`, `biomes`, `terrain`: weather, biome looks, hills
- `assist`: assist mode
- `courses`: credits per set level star (rank, upgrade and look tables live in
  `ranks.ts`, `upgrades.ts` and `looks.ts`)
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
- **Unlock all:** General Grade 4, Grand Champion, every look, every
  upgrade maxed and 100,000 credits (saved in that browser), and every set
  level open until you reload
- **Reset all progress:** clears everything but settings
- an FPS readout with the pixel ratio and draw calls

The shop's cores section also has a free "+500" in dev. `window.game` is
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
four seeds.

`tests/courses.test.ts` flies every set level from start to finish at each
section's speed and checks each runs 100-260 seconds, flies twelve weeks of
ranked runs for 90 seconds each, and every solo environment for 40 seconds on
three seeds.

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

## Server and store

Without keys, everything lives on the device. With them:

- **Supabase** (`src/server/`, `supabase/`): an anonymous account per
  player (linkable to Apple or Google later), a cloud save of every saved
  setting and stat (the newer save wins; a fresh install takes the cloud's),
  cores held on the server (earned cores capped per day, spending checked),
  and **leaderboards**: this week's ranked run per league, endless, and one
  for each solo environment, with pilot names (see the `top` link on the title
  screen). Runs are checked in the database (the score has to fit the distance
  and time, and the path the distance), kept and retried if there's no signal.
  Setup is two keys and `npm run db:apply` (or pasting the small SQL parts): [docs/leaderboards.md](docs/leaderboards.md).
- **RevenueCat** (`src/store/`) in the iOS and Android apps: core packs
  (100, 550, 1,200, 2,500), a one-time starter pack (500 cores and the nova
  hull), the season pass, and **premium** (a one-off: no ads, ad rewards
  without the ad, the halo hull, regalia paint and crown flame, an extra free
  revive a day, a badge on the boards). What's owned for good is in
  `src/store/entitlements.ts`.
- **AdMob** (`src/ads/`) in the apps: rewarded ads only, with consent and
  Apple's tracking prompt; premium players never see one. No ads on the web. Purchases are paid into the server
  wallet by a webhook. The web build sells nothing.

What has to be set up by hand (projects, products, keys and the app builds)
is in [docs/leaderboards.md](docs/leaderboards.md) for the server and
[docs/store.md](docs/store.md) for purchases, with the store listing text and
the screenshot list. Keys go in `.env` (copy `.env.example`), which is never
committed; `npm run check-server` says what's missing.

Still to do on the server: a full re-fly of submitted runs with the game's
own code (it needs the run simulation pulled out of `game.ts` first), and
linking accounts to Apple or Google sign-in.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which runs the tests,
builds, and publishes `dist/` to GitHub Pages. Other branches run
`.github/workflows/test.yml` (typecheck and tests).

To turn Pages on: in the repo, open **Settings → Pages**, set **Source** to
**GitHub Actions**, then re-run the workflow.
