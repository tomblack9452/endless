# Restyle directions

Four style directions for a sci-fi, futuristic, minimalist restyle, from Tom's
references (Northlane's *Node* and *Mesmer* covers, Volumes' *Mirror Touch*, the
pink prisms and two dark glitch pieces). Each board shows the title screen and a
run in that style; the mockups are drawn in SVG (`style-*.png`), not in the engine.

| Direction | From | Feel | Cost on phones |
|---|---|---|---|
| [Prism](style-prism.png) | *Node* | dark dot lattice, glass triangles with lit edges, one violet accent | low: emissive edges, transparent faces, bloom on high only |
| [Holo crystal](style-holo.png) | *Mesmer*, the pink prisms | iridescent glass cubes on deep teal, rainbow edges, grain | medium: `MeshPhysicalMaterial` iridescence on high, a gradient-texture fake on low |
| [Void](style-void.png) | the dark glitch covers | black chrome shards, light shafts, a red accent, RGB glitch lines | medium: metal with an environment map; a glitch pass only on hits |
| [Mint glass](style-mint.png) | *Mirror Touch* | lilac-white air, mint glass sheets, soft shadows, no glow | lowest: no post-processing |

## Notes from the research

- Iridescent and holographic looks are a current trend (structural colour,
  Y2K revival), and UI guidance for them is consistent: keep the effect on
  accents and surfaces, with calm neutral areas around it, so it reads premium
  rather than busy.
- Neon line art on dark backgrounds (Tron, wireframe shooters such as Grid
  Ranger, Trace Vector, Neo Angle) is a well-worn path for minimalist sci-fi on
  phones: cheap to draw and clear at a glance.
- The game already uses a triangle ship and a ringed planet; Prism keeps that
  silhouette, so the change is mostly materials, colour and the backdrop.

## Recommendation

Prism as the base style, closest to the *Node* reference and the cheapest to
run well on mid-range phones. Then:

- the Holo crystal finish as premium ship looks and season-pass rewards
  (iridescent paints, crystal hulls);
- Void as the look of the red alert event and the asteroid belt;
- Mint glass as the light theme, replacing today's cream.

Next step if Tom picks one: a working prototype of one environment and the
title screen in the engine, compared on a phone against today's look.

## UI pattern boards

Four boards (`ui-*.png`) of patterns from similar mobile games, drawn in the
Prism style, two takes each:

| Board | Pattern | From |
|---|---|---|
| [The front screen](ui-title.png) | the scene is the menu: tap anywhere to fly, places in the corners, or a mode carousel with one fly button | Alto's Odyssey, Crossy Road |
| [The run](ui-hud.png) | one big number; boost and power-up timers as rings on the ship; near misses beside it | Smash Hit, Race the Sun |
| [After a crash](ui-results.png) | score against best, fly again biggest, then what the run moved (rank, league) | endless runner results screens |
| [Looks](ui-shop.png) | a showroom of the ship itself, one price and one button; a grid with rarity as a glow | Crossy Road's character picker |

## Sci-fi HUD boards

From Tom's second set of references (sci-fi mobile game UI kits and minimalist
game UIs), five boards (`scifi-*.png`) for the UI and its flow: cut-corner
panels with cyan edges, hex icons, segmented meters, one bright button per screen.

| Board | Screens |
|---|---|
| [The hub](scifi-hub.png) | hub (ranked card, fly, mode chips, dock), solo areas, goals, options |
| [The run](scifi-run.png) | run HUD, pause, revive offer, results |
| [Hangar and shop](scifi-hangar.png) | hangar upgrades, shop today, cores, results with a way to the hangar |
| [Flow](scifi-flow.png) | the navigation: hub as home, a dock to every place, fly again in one tap |
| [Minimal dark](scifi-minimal.png) | the same flow in black and white with thin lines |
