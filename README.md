# Endless Space

A minimal 3D endless runner for phones. You steer a small ship across alien
ground, through canyons and asteroid belts, and down the rooms of a starship,
dodging everything in the way. It's built with Three.js, TypeScript and Vite,
and is set up for Capacitor packaging (app id `com.tomblack.endlessspace`).

Everything is procedural: the courses, the textures, the props, the sound
effects and the music. There are no image or audio files apart from the app
icons.

## Contents

- [Running it](#running-it)
- [Controls](#controls)
- [How it plays](#how-it-plays)
- [Themes and biomes](#themes-and-biomes)
- [Scoring, boost and power-ups](#scoring-boost-and-power-ups)
- [Missions and the hangar](#missions-and-the-hangar)
- [Other modes](#other-modes)
- [Settings](#settings)
- [Sound](#sound)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Tuning](#tuning)
- [Dev tools](#dev-tools)
- [Testing](#testing)
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
| `npm test` | Fairness tests (see [Testing](#testing)) |

## Controls

| | Phone | Desktop |
|---|---|---|
| Steer | Drag anywhere, tap the sides, or tilt | Arrow keys or A / D |
| Boost | Hold the boost corner (bottom right, or left in settings) | Shift, W, Up or Space |
| Pause | `pause`, top right | Esc or P |
| Start / retry | Tap | Space or Enter |

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

**Open ground.** Mushroom trees, spire trees, crystals and boulders. Level 2
adds rock clusters. Level 3 is a forest path: dense forest on both sides of
a winding, clear path. Open ground has rolling hills. They change the view
only, and the ship noses up and down with the slope.

- *Ice field:* pale ground and sky, mostly crystals and spires.
- *Volcanic plain:* dark basalt, a smoky sky, glowing lava cracks, and a
  light ship so it stays visible.

**Canyon.** Rock walls that wind, with bands of rocks and pillars across
the floor and gaps through them. Obstacles are dark so they read against the
walls.

- *Asteroid belt:* the same layout in space. The ground falls away, the sky
  opens to stars and the galaxy, and the rock turns grey.

**Interior.** A chain of rooms joined by corridors. Rooms vary in width,
height and offset, with S-bends, corridor jogs and splits where the path
forks:

- cargo bay
- server hall
- observation deck (open to space, with a galaxy and shooting stars)
- maintenance shaft
- junction
- three-way fork
- split
- bulkhead maze
- chicane
- hydroponics
- laser gates
- reactor
- piston hall (sliding blocks)
- hangar (ends in blast doors that close down to the lane as you arrive)
- reactor collapse (debris crashes down around you)
- maintenance gantry and hull breach (big holes in the floor against the
  walls; fall in and the run ends)

Walls are dressed with pipes, panels, cables and canisters, and the ship's
outer hull shows outside the windows.

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
    get clear. It doesn't save you from falling into a pit.
  - **Magnet** (purple): pulls boost pickups ahead towards you for 9 s.
  - **Slow-mo** (green): drops you to 62% speed for 6 s.

## Missions and the hangar

Three missions are active at a time, drawn from:

- reach a level
- score in one run
- near misses
- chain length
- pickups
- boost time
- ship rooms passed
- daily runs played
- score without boosting

Each one gets harder every time you complete it.

Every completed mission unlocks the next cosmetic, in a fixed order. You
pick your cosmetics in the **hangar**:

- **Ships:** dart, wing, needle, manta. All share the same hitbox.
- **Trails:** none, line, dashes, ion. The trail traces your actual path.
- **Colours:** bone, tidewater, clay, lichen, ink, ember. At each loop of
  the themes the world fades to your next unlocked palette.

## Other modes

- **Checkpoints:** once you've reached the canyon or the interior, the
  title screen lets you start there. Checkpoint runs score from zero.
- **Daily run:** the same course for everyone on a given date, built from a
  hash of the date. It keeps its own best.
- **Stats:** runs, time played, distance, best score, furthest level, best
  chain, near misses, pickups, and where you crash most.
- **Seeds:** every run has a seed, and the same seed always builds the same
  course.

## Settings

Settings are under `settings` on the title screen or the pause menu, and
are saved on the device.

- **Sound:** sound on/off, music level, effects level.
- **Controls:**
  - tilt to steer, and tilt sensitivity
  - touch steering: drag, or tap sides
  - drag sensitivity
  - which corner the boost button sits in
  - vibration
- **Display:**
  - reduce motion: no shake, roll or speed lines
  - text size
  - high contrast
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
`clearOf` checks against the lane. Interior rooms are reusable templates
(`interior.ts`). Each room supplies its width, lighting, layout and decor
through a small API, and the world handles walls, floors, pits, splits and
the transitions between rooms.

**Look.** Block textures are drawn to canvases at startup and mapped in
world space through a material patch. Props are low-poly meshes with shading
baked into vertex colours, so there's no lighting cost. Colours come from
one live palette. Time of day, theme blends, biome tints, events and palette
cross-fades all write into it each frame. Rolling hills are one height
function, used by both the instance matrices and a ground vertex shader.

**Performance.**
- All the obstacles draw in a few dozen calls.
- The pixel ratio adapts: it steps down after a run of slow frames and back
  up when there's headroom.
- three.js ships as its own chunk so it stays cached between updates.
- The build includes Latin font files only.

**Offline.** The production build registers a service worker and a web
manifest, so the game installs to a home screen and works offline.

## Project layout

| File | What it does |
|---|---|
| `src/config.ts` | Every tunable value |
| `src/game.ts` | State machine, main loop, scoring, boost, power-ups, menus |
| `src/world.ts` | Pools, theme generators, safe lane, pits, rooms |
| `src/interior.ts` | Ship room templates and wall decor |
| `src/field.ts` | Instanced pool: collision, sine and ramp motion |
| `src/props.ts` | Low-poly trees, rocks, crystals, shuttles, pipes, gems |
| `src/biomes.ts` | Biome looks and names |
| `src/terrain.ts` | Rolling hills (JS and GLSL) |
| `src/events.ts` | Meteor shower, sandstorm, red alert |
| `src/player.ts` | Ship shapes, shield, banking, crash and fall |
| `src/trail.ts` | Ship trails |
| `src/renderer.ts` | Renderer, camera, ground, planet, adaptive resolution |
| `src/sky.ts` | Stars, galaxy, shooting stars |
| `src/atmosphere.ts` | Day/night and theme colour blending |
| `src/palette.ts` | Live palette shared by every material |
| `src/blockTextures.ts` | Procedural metal textures |
| `src/speedLines.ts` | Boost streaks |
| `src/input.ts` | Drag, side taps, tilt, keyboard, boost control |
| `src/missions.ts`, `src/cosmetics.ts` | Missions and unlocks |
| `src/progress.ts` | Stats, checkpoints, daily seed |
| `src/settings.ts` | Settings table and storage |
| `src/hints.ts`, `src/haptics.ts` | First-run hints, vibration |
| `src/rng.ts` | Seeded random numbers (mulberry32) |
| `src/audio/` | Sound engine, synth helpers, generative music |
| `src/ui.ts`, `src/style.css`, `index.html` | HUD and screens |
| `src/dev.ts` | Dev-only panel |
| `tests/fairness.test.ts` | Headless survivability test |
| `public/` | Icons, manifest, service worker |

## Tuning

Nearly every number lives in `src/config.ts`, grouped by system:

- `speed` and `score`: pace, level length, near-miss rules
- `field`: spawn depth and pool sizes
- `themes`: lane rules, open ground, canyon, every interior room
- `boost` and `powers`: pickups and power-ups
- `events`, `biomes`, `terrain`: weather, biome looks, hills
- `assist`: assist mode
- `audio`: every gain, the music and the engine
- `render`: pixel ratio and adaptive-resolution thresholds

After changing anything in `themes`, run `npm test`.

## Dev tools

On the dev server only, a `dev` link opens a panel with:

- **Start just before** any level from 1 to 27
- **Invincible** and **full boost** toggles
- **Replay seed:** replays the last run's course
- **Ship room:** forces every interior room to one type
- an FPS readout with the pixel ratio and draw calls

`window.game` is exposed in dev builds for poking at state from the
console. None of this is in production builds.

## Testing

`npm test` runs `tests/fairness.test.ts` headlessly with Vitest. For 8
seeds, an autopilot follows the recorded safe lane from the start of every
theme across the first two and a half loops. That covers every biome. It
steers at the normal limit with no boost, and any crash or fall fails the
test. A guard test checks that a ship that never steers does crash, so the
harness can't pass by accident.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which runs the tests,
builds, and publishes `dist/` to GitHub Pages. Other branches run
`.github/workflows/test.yml` (typecheck and tests).

To turn Pages on: in the repo, open **Settings → Pages**, set **Source** to
**GitHub Actions**, then re-run the workflow.
