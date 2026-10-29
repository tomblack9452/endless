# Architecture

How the code fits together, and the rules for adding to it. The file-by-file
table is in [development.md](development.md#file-table).

## The shape

```
main.ts ── Game (core/game.ts) ── owns the shared state and the loop
             ├─ navigation, revives, powers, courseRuns, purchases, connection, devTools   (core/)
             ├─ title, settings, shop, hangarScreen, goals, boards, record, solo, account, firstLaunch   (screens/)
             ├─ reminders (platform/reminderPrompts.ts), ranks (progression/rankKeeper.ts)
             ├─ World, Player, Stage, Sky, Sound … (world/, ship/, audio/: the simulation and drawing)
             ├─ UI views (ui/): ui.ts fills index.html's screens; economy/view.ts, ui/hangarView.ts …
             └─ models (progression/, economy/, store/, ads/, server/): plain classes and functions, unit tested
```

- **`Game`** creates everything, runs `requestAnimationFrame`, and holds the run's
  state machine (`title → countdown → playing → crashed / finished`). It keeps the
  state several parts share: the wallet, settings, the world, the current mode.
- **Feature modules** (`core/navigation.ts`, `screens/shop.ts` and the rest) are
  classes built as `new X(this)` in `Game`. Each holds its own state and reaches
  what it shares through `this.g` (the `Game`). They import only the `Game`
  *type* from `game.ts`, never values, so there are no runtime import cycles.
- **Models** (`progression/`, `economy/`, `store/`, `server/` …) know nothing of
  the DOM or Three.js. They're where the rules live, and where the unit tests are.
- **Views** (`ui/`, `economy/view.ts`) turn a model's view object into DOM. The
  markup for every screen is in `index.html`; the styles are in `ui/styles/`,
  one file per area, imported in cascade order by `ui/style.css`.
- **World** (`world/`) builds the course from a seed (deterministic: ranked and
  the daily challenge depend on it) and draws it with Three.js. `world.ts` is
  both: splitting generation from drawing is the next big step (see the plan).

## Data and the server

- Everything saved goes through `core/storage.ts` (localStorage under `endless.*`).
- `server/backend.ts` is one interface with two implementations: `supabase.ts`
  and `local.ts` (no server). Runs go through `server/outbox.ts`, which retries
  on no signal and drops a rejected run. Cores changes queue in
  `progression/wallet.ts` until the server takes them; each spend carries an id
  the server takes once (`0024_spend_once.sql`).
- The server's clock decides days, weeks and seasons (`server_now`).

## Rules for new code

- **Put it where its responsibility is.** A screen's logic goes in `screens/`,
  its view in `ui/` (or next to its model), its styles in `ui/styles/<area>.css`,
  its rules as a plain module with a unit test. Don't grow `game.ts`: add a module
  and give it `this.g` if it needs shared state.
- **Keep modules small and single-purpose** (aim for under ~400 lines). If a file
  needs a section heading to be navigable, it's probably two files.
- **Assets are files.** Fixed icons are SVGs in `src/assets/icons/` (imported
  with `?raw`). Art that depends on the player's looks (ship portraits, decals,
  season looks) is drawn in code because it's combinatorial.
- **No per-frame allocation** in the loop (`frame`, `update*`, `world`, `field`):
  reuse vectors and arrays, and write to the DOM only when a value changes.
- **Tests check behaviour,** not implementation: a rule's outcome in a unit test,
  a flow in a browser test. Every bug fixed gets a test that would have caught it.
- **Determinism:** anything random in ranked or the daily challenge comes from
  the course seed (`core/rng.ts`).
