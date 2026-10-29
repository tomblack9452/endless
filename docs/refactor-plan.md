# Refactor plan

The codebase grew feature by feature through AI-assisted sessions. This is the
plan for making it easier to keep changing, done in stages that each leave the
game working and every check green.

## Done (October 2026)

1. **Tooling.** Biome for linting and formatting (ESLint's TypeScript plugin
   doesn't support TypeScript 7, which has no JavaScript API); `npm run lint`,
   `fix` and `check`; lint in CI. The formatting commit is listed in
   `.git-blame-ignore-revs`.
2. **Browser tests** (Playwright, `tests/browser/`), as a safety net before moving
   code: first launch, the practice run, every menu and back, settings after a
   reload, a run with pause, a revive and game over. They found one real issue
   (vibration before the first tap).
3. **`game.ts` split** from 4,629 lines to about 1,900: twenty modules by
   responsibility (see [architecture.md](architecture.md)). Each move was
   mechanical, checked by the typecheck, the 723 unit tests and the browser tests.
4. **Styles split** from one 4,610-line `style.css` into 25 files by area; the
   built CSS is byte-identical.
5. **Assets and comments.** The UI's icons are SVG files; shared helpers are in
   their own modules; version tags and a stale economy comment are gone.

## Next

In order of value. Each is one session or so.

1. **Split `world/world.ts`** (about 3,600 lines): course generation (pure, seeded,
   tested) apart from Three.js drawing. The fairness and determinism tests
   protect this. It also lets the generator run headless, which the server replay
   work on `claude/wonderful-gates-6j1n4d` needs.
2. **The rest of `game.ts`:** the run lifecycle (`beginRun`, `crash`, `finishRun`,
   rewards) into `core/run.ts`, leaving `Game` as start-up and the loop.
3. **`ui/ui.ts` and `index.html`:** each screen's markup and view code together
   (`screens/<name>`), replacing string-built HTML with small builders.
4. **Performance:** a repeatable benchmark (the dev overlay's numbers at 360×640
   with 4× CPU throttling, as in 1.0.10), recorded before and after the world
   split; fix only what the numbers show.
5. **Test review:** look for tests that mirror the implementation or mock too
   much, and add browser tests for the shop's buy and try-on flows.
6. **Comments:** trim comments that narrate what the code already says, file by
   file as each one is touched.
