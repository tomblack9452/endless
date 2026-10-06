# Roadmap

What comes next, in order, for a live mobile game with a premium unlock and
in-app purchases. The finished work (collision audit, the asteroid belt and
volcanic plain, solo unlocks, leaderboards, the shop and the hangar) is described
in the README.

## Built (October 2026)

The agreed plan in [design.md](design.md): unlimited ranked and a rank earned
from all play, a rebalanced economy, generated season looks, premium and the
ads layer (rewarded placements), entitlements, the new front page and bottom
bar, the goals hub with weekly goals and claiming, the shop's tabs, and
onboarding with a practice run.

## Before the store launch

1. **Sign in with Apple and Google.** Anonymous accounts are lost with the app;
   linking keeps progress, purchases and the pilot name across devices.
2. **Set up the stores and AdMob** ([store.md](store.md)): the products
   (including `premium`), RevenueCat, the AdMob ad units and app ids, and the
   consent messages.
3. **Re-fly ranked runs on the server.** The weekly run is deterministic, so a
   ranked score can be checked by replaying its path. It needs the run simulation
   pulled out of `src/game.ts`; it is what makes the weekly board trustworthy.
4. **Limited offers from the server** (designed in design.md): an `offers` table
   and a live card on the front page.

## After launch

5. **Seasons for leagues.** Reset ranked leagues with the pass, with a reward by
   placement.
6. **Friends and rivals.** Follow a pilot, friends' bests on each board, and
   beat-your-rival notices.
7. **Ghosts from the board.** Fly against the pilot above you (ranked paths are
   already stored).
8. **A daily challenge.** One seed a day with its own board.
9. **Performance and accessibility.** Colour-blind hazard colours, and a
   frame-time budget per area on low-end phones.
10. **Moderation.** A report button and an admin view over `players.hidden`.
11. **Interstitials, if the numbers say so.** Off at launch; the caps are ready.
