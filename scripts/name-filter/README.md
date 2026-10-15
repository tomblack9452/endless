`profane-words.json` is from https://github.com/zautumnz/profane-words
(WTFPL). `npm run names:build` turns it into `src/platform/nameWords.json` (the game's
copy) and the inserts in the name filter migration. The rules are in
`src/platform/nameFilter.ts` and `name_blocked()` in the database; keep them the same.
