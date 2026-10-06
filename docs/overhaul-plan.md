# Overhaul plan

The brief, rewritten to be specific and checkable; what the audit found; how the
remaining work will be built; and what comes after. Status is at the bottom of
each section and kept current as work lands.

## 1. The brief, rewritten

> Work on the Endless Space repo (Three.js, TypeScript, Vite; procedural everything).
> Keep `npm test` and `npm run typecheck` green at every commit. Courses must stay
> deterministic from their seed and survivable from the safe lane.
>
> **A. Audit collisions.** For every solid item in the game (rocks, trees, crystals,
> cacti, mesas, tumbleweeds, lava bombs, arches, bridges, interior blocks, lasers,
> vents, shuttles), confirm what the ship is tested against matches what is drawn:
> no flying through a visible object, no invisible walls, nothing solid floating
> above the ship. Fix what is wrong and add a test that walks every live instance in
> every area so it can't regress.
>
> **B. Overhaul the asteroid belt and the volcanic plain.** Each should feel like its
> own place with its own hazards, not a recolour of another area. The asteroid belt
> is currently the canyon generator with grey rocks; the volcanic plain is open
> ground with lava lakes and falling bombs. Design new set pieces, new hazards that
> telegraph before they hurt, and a difficulty curve across the area's three levels.
> Every new hazard must have a collision shape that matches its mesh, never touch
> the safe lane at the moment the ship arrives, and be covered by the fairness tests.
>
> **C. Solo progression.** Solo environments open only as the player reaches them
> in the endless order, and the game says how far off the next one is: on the locked
> tiles, on the solo screen, mid-run when one opens, and on the game-over screen.
>
> **D. Leaderboards.** A global leaderboard on Supabase: this week's ranked run per
> league, endless, and one board per solo environment, with pilot names. Runs are
> checked by the server, survive a missing signal, and the whole thing is set up by
> pasting one SQL file and adding two keys. Without keys the game still works.
> Design it before building it and say what the server does and does not prevent.
>
> **E. Shop revamp.** A much larger catalogue of cosmetics, each earnable in play or
> purchasable, with a clear path to every item, a collection screen showing what's
> left and how to get it, and a shop that rotates. Nothing sold changes how the ship
> flies: every hull keeps one hitbox and ranked ignores upgrades above the league cap.
>
> **F. What's next.** A prioritised list of features after this, with reasons.

## 2. What the audit found

### Collisions: fixed (A)

Walking every live instance across every area against its mesh found real bugs:

| Item | Problem | Fix |
|---|---|---|
| Mesas | Spawned solid with a hitbox, but never in the list the ship is tested against: the "mesa collision" change did nothing | Added to the tested pools |
| Tumbleweeds | Rolled straight through the ship (README said solid) | Solid, and the roll always ends clear of the safe lane (it flips direction or is skipped) |
| Crystals on islands and spines | Hitbox 0.45-0.62 of size against a 0.68 shape: visibly clipped | Use the shared crystal hit size |
| Rock spires | Drawn up to 20% wider than their hitbox when squashed | Hit size 0.68 -> 0.78 |
| Upper laser beam | Solid and counted as a second near miss, but 0.6 above the ship (which is 0.22 tall) | Look only; the lower beam does the work |

`tests/collisions.test.ts` runs 21 levels x 3 seeds, reads each pool's mesh with real
cross-sections at ship height and fails on: solid but never tested, solid with no
hitbox, drawn wider than hit, hit much wider than drawn (invisible wall), and solid
but floating above the ship.

Known and left as is: lava bombs collide at their landing spot only (they land well
ahead of the ship, off the lane); square hitboxes on slightly oblong shapes (bushes)
are a little long in depth, which is forgiving in the wrong direction by about 0.3.

**Status: done.**

### Solo progression (C)

Set levels already opened one at a time. Environments were all open. Now each opens
when a ranked or endless run reaches the level where its area first appears (canyon
4, ship 7, ice 10, asteroids 13, volcanic 19). Solo runs, set levels and dev starts
don't count, so you can't open the next by flying the last for long. Older saves
start from the first level of the furthest sector they'd reached.

**Status: done** (`src/unlocks.ts`, `tests/unlocks.test.ts`).

### Leaderboards (D)

The repo already had Supabase accounts, a cloud save, cores and a weekly board per
league. What was missing: boards for endless and solo, names, retry when offline,
checks that run in the database (no function to deploy), a one-paste setup, and the
deploy workflow passing the keys to the build (it didn't, so the live site could
never have used the server). Design and limits: [leaderboards.md](leaderboards.md).

**Status: done.** Left for you: create the project, paste `supabase/setup.sql`, turn
on anonymous sign-ins, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (local
`.env` and repository secrets), then `npm run check-server`.

## 3. Asteroid belt and volcanic plain (B)

### The asteroid belt

Today: the canyon generator with a dark palette, no ground and no cacti. Walls wind
through space, bridges span chasms with nothing under them. It reads as "a canyon in
the dark".

Design: open space. No walls; the lane threads a drifting field.

- **Drift field** (level 1): scattered rocks of every size, a few on slow sideways
  drifts. Moving rocks use the field's distance-based sine motion, so where one will
  be when the ship arrives is known to the generator, as with pistons.
- **Clusters and gates** (level 2): dense knots of rocks with a wide gap on the lane,
  and "gates", two big asteroids with a gap between.
- **Orbiters and ring** (level 3): rock pairs on opposed sines that open and close,
  timed so the lane is clear at arrival; a slow rock ring around a big asteroid.
- **Wreckage:** hull plates and girders as hazards and scenery, a hint of a story.
- Scenery: a huge asteroid and a planet on the horizon, parallax dust, and the
  existing meteor-shower event for extra streaks (look only).

Every piece is a function of distance and seed, so the course stays deterministic.

### The volcanic plain

Today: open ground, dark basalt, glowing cracks, lava lakes off the lane, bombs
that land off the lane.

Design: make the ground itself the hazard.

- **Lava rivers** cross the lane in places; a basalt causeway carries the lane
  across, wider on level 1, narrowing and cracking later.
- **Geysers**: vents that erupt on a distance cycle with a glow beforehand (the
  field's pulse motion), placed off the lane or timed to be down on arrival.
- **Eruption bursts**: before a salvo of bombs the ground shakes and the sky flares;
  rings mark each landing as now.
- **Basalt columns and obsidian spires** replace some of the generic rocks, and
  ash thickens as before.

### Acceptance

Both areas pass `fairness`, `courses` and `collisions` tests across all seeds, the
README's area descriptions are rewritten, and a screenshot of each level of each area
is checked by eye.

**Status: see the end of this file.**

## 4. Shop revamp (E)

Today: a daily shop of four looks, a showroom camera, core packs, tickets and a pass.
The catalogue is ~60 items across six slots.

Design goals:

1. **A bigger catalogue** in more slots: hulls, paints, markings, fins, engine colours,
   wing decals, plus trails, nameplate titles and badges (for the leaderboard rows) and
   world palettes.
2. **Every item has a path**: bought with credits, bought with cores, or earned by a
   named goal (a rank, a league, stars, a mission, a level reached, a leaderboard
   place, a login streak, the pass). Items show how to get them when locked.
3. **A collection screen**: per slot, owned/total, and the nearest goal for each
   locked item.
4. **A rotating shop**: daily picks plus a weekly featured set and a rare "vault"
   item, all seeded by date so everyone sees the same.
5. **No pay-to-win**: looks only; one hitbox for every hull.

**Status: not started** (queued after the asteroid and volcano work).

## 5. What's next, in order

1. **Re-fly ranked runs on the server.** The weekly run is deterministic, so a ranked
   score could be verified by replaying the path. It needs the run simulation pulled
   out of `game.ts`. This is what makes the weekly board trustworthy.
2. **Sign in with Apple and Google.** Anonymous accounts are lost with the app;
   linking keeps progress and the pilot name across devices (needed before the store
   launch).
3. **Friends and rivals.** Follow a pilot, see friends' bests on each board, and
   beat-your-rival notices. Cheap on top of the boards.
4. **Replay ghosts from the board.** Fly against the ghost of the player above you
   (ranked paths are already stored).
5. **Seasons.** Reset ranked leagues and the pass on a schedule with an end-of-season
   reward by placement.
6. **A tutorial run and onboarding.** First-run hints exist; a short scripted first
   level would help retention.
7. **Daily challenge run**: one seed a day with its own board (the daily seed code
   exists; the board system now makes it cheap).
8. **Performance and accessibility pass**: colour-blind palettes for hazards, and a
   frame-time budget per area on low-end phones.
9. **Moderation tools**: a report button and an admin view over `players.hidden`.
