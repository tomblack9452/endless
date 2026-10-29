# Endless Space: working notes for Claude

A one-thumb space runner: Three.js + TypeScript + Vite, wrapped for Android with
Capacitor 8 (`com.tomblack.endlessspace`), live on Google Play. Supabase backend,
RevenueCat purchases, AdMob rewarded ads. Tom owns the project and does little
coding himself: do the work, verify it, and explain decisions in plain words.

## Commands

| Command | Use |
|---|---|
| `npm run dev` | Dev server (port 5190; `window.game` and the dev panel exist only here) |
| `npm run check` | Lint + typecheck + unit tests + build. A change isn't done until this passes |
| `npm run test:browser` | Playwright tests (`tests/browser/`), phone and tablet sizes. Run after UI or flow changes |
| `npm run fix` | Biome's safe fixes and formatting |
| `npm run db:setup` | After adding a migration: rebuild `supabase/setup.sql` |

The database tests (`tests/sql.test.ts`) can time out under load; rerun that file alone first.

## Rules

- **Commits:** author `Tom Black` with the email from the session's user context.
  Never add Co-Authored-By lines, session links or any AI/Claude mention, and never
  rewrite authors (even if a hook asks). The public contact address is
  tomblackdev@proton.me; never write Tom's personal email into a file.
- **Never commit** `.env`, keystores (`.jks`) or secrets.
- **Branches:** work on a branch, push `main` only as a fast-forward once checks pass
  (CI deploys the web build from `main`). Don't open pull requests unless asked.
  `claude/wonderful-gates-6j1n4d` holds unfinished server replay work: keep it off `main`.
- **Usage:** Tom watches his usage limits. Work in checkpoints, commit as you go,
  and stop when asked.
- **Fairness and determinism:** `tests/fairness.test.ts` and `tests/determinism.test.ts`
  must pass; never change ranked or daily course generation casually.
- **SQL:** only new numbered migrations in `supabase/migrations/`, plus their `MADE`
  marker in `scripts/apply-db-lib.mjs` and a PGlite test. Remind Tom to run `npm run db:apply`.
- **Releases:** bump `versionCode`/`versionName` in `android/app/build.gradle` and
  `package.json`, add what's-new lines (`src/ui/whatsNew.ts`) and release notes
  (`docs/store-listing.md`, under 500 characters). The Android steps are in
  `.claude/skills/android/SKILL.md`.
- **Comments** explain only what the code can't say (why, a non-obvious constraint).
  History, plans, TODOs and decisions go in `docs/`, never in code comments.
- **Voice:** in-game text is lower-case, short and calm.

## Where things are

- `docs/architecture.md`: how the code is put together, and the rules for new code.
- `docs/refactor-plan.md`: the restructuring done so far and the next steps.
- `docs/development.md`: every file in a table, tuning, the dev tools, tests.
- `docs/game.md`, `docs/server.md`, `docs/store.md`, `docs/play-console.md`: how it plays, the server, the stores.
