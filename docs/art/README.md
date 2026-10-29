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
