# Design review: progression and paid features

> **Planning, mostly built.** This was the design before the October 2026
> work. Its decisions were built (see [roadmap.md](roadmap.md), "Built"), so
> "nothing here is built yet" and the "today" numbers below describe the game
> before then. Where the two differ, the README and `src/config.ts` are the
> current rules (e.g. revives: one free a day for everyone, two with premium,
> then an ad or 50 cores; never in ranked).

Phase 0 of the front page, goals and paid features work: what the game's
progression is today, what the numbers say, how it compares with the genre, and
a design for paid features. It ends with the decisions that are yours. Nothing
here is built yet.

## Summary

The numbers point to six problems, in order of how much they matter:

1. **Credits have nowhere to go.** Everything credits buy (upgrades and 41 looks)
   costs 274,500 in total. A regular player earns that in about three months.
   After a year the casual player has 419,000 unspent, the regular about a
   million, the heavy two million. Credits stop meaning anything after the first
   month or two.
2. **Runs barely pay.** For a casual player, flying earns 9% of their credits:
   a 4,000-point run pays 20. Daily quests pay 44% and the league's weekly
   reward a quarter. The thing you do most is the thing that pays least.
3. **The season pass is over in days.** It's meant to last six weeks. A casual
   player finishes all 30 tiers in about 16 days, a regular in 4 or 5, a heavy
   player in 1. Then it has nothing left to say until the next season.
4. **Tickets wall off the main mode.** Ranked, the mode that drives leagues,
   upgrades and rank, is limited to 5 to 11 tries a week. Rank XP only comes from
   ranked, so the casual player is still at bronze 1 after three months, with a
   pile of credits they can't spend (upgrade tiers 3 to 5 need leagues).
   Tickets bought with cores also mean more tries at the weekly board: a paid
   edge.
5. **Paid edges on the boards.** Revives (paid in cores after the free one
   each day) count on the endless and solo boards. So do tickets on ranked (more
   attempts, better best).
6. **Too many numbers.** A new player meets credits, cores, tickets, rank XP,
   skill, league points, upgrade points and pass XP: eight. Rank and league are
   two ladders for one mode.

The recommended direction (section 5):
- Make runs the main source of credits.
- Give credits a long-term sink.
- Slow the pass to fit its six weeks.
- Make ranked unlimited.
- Turn rank into a pilot level earned from all play.
- Keep every paid thing off the boards.
- Sell looks, the pass, a one-off premium unlock and convenience. Never power,
  and never credits.

## 1. The loops today

| Loop | You do | You get | How often | What it's for |
|---|---|---|---|---|
| Runs | fly solo, endless, ranked | 1 credit per 200 points (ranked 1 per 100), pass XP (1 per 250 points, 60 at most) | every run | the core loop |
| Upgrades | spend credits | +1 upgrade point a tier; better boost, pickups, shield, steering | 30 tiers, 500 to 25,000 credits | make the ship stronger |
| Leagues | ranked runs vs a par | league points; divisions (300 to 2,100 credits), promotion (2,000 to 50,000), weekly credits (1,000 to 15,000) | 100 LP a division | fair brackets by ship power; gate upgrade tiers 3 to 5 |
| Rank | ranked runs | XP (double for the first 3 a day), skill vs par; 9 rank paints; promotion credits | 35 ranks to general g4 (50,000 XP, skill 50) | lifetime level |
| Tickets | | 5 ranked tries a week, more for 30 cores, 5 from the login calendar | weekly | limit ranked (an energy system) |
| Login calendar | open the game | 7 days: credits, cores, tickets, a paint on day 7 | daily | come back each day |
| Daily quests | 3 small tasks | 150 to 400 credits and 60 pass XP each; 10 cores for all three | daily | play a little every day |
| Season pass | earn pass XP | 30 tiers in 6 weeks; free track (6,000 credits, 15 cores, 6 tickets); premium (950 cores or a purchase: 8,800 credits, 170 cores, 4 tickets, 4 looks) | per season | a reason to play all season; revenue |
| Goals | lifetime counts | 53 goals: 34,000 credits and a look each | long term | collection and direction |
| Shop | spend | 4 looks a day, a weekly set (20% off), a monthly vault look; core packs | daily, weekly, monthly | rotation, revenue |
| Revive | crash in solo or endless | carry on: free once a day, then an ad or 50 cores | per run | convenience, revenue |
| Looks | | 157: 9 free, 53 goals, 41 credits, 23 cores, 9 rank, 6 league, 6 stars, 5 rewards, 5 vault | | expression |

## 2. The numbers

**How:** a day-by-day model drives the game's own `Ranked`, `Leagues`,
`Upgrades`, `Pass`, `Daily` and `Tickets` classes and the real goals and looks
for one year from a season's start. It spends credits on the cheapest upgrade
tier it's allowed.

Each player's typical score grows with the runs they've played, from 1,500
towards a ceiling. Each run varies around that by about ±45%.

| | casual | regular | heavy |
|---|---|---|---|
| Plays | 5 runs a day, 5 days a week | 15 a day, 6 days | 40 a day, every day |
| Typical score ceiling | 6,000 | 10,000 | 16,000 |
| Ranked tries (as many as tickets allow) | 1 a day | 2 a day | 5 a day |

Set levels are every 8th solo run. Run lengths come from the real speed curve:
4,000 points is 1:41, 10,000 is 3:46.

These are assumptions, so read the results as rough sizes, not exact days.

### Milestones (days from first launch)

| | casual | regular | heavy |
|---|---|---|---|
| Play time a day, average run | 11 min, 2:13 | 53 min, 3:32 | 3.5 h, 5:19 |
| Ranked runs a week (tickets) | 5 | 9.6 | 11 (wanted 35) |
| First upgrade | 1 | 0 | 0 |
| Silver / gold league | 137 / 217 | 28 / 46 | 14 / 23 |
| Platinum / diamond | not in a year | 64 / 92 | 35 / 43 |
| Whole ship (30 points) | not in a year (18 points) | 92 | 43 |
| Grand champion | not in a year | 190 | 68 |
| Pass: all 30 tiers (season is 42 days) | ~16 days | 4 to 5 days | 1 day |
| 25 looks without buying any | 7 | 3 | 0 |
| Looks at 30 / 90 / 365 days (of 157) | 35 / 44 / 57 | 58 / 71 / 79 | 69 / 78 / 81 |
| Rank at 30 / 365 days | corporal g2 / major | gunnery sgt g3 / brigadier g2 | lieutenant g3 / general g2 |
| Credits unspent at a year | 419,000 | 990,000 | 2,040,000 |
| Free cores a year | 4,900 (~95/week) | 6,100 (~117/week) | 6,700 (~129/week) |
| Free cores first cover a premium pass (950) | day 77 | day 56 | day 53 |

### Where credits come from (first year)

| Source | casual | regular | heavy |
|---|---|---|---|
| Daily quests | 185,000 (41%) | 242,000 (20%) | 275,000 (12%) |
| League weekly reward | 109,000 (24%) | 470,000 (38%) | 560,000 (25%) |
| Season pass (free) | 54,000 (12%) | 54,000 (4%) | 54,000 (2%) |
| Runs (solo, endless, ranked) | 43,000 (9%) | 245,000 (20%) | 1,168,000 (51%) |
| Login | 26,000 | 32,000 | 37,000 |
| Goals | 19,000 | 29,000 | 33,000 |
| Rank, division and league promotions | 19,000 | 163,000 | 162,000 |

### What it says

- **Credits:** income is far above the sinks (274,500 in all), and the casual
  player can't spend theirs because leagues gate upgrade tiers 3 to 5. After the
  first month credits do nothing for anyone.
- **Runs** pay too little next to quests. Quests were meant as a nudge, not the
  salary.
- **The pass** is paced for ~3,600 XP a season, but quests alone give 180 a
  day. It needs about four times the XP, or fewer XP sources.
- **Cores:** free players get ~100 to 130 a week. That's enough to buy every
  core look (3,800) and the vault (2,450) within a year, and a premium pass
  every season or two. Generous for a premium currency: it's worth about £1 a
  week at pack prices.
- **Pass pricing doesn't add up:** 950 cores costs about £8 in packs, but the
  same pass is £4.99 as a purchase.
- **First week:** 25 looks in a week (goals come fast early) is a good first
  week. By day 90 the casual player has 44 looks and few new ones coming:
  looks need a steady supply, not a big early burst.
- **Rank** is a 1 to 2 year ladder, which is fine for a lifetime level. But it's
  fed only by ranked, so it moves only as fast as tickets allow.

## 3. Compared with the genre

From the public, long-running versions of these games; check the current ones
before copying anything exactly.

| Game | Brings you back with | First session | Sells |
|---|---|---|---|
| Subway Surfers | Missions in sets (each set raises a permanent score multiplier); daily challenge; seasonal hunts; a world tour of city updates with new characters and boards | You're running in seconds; the tutorial is the first run | Keys (premium currency: revives at a rising price), coins, characters and boards, mystery boxes, ad-free and ad rewards |
| Jetpack Joyride | Three missions at a time; finishing them raises your mission rank and pays coins | Straight into a run | A one-off coin doubler, coins, vehicles and outfits; ads for a free spin or revive |
| Temple Run 2 | Objectives and levels; daily challenges; global events | Straight into a run | Gems (revives at a rising price), coins; ability and power-up upgrades with coins |
| Alto's Odyssey | Goals in sets of three that level you up; workshop items with coins; zen mode | A calm first run | Coins, items; ad-free versions |
| Crossy Road | Free gifts every few hours; a prize machine; daily challenges | One tap to play | Characters directly for money; ads for coins |
| Hill Climb Racing 2 | Cups and seasons; team events; chests; daily and weekly challenges | A guided first race | Gems, a VIP / season pass, chests, vehicle parts (these give power) |

**What they all do that we don't:**
- The first run starts within seconds. There's no form to fill first; names and
  settings come later.
- Each run visibly earns soft currency (coins on the track) and spends it on
  something you can see.
- A steady stream of new content: seasons or events with themed items.
- Revives priced in premium currency at a rising price in a run, or an ad.
- A one-off purchase that improves the game for good (a coin doubler, ad-free).

**What we have that they don't:** fair ranked play in brackets by ship power,
the same weekly course for everyone, and set levels with stars. Keep these;
they're the identity.

**What we have too much of:** currencies and ladders (eight numbers), and
screens (eleven menus).

**What to borrow:**
- Goals in sets that raise your level (the daily and weekly goals, feeding the
  pilot level).
- Play first, settle details later.
- Themed seasons with new looks.
- Revives that get dearer.
- Rewarded ads as the free path to convenience.
- A one-off premium unlock.

**What to avoid:**
- Loot boxes (mystery boxes, prize machines): store rules, age ratings and
  trust.
- Selling power (Hill Climb Racing 2's model) when there's a competitive board.

## 4. Overlaps and confusions

- **Rank vs league.** Both come from ranked runs and both compare you with a
  par. Rank (XP plus skill) is a lifetime level and gives paints; the league
  (LP vs par) gives brackets, upgrade gates and weekly credits. A player can't
  tell why they have two.
- **Skill** is a third hidden number behind rank, measuring the same thing as
  LP.
- **Credits vs cores** is fine in itself (soft and premium), but only if credits
  stay worth something (see 2).
- **Tickets** add a third currency and make ranked feel rationed. Buying them
  buys more tries at a "best counts" board.
- **Upgrade points** gate leagues, leagues gate upgrades. It works, but it's
  hard to explain, and it's why the casual player's credits pile up.

## 5. Recommendations

Each change comes with its reason and what it costs existing saves.

1. **Ranked is unlimited; tickets go.**
   - Every ranked run counts for LP and XP, and your best counts on the board.
     More runs give no paid edge, and the main mode stops being rationed.
   - It removes a currency and a sink for cores (tickets were 30 cores). The
     login calendar's ticket days and the pass's ticket rewards become cores
     or credits instead.
   - Existing saves: spare tickets are converted to cores (30 each, once).
2. **Rank becomes the pilot level, earned from all play.**
   - XP from every run (more for ranked) and from every goal. Skill is removed:
     LP already measures performance.
   - Each level pays a reward and some give a look. The league stays the ranked
     ladder.
   - That's two clear roles: "how much you've played" and "how good you are in
     ranked."
   - Existing saves: XP is kept and the level is worked out from it (the ladder
     is re-spaced so current players don't drop).
3. **Runs pay; quests nudge.**
   - Raise run credits (target: runs are about half of a regular player's
     income) and cut quest pay to ~100 each.
   - Trim league weekly rewards so the totals land about where a regular earns
     the whole ship in 4 to 6 months.
   - Optional: pickups pay credits directly, so you see them earned (genre
     norm).
   - Existing saves: no change; balances are kept.
4. **Give credits a long-term sink.**
   - More credit looks with a wider price range (to ~20,000), rotating in the
     daily shop.
   - Each season adds credit looks.
   - Upgrades stay credit-only and earned-only.
   - Existing saves: none.
5. **The pass fits its season.**
   - Target: a regular finishes in ~5 weeks, a casual reaches ~tier 20.
   - That's about 4 times today's XP per tier, quest XP cut to ~30, and the
     weekly goals as the big XP source.
   - Each season gets a theme and 3 or 4 new looks on the premium track.
   - Existing saves: the current season's tier is kept (XP rescaled).
6. **Paid things never touch a board.**
   - A revived run counts on the boards as the score at the first crash; the
     rest counts for credits, XP and personal bests only.
   - With tickets gone, ranked has no paid edge.
   - Existing saves: none; it applies to new submissions (server check:
     `submit_run` gets a `revived` flag and the pre-revive score).
7. **Fewer numbers on screen.** The front page shows credits and cores (no
   tickets), the pilot level, the league and the pass. Upgrade points appear
   only in the hangar.
8. **New players see the game in stages.**
   - After onboarding: endless, the hangar and goals.
   - After the first 3 runs: solo and the shop.
   - After the tutorial and 5 runs (enough to have seen how scoring works):
     ranked and leagues. Each opens with a short card.
   - Existing saves: everything already open.

## 6. Paid features design

### What's sold

| Product | Kind | Contents | Price (suggested) | Notes |
|---|---|---|---|---|
| **Premium** | non-consumable, one-off | No ads; rewarded-ad rewards without the ad; 3 premium-only looks (a hull, a paint, a flame); +1 free revive a day; a premium badge on the boards | £4.99 | Restore purchases; tied to the account through the webhook |
| Core packs | consumable | 100 / 550 / 1,200 / 2,500 cores | £0.99 / £4.99 / £9.99 / £19.99 | Exist. A first purchase of any pack pays double (genre norm) |
| Starter pack | non-consumable, once | 500 cores + the nova hull (+ whatever replaces tickets) | £2.99 | Exists; shown for the first 7 days, then in the shop |
| Season pass | per season | Premium track | £4.99, or 550 cores (one pack) | Today it's 950 cores (about £8 in packs) vs £4.99: make them match |
| Credit packs | | | not sold; cores swap for credits instead (1 core = 25 credits) | Decided at launch: one store currency, credits through cores |

Cores buy looks, the vault, revives (after the free ones), the pass, and shop
bundles, and swap for credits in the cores tab.

### Ads

- **Rewarded only at launch.** Revive (instead of cores), double the credits
  from the run just flown, a free gift once a day (a few cores or credits),
  and re-roll a daily goal.
- **Interstitials later, if at all.** Not before day 3; at most one every 3
  runs and 3 minutes; never after a new best or a promotion. Never for premium
  players.
- **Network:** AdMob through the Capacitor community plugin at launch (one SDK,
  simple). AppLovin MAX later if mediation would earn more.
- **Consent:**
  - Google's consent form (UMP) for the UK and EU.
  - Apple's tracking prompt (ATT) before personalised ads on iOS.
  - Non-personalised ads if declined.
  - A "privacy choices" row in settings.

### Limited offers

- Weekly deals and event bundles are rows in a Supabase `offers` table: id,
  contents, price in cores or a store product id, start, end, who sees it. The
  client reads it at start-up.
- Bundles priced in cores need no app update.
- Real-money bundles need their store products made first (ids are fixed), so
  a few spare bundle ids are created at launch.
- Recommendation: design the table now, build it after launch.

### The plumbing

- **`src/store/entitlements.ts`**: one `Entitlements` model, `has('premium')`,
  `passSeasons`, `starterPack`.
  - Filled from RevenueCat in the apps and from the server
    (`store_events`, written by the webhook).
  - Empty on the web.
  - The whole game reads this, never the store directly.
- **A `premium` unlock kind** in `src/looks.ts`: owned while the entitlement
  is held.
- **`src/ads/`**: an `Ads` interface (`ready(placement)`,
  `show(placement) → 'rewarded' | 'skipped' | 'unavailable'`).
  - A do-nothing web version; the AdMob version in the apps.
  - Placements and their caps in `CONFIG.ads`.
  - Premium short-circuits every placement: rewarded ones pay at once.
- **One product list** in `CONFIG.economy.store` (premium added; offer bundle
  ids later).
- **The server is the source of truth for paid things:**
  - The webhook grants cores, premium and the pass; the client never grants
    them itself.
  - Cores already live on the server when connected.
  - Restore purchases re-reads RevenueCat and the server.

### Rules

- No paid power in ranked: upgrades are credits-only and credits aren't sold;
  ranked has no revive; with tickets gone, no paid tries.
- No paid score on any board: revived runs count up to the first crash.
- No loot boxes: every purchase says exactly what it gives.
- Prices come from the stores (RevenueCat), never written in the app.
- Restore purchases in the shop and in settings.
- **Age rating:** ads, in-app purchases, no gambling, mild cartoon peril.
  Expect PEGI 3 / Apple 4+. Personalised ads mean not aiming it at under-13s
  (no "made for kids" listing).

### Where purchases appear

| Where | What | Taps from home |
|---|---|---|
| Wallet chip (cores) | the shop's cores tab | 1 |
| Bottom bar: shop | featured, cores, premium | 1 |
| Live card: pass | the pass, buy premium track | 1 |
| Live card: offer | the offer | 1 |
| Hangar: a locked core look | buy it | 2 |
| Crash in solo or endless | revive: ad, free, or cores | 0 (in the run) |
| After a run | double credits (ad) | 0 |
| Settings | remove ads (premium), restore purchases | 2 |

Nothing is ever more than 2 taps away. Nothing pops up unasked except the
revive offer (and the starter pack once, after the first session).

## 7. Onboarding: a different order

The genre's lesson is to play first. A name form before the first run loses
players. Suggested order:
1. A welcome screen.
2. Choose controls.
3. The practice run (steer, near miss, pickup, boost, shield).
4. Dress your ship.
5. The front page.

The pilot name is asked when it's first needed: the first run that would go on
a board, or opening the leaderboard. "Skip" gives a generated name. The rest is
as in the plan: it resumes, it can be replayed, and existing players skip it.

## 8. Decisions

Agreed on 6 October 2026: every recommendation below, as written. The new looks
each season are generated (section 9) rather than drawn by hand.

| # | Question | Agreed |
|---|---|---|
| 1 | Tickets: remove (ranked unlimited), keep but refill 1 a day, or keep as now? | Remove; spare tickets become cores |
| 2 | Rank: turn into a pilot level from all play (skill removed), merge into leagues, or keep? | Pilot level |
| 3 | Rebalance credits: runs pay more, quests and league weekly less, more credit looks as a sink? | Yes |
| 4 | Credit packs? | Not sold |
| 5 | Free cores (~100 to 130 a week): keep, or cut to about half? | Cut to about half (the weekly goals add some back) |
| 6 | The pass: slow it to fit 6 weeks, a theme and new looks each season, price £4.99 or 550 cores? | Yes; the season's looks are generated (section 9) |
| 7 | Premium: no ads, ad rewards free, 3 exclusive looks, +1 free revive a day, a board badge, £4.99? | Yes |
| 8 | Revived runs on the boards: count up to the first crash? | Yes |
| 9 | Ads: AdMob, rewarded only at launch, interstitials later or never? | Rewarded only; decide interstitials after launch data |
| 10 | Onboarding order: play first and ask the name when needed, or the name first as in the plan? | Play first |
| 11 | New players see the game in stages (ranked after the tutorial and 5 runs)? | Yes |
| 12 | Limited offers from the server: design now, build after launch? | Yes |
| 13 | Pickups pay credits directly (the run visibly earns)? | Yes, if 3 is agreed |
| 14 | Audience: 13+ with personalised ads, or family-friendly with non-personalised ads only? | 13+ |


## 9. Generated season looks

Each season's new looks are made by code from the season number, so a new
season needs no drawing and no app update, and everyone gets the same looks.

**What a season makes (`src/seasonLooks.ts`):**
- A theme: a name from word lists (e.g. "solar drift") and a base hue, which
  steps round the colour wheel by the golden angle each season so neighbouring
  seasons never look alike.
- A palette from that hue by colour harmony rules (analogous, split
  complementary or triadic, picked by the seed), with lightness and saturation
  kept in ranges that read on the ship.
- **Premium track (4 looks):** a paint, a two-tone paint, an engine colour and a
  wing decal.
- **Free track (1 look):** a paint at tier 25.
- **Shop (4 looks):** credit paints and engine colours priced 2,000 to 20,000,
  which rotate into the daily shop during the season (the credit sink in
  recommendation 4).
- **Decals** are emblems built from parts: an outer shape (shield, circle,
  diamond, hexagon), a centre mark (star, chevron, bolt, ring, wings) and a
  symmetry. They're drawn as 24 x 24 SVG like the hand-made decals.

**Rules it keeps:**
- Deterministic: the same season always makes the same looks, on every device
  and the server.
- Distinct: each colour is far enough from every existing paint and engine
  colour (a colour-difference check), or it's nudged until it is.
- Readable: paint tops are lighter than their shades, and decals stay inside
  their box with enough filled area to read at wing size.
- Kept forever: a look's id names its season (e.g. `paint:s4-1`), so owned
  season looks stay in the catalogue after the season ends, and the vault can
  bring them back.
- Curatable: `CONFIG.seasons.overrides` can rename, recolour or veto any
  generated look for a season without touching the generator.

Hulls stay hand-made: each is new geometry, and a bad hull would be seen on
every board.
