# How the game plays

Everything about Endless Space as a player meets it: controls, the courses,
modes, progression, the economy, settings and sound, and at the end how the
game is built under the hood. The [README](../README.md) is the front page;
the code layout is in [development.md](development.md).

## Contents

- [Controls](#controls)
- [How it plays](#how-it-plays)
- [Themes and biomes](#themes-and-biomes)
- [Scoring, boost and power-ups](#scoring-boost-and-power-ups)
- [Modes](#modes)
- [Ranked](#ranked)
- [Leagues](#leagues)
- [The daily challenge](#the-daily-challenge)
- [Solo and endless](#solo-and-endless)
- [Credits, upgrades and looks](#credits-upgrades-and-looks)
- [Cores and daily rewards](#cores-and-daily-rewards)
- [Settings](#settings)
- [Sound](#sound)
- [How it works](#how-it-works)

## Controls

| | Phone | Desktop |
|---|---|---|
| Steer | Drag anywhere, tap the sides, or tilt | Arrow keys or A / D |
| Boost | Hold the boost button, or double-tap and hold anywhere | Shift, W, Up or Space |
| Pause | `pause`, top right (a button for keyboards and screen readers too: Enter or a click), or Android's back button (play resumes after a 3-2-1; main menu ends the run, and it still counts) | Esc or P |
| Back | Android's back button closes the open screen, pauses a run or leaves the end screen; on the title screen it asks "close endless space?" (**close** / **stay**; back again stays) unless "ask before closing" is off | Esc does the same, but never leaves the page |
| Start | `ranked`, `solo` or `endless` on the title screen | Space or Enter (ranked) |
| Retry | Tap | Space or Enter |

The boost button is a dial whose ring fills with the meter. It sits bottom
right by default; settings move it to the left or the middle (and the
left-handed layout swaps right and left, with pause and the level). Double-tap and
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
- **First-run tips** (`src/ui/hints.ts`): a short walkthrough over a new
  player's first runs, each tip once and at its moment: how to steer (in the
  steering chosen: drag, tap the sides, tilt, or the keys), steering clear of
  obstacles, near misses and chains (at the first near miss), pickups (when
  one is coming up), power-ups (when one is coming up) and boost (once the
  meter has some). They're small lines in the middle of the screen that never
  stop or slow the run, with **skip tips** under each. Tips the practice run
  already taught are left out (all six after a full practice run, the lessons
  reached if it was skipped part way; skipping the tutorial keeps them all),
  and a lesson says steering and boost in its tip's words. A save that had runs before the tips came in
  never sees them, and settings > replay tips brings them all back. The
  floor-gap hint in the ship shows once, too.

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
about 40 hand-made **sections** (`src/world/pieces/`). Each section is drawn as a
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
cards** show a daily reward when one is waiting, the free gift, the **daily
challenge** (your streak, today's best and the time left; tap it to fly),
today's goals and the season pass (your tier and the XP to the next). Along the bottom, a bar of five:
**hangar**, **shop**, **goals**, **leaderboard** and **service record**, each
with a dot when something there needs you. Settings is the gear top left;
credits and cores sit top right (tapping them opens the shop).

**First launch** (`src/ui/onboarding.ts`) opens on a welcome: pick how you steer
from a card for each way (drag, tap sides, tilt where the phone has it, and
the keys on a computer), each with a small looping line diagram of a thumb, the
halves of the screen or the phone rocking, and the ship following
(`src/ui/controlArt.ts`; it stands still with reduce motion). Then a short
**practice run** on a fixed course you can't fail, six lessons one at a time,
each with "2 of 6" and dots, a skip, and its own indicator
(`src/ui/tutorialView.ts`): steering (the chosen card's diagram in the bottom
band, leaning towards the safe line), obstacles (a marker on the next one and
on the gap), near misses (the card points at the score, and the chain is
marked "up to x10"), a boost pickup and then each power-up (a card with its
icon, colour and real numbers from `CONFIG` as it comes up, a marker on it in
the world, and what it did once picked up; `src/ui/guide.ts`), and boost (a ring
round the button, worded for the boost mode). A lesson moves on when it's
done, or after a gentle timeout. The practice course is the fairness-tested
one, with its own pickups and power-ups placed as each lesson comes up. After
it a **recap** lists the pickups and power-ups (also in settings > help), then
**how did that feel?** shows the cards again with the one flown marked
"used": keep it, or tap another (saved straight away) and try it for 15 s of
steering, then back to the same question. Then **dress your ship** from a
starter set (three hulls, three paints, three engine colours) and you're on
the front page, with the first daily reward. It resumes after a restart, can
be skipped, and can be replayed from settings; anyone who had already played
skips it.
The first real runs then carry the first-run tips (see [How it plays](#how-it-plays)). The
pilot name is asked for when ranked and the leaderboards open, while it's
still the generated one (the name screen stays until one is saved).

New players see the game in stages (`src/progression/reveal.ts`), so the first screen isn't
a wall of buttons: at first the big button flies endless and the bar has the
hangar and goals; solo, the shop and the service record open after 5 valid
runs (a run scoring 1,000 or more); ranked, the daily challenge, leagues and the
leaderboard after 5 and the tutorial. Each stage is
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
(on the league screen). Looks are allowed
everywhere, because every hull shares one hitbox.

**Share.** After any ranked run, and after a new personal best in any mode
(endless, solo, a set level, the daily challenge), the end screen has
**share**: a picture (1080 x 1350, `src/platform/share.ts`) in the store
art's dusk, with a ringed planet, the lane glowing towards your own ship as
you have it on (`src/ship/portrait.ts`, drawn big), the score, "new best",
the mode or board, a line or two (rank and league, or the streak) and a small
"endless space" wordmark. It goes to the phone's share sheet (the Web Share
API) where there is one; on the web without one it's saved as a picture. The
Android app's web view has no Web Share API (and no share plugin is added),
so the app hides the button for now (`shareAvailable()`).

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

**Rank colours.** The menus take on a colour as you climb (`RANK_COLOURS` in
`src/progression/ranks.ts`): charcoal for recruits, then slate, pine, cobalt, violet,
crimson and bronze, and gold for generals, whose main button has a slow sheen.
It's on the main buttons, open tabs, progress bars, the bottom bar's icons and
the rank badge. A promotion into a new band says so. High contrast keeps the
plain ink.

**Dark mode** (settings > display): menus on dark panels with light text, and
each rank colour switches to its light twin (`dark` in `RANK_COLOURS`). The
scene and the HUD don't change. Type is Host Grotesk for text and Geist Mono
for numbers, buttons and labels (both free, OFL), behind `--font-sans` and
`--font-mono` in `src/ui/style.css`.

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
- **The server keeps your league** (since 1.0.7, `0015`), so a ranked run
  can't be sent to a lower league's board. A run sent for a lower league
  counts on your own league's board; a promotion is one league at a time, and
  only after 12 ranked runs in the league below (the fewest that can fill its
  three divisions). Players from before this start from the league of their
  latest ranked run.
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

## The daily challenge

Since 1.0.8. One short course a day, the same for everyone, new at midnight
UTC. It opens with ranked (after 5 valid runs and the tutorial).

- **The course** (`dailyRun` in `src/world/courses.ts`) is built like the
  weekly run, from a seed that belongs to the day (`endless-day-<date>`), but
  laid out as a set level with a finish line: three sections, 3,600 units
  (about a minute and a quarter), from the plains, the ice field, the volcanic
  plain, the canyon or the asteroid belt: one area all the way, open ground
  on into another, or out there and into the ship to finish. It gets harder
  towards the line (`CONFIG.daily`), with a set piece in the middle now and
  then and the area's event near the end. The day is the server's
  (`backend.now()`), so a phone with its clock moved flies the same course.
- **Fair for everyone:** the standard ship whatever you own (upgrades don't
  count), no assist mode and no revive. A crash ends the try; fly it as often
  as you like and your best counts.
- **Its board** is on the leaderboard screen as **today**: everyone together,
  for the day. Runs are checked like ranked runs (the path), and one still
  waiting for a signal at midnight is dropped rather than put on the next
  day's board.
- **The streak** (`src/progression/challenge.ts`): fly the daily on days in a
  row (a run of 8 seconds or more, or one that finishes). The first run of
  each new day in the streak pays the next step of the ladder, shown as a
  card with tomorrow's step under it:

  | Day | 1 | 2 | 3 | 4 | 5 | 6 | 7 and on |
  |---|---|---|---|---|---|---|---|
  | Credits | 100 | 150 | 200 | 250 | 300 | 350 | 500 |
  | Cores | - | - | 1 | - | 2 | - | 3 |

  A missed day starts again at 1. The cores go through the server
  (`earn_cores`, `daily:<date>`, 3 a day at most). The service record shows
  today's best and the streak (and the longest).
- Daily runs count for everything else as solo runs do: XP, credits at half
  rate, goals and pass XP.

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

**Looks** (any mode) are **164 hand-made ones** across seven slots, plus each season's generated looks (four so far, from season 1's shop), every one allowed
in ranked because every hull shares one hitbox. Tap a look to see it on the
ship; the button under the grid puts it on, buys it, or says how to get it, with
how far along you are. Each slot is a chip with its count.

| Slot | What's in it |
|---|---|
| Hull (13) | dart; wing, needle, manta (early goals); arrow, talon, viper (credits); nova, phantom (cores; nova also comes with the starter pack); raptor (season pass); kite, comet (goals); halo (premium) |
| Paint (75) | plain colours for credits, rank paints (copper to pearl), a paint for each league, star paints, premium paints for cores, paints for finishing goals (one for each area you reach, and each place you master), aurora (login calendar), frost and ember (season pass), eclipse and opal (the vault) and regalia (premium) |
| Markings (13) | stripe, twin stripes, split, hazard (credits); dots, bands (cores); chevron, two-tone (stars); spine, wing tips, checker, nose cap (goals) |
| Fins (7) | tail fin, winglets, crest (credits); twin fins (stars); blade, swept fins (goals) |
| Engine colour (29) | single colours and two-colour flames (root to tip) for credits, cores, rank, goals and the pass |
| Wing decal (16) | your rank insignia, your league emblem, and pictures: flame, wings, rocket (credits); star, moon, target, crown, skull, bolt, laurel, atom, planet (goals) |
| Flame (11) | glow only; line, dashes, ion, long, twin, pulse (goals); triple (credits); wide (cores); ribbon (the vault); crown (premium) |

**Ways to get a look:** credits, cores, a rank, a league, set level stars, a
**goal**, the login calendar or the season pass, or the
vault. Each look says which on its card.

**Goals** (the bar's goals button) has three tabs. **Daily**: the login
calendar and today's three goals. **Weekly**: five harder goals, the same for
everyone, new every Monday (UTC), that span many runs (60 runs, 800 near
misses, beat your league's par in ranked twice...); each pays 150 credits and
400 pass XP, and all five 15 cores. **Achievements**: 53 long-term goals in four groups
(flying, skill, places, collection), each with a progress bar. They count what
the game already keeps, so a save that existed before has its progress already.
Finishing one unlocks a look to wear and is announced after the run; claiming
it pays credits and 30 rank XP. Examples: fly 50 runs, 10,000 near misses, a chain of
15, reach level 19 (the volcanic plain), score 4,000 in each area on its own,
finish all nine set levels, own 25 looks.

**Season looks** are made by code (`src/ship/seasonLooks.ts`), so every six-week
season brings new ones with no drawing and no app update. Each season has a
theme (a name like "hollow relay" and a base hue that steps round the colour
wheel) and makes nine looks: a paint, an engine colour, a wing decal and a
two-tone paint on the pass's premium track, a paint on the free track at tier
25, and two paints and two engine colours for 2,000 to 20,000 credits, one of
which the daily shop features each day of the season. Season 1's pass keeps its
hand-made looks, so it only adds the shop four. The catalogue follows the
server's clock once it's known (and a season turning mid-session), so a phone
set behind still gets a new season's looks; one set ahead loses next season's
looks again, except any it owns or wears. Colours keep clear of the
hand-made paints, decals are built from an outline, a mark and pips, and a look
stays in the catalogue for good once its season has come.
`CONFIG.seasons.overrides` renames, recolours or vetoes any of them.

**Sets** are themed groups of four or five looks you can buy (ember forge, deep sea, neon
night, royal guard, toxic waste, sunset strip). Own every look in one for a
bonus of cores.

## Cores and daily rewards

Everything here is in `src/economy/` and tuned in `CONFIG.economy`. Days
turn over at midnight UTC, the same moment for everyone, and weeks on Monday.
With the server they follow its clock (`server_now`, migration 0012), so
moving the phone's clock forward doesn't bring tomorrow's rewards; offline
they follow the phone's.

- **Cores** are the premium currency. They come slowly from play (login
  rewards, quests, the season pass) and, in the apps, from the store. They buy
  premium looks, revives and the pass's premium track, and swap for credits
  in the store (1 core for 25 credits). Ranked used to take a
  ticket a try; it's unlimited now, and older saves were paid 30 cores for each
  ticket they had beyond the week's 5.
- **Revive:** outside ranked, once a run, a crash offers to carry on (with a
  6 s timer). The first each day is free (two with premium), then
  an ad or 50 cores, the player's pick (with premium the ad is skipped). The
  ship goes back onto the safe lane, obstacles near the lane just ahead are
  cleared, it gets a shield and a moment of grace, and a 3-2-1 starts it
  again. Turning it down (or the Android back button) ends the run as it
  stood. On the boards a revived run counts as it was at the first crash.
- **Daily:** a 7-day login calendar (credits, cores, and the aurora
  paint on day 7), collected with a card when you open the game. A missed day
  just waits. Three **daily goals**, the same for everyone that day (play
  runs, score, reach a level, near misses, pickups, boost time, ranked runs,
  ship rooms), each paying 60 to 120 credits and 30 pass XP; all three pay 4
  cores. Every finished goal (daily, weekly or achievement) waits on the goals
  screen to be **claimed** with a tap; the bar's goals button has a dot while
  anything is waiting.
- **Rewarded ads** (the apps only; free for premium players): a revive once
  the free ones are used, doubling a run's credits from the end screen, a free
  daily gift card on the title screen (150 credits and 2 cores), and swapping
  one daily goal a day for another (free on the web, where there are no ads).
- **Shop:** a showroom, with the camera circling your ship above a sheet of
  cards; drag sideways over the ship to turn it yourself (a flick carries on,
  and the slow spin comes back a few seconds after you let go). At the top of
  the sheet, a **store card**: the season pass (time left, its hook, your
  tier) with a **buy cores** row under it, both opening the store. Then
  segmented tabs of looks (below), each with its timer, the same for everyone
  and turning over on the UTC clock. Tap a card to put the look on the ship, then
  buy it with the button under the cards (tap an owned one to wear it). A row
  of cards scrolls sideways, with a thin scroll bar under it.
  - **today:** four looks a day, at least one premium, one a deal at a quarter
    off. Looks you don't own come first, and the day's picks are kept for the
    day, so buying one doesn't reshuffle the rest.
  - **weekly set:** one themed set a week, as a bundle for what you're missing
    at a fifth off (in cores). Every set comes round once before any repeats.
    **see all** shows the whole set as a grid (and **show as row** goes back),
    and **try the set on** puts every look in it on the ship at once to see
    (tap **take the set off**, pick a single card, change tab or leave the
    shop and it comes off; nothing is put on for keeps).
  - **vault:** one rare look a month, for cores. When it goes it's away for the
    rest of the cycle.
- **Store:** one scrolling page, no showroom: the season pass first (time left,
  tier progress, what premium gives, unlock for cores or money), then the cores
  packs, the starter pack and premium as cards, swapping cores for credits, and
  restore at the bottom. Tapping cores in the top bar opens it (the shop's
  buy cores row opens it at the packs); on the web the
  real-money cards say they're in the Android app.
- **Season pass:** six weeks (six weekly runs), 30 tiers of 600 XP, paced so
  a regular player finishes in about five weeks. Runs earn XP (1 per 500
  points, up to 30), each daily goal 30 and each weekly goal 400. The free track pays credits and cores;
  the premium track (550 cores, or a purchase in
  the apps) pays more, with the frost and ember paints, the solar engine and
  the raptor hull. Rewards are paid as you reach each tier, and unlocking
  premium pays every premium tier already reached.
- **A refunded pass** (since 1.0.7, `0016`): the pass remembers whether
  premium was unlocked with cores or bought. When a bought pass is refunded,
  the server takes back the cores its premium tiers paid that season and pays
  no more of them, and the game closes the premium track when it next reads
  the purchase records (tiers already paid keep their looks and credits). A
  track unlocked with cores is never touched.
- After a run, the end screen lists any goals finished (to claim) and the pass
  XP earned, and the counters in the top bar bump as things land.

**Stats** (the service record's second tab) show runs, time played, distance, your best this
week, your endless best and your best in each solo environment, furthest
level, best chain, near misses, pickups, and where you crash most. Every run has a seed, and the same seed always builds the same course.

## Settings

Settings are under `settings` on the title screen or the pause menu, and
are saved on the device.

- **Sound:** sound on/off, and music and effects each at their own level (off, low, medium or full).
- **Controls:**
  - tilt to steer, and tilt sensitivity
  - touch steering: drag, or tap sides
  - drag sensitivity
  - where the boost button sits: right, left or middle
  - **left-handed layout:** the boost button swaps sides (right and left;
    the middle stays), and so do pause and the level at the top
  - double-tap and hold to boost, on or off
  - vibration: off, light (shorter, softer pulses in the same rhythm) or
    full; older saves' on/off became full or off
  - ask before closing (the Android app only, on by default): back on the
    title screen asks before it closes the game
  - **quick retry** (off by default): after a crash outside ranked and the
    tutorial, once any revive offer is settled, the game-over screen is left
    out. A small panel shows the score and best ("tap to fly again", and a
    main menu link), and one tap restarts. The retry lock (0.9 s,
    `CONFIG.crash.retryLockMs`) still holds, and runs again from the revive
    offer's answer. Stats, credits, bests, XP and goals are granted exactly as
    without it; the end screen's double-credits offer isn't shown
    (`src/core/retry.ts`).
- **Reminders** (the Android app only, off by default;
  `src/platform/reminders.ts`): a local notification at the time picked
  (8:00 to 21:00, 18:00 unless changed), once a day at most: "new ranked run"
  on a Monday (the game's week, UTC), otherwise "today's challenge is up" (or,
  before the daily challenge opens, "your daily reward is ready"). They're
  planned a week ahead and again whenever the game is opened, sent to the
  background or the setting changes; today's is left out once today's
  challenge is flown, and a player who stops playing hears nothing after that
  week. Android 13+ asks for permission only when reminders are turned on,
  never at start-up; a refusal turns them back off. After the 5th valid run
  the game offers them once ("a daily reminder?", remind me / no thanks), on
  the title with nothing else up. No push server: nothing is sent.
- **Display:**
  - reduce motion: no shake, roll or speed lines
  - text size
  - high contrast
  - **colour-blind mode** (`src/world/itemColours.ts`): blue against orange.
    Boost pickups turn blue; the power-ups blues and white, each its own
    shape (the shield a tall gem, the magnet a flat disc, slow-mo round),
    the same in the pickup cards; everything that ends a run (lava, molten
    metal, lava bombs and where they land, laser beams and warning lights)
    one orange
  - ghost of your weekly best, on or off
  - performance mode: a lower render scale and lighter snow and ash, for
    older phones
- **Assist mode:** 80% speed and teal markers along the safe line. Assisted
  runs never count as a best score.
- **Help:** replay the tutorial, replay tips, **pickups & power-ups** (the
  tutorial's recap), **what's new** (this version's card again), **send feedback** (also on the
  pause screen: a mail to tomblackdev@proton.me with the subject "Endless Space
  feedback", room to write, and the version and build, the device and Android
  version, and the screen it was sent from; `src/platform/feedback.ts`), help and
  contact, the privacy policy, ad privacy choices (in the app), and deleting
  your account. The version and build are at the bottom.

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

**What's new.** The first launch after an update shows a card (the
celebration card) with a few lines about the version, from
`src/ui/whatsNew.ts`. Never on a fresh install (the tutorial covers that) and
never twice: the last version seen is kept on the device, outside the cloud
save. Settings > help > what's new shows it again.

**Reporting a pilot.** Tap a pilot on a board, and under their service record
is a small "report" link (never on your own row): offensive name, impossible
score or other. One report per pilot a week. Three different pilots reporting
a name resets it to a generated "pilot-xxxx" (the game then asks them for a
new one); scores are only ever taken down by hand ([server.md](server.md)).

**Error reports.** Uncaught errors, unhandled rejections and the key failures
(Google sign-in, purchases, ads, the cloud save) are noted with the version,
platform, device model and screen, with emails, tokens and ids taken out
(`src/platform/errors.ts`). They wait on the device like runs in the outbox
and go to the server a batch at a time: 20 a session at most, each once.

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
hand-made section (`src/world/pieces/`) read row by row from its grid; the room's
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
new build drops the old build's cached scripts and styles. With a server
that can't be reached (no signal, or it's down), a quiet **offline** sits by
the wallet on the title screen, the boards say so (with your own best),
and everything on the device carries on: runs wait in the outbox, days
follow the phone's clock, and the game picks everything up again once the
server answers.
