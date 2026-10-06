# Roadmap

What comes next, in order, for a live mobile game with a premium unlock and
in-app purchases. The finished work (collision audit, the asteroid belt and
volcanic plain, solo unlocks, leaderboards, the shop and the hangar) is described
in the README.

## Before the store launch

1. **Sign in with Apple and Google.** Anonymous accounts are lost with the app;
   linking keeps progress, purchases and the pilot name across devices.
2. **The premium unlock.** One purchase that removes ads and gives a few looks only
   premium players have. It needs a RevenueCat entitlement, a `premium` unlock kind
   in `src/looks.ts` (owned while the entitlement is active) and its looks in
   `src/catalogue.ts`. The store layer is in `src/store/` and [store.md](store.md).
3. **Ads.** Rewarded ads for the revive and a ticket refill; interstitials between
   runs at most every few minutes, none for premium players.
4. **Bulk packs.** Four core packs, a starter pack and the season pass are set up
   ([store.md](store.md)). Credit packs are the missing piece: products in the
   stores, and the webhook crediting them like cores.
5. **Re-fly ranked runs on the server.** The weekly run is deterministic, so a
   ranked score can be checked by replaying its path. It needs the run simulation
   pulled out of `src/game.ts`; it is what makes the weekly board trustworthy.

## After launch

6. **Seasons.** Reset ranked leagues and the pass on a schedule, with a reward by
   placement.
7. **Friends and rivals.** Follow a pilot, friends' bests on each board, and
   beat-your-rival notices.
8. **Ghosts from the board.** Fly against the pilot above you (ranked paths are
   already stored).
9. **A first-run tutorial.** A short scripted first level.
10. **A daily challenge.** One seed a day with its own board.
11. **Performance and accessibility.** Colour-blind hazard colours, and a
    frame-time budget per area on low-end phones.
12. **Moderation.** A report button and an admin view over `players.hidden`.

## Worth a look

- **Ranks and leagues overlap.** Ranked runs feed both a rank ladder (XP and skill,
  unlocking paints) and leagues (league points, upgrade caps, weekly credits).
  Players may find two progressions for one mode confusing; folding the rank
  ladder into leagues would remove a screen and a set of rules.
