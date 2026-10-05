// Every tunable value lives here.

export interface Palette {
  name: string;
  ground: string;
  sky: string;
  fog: string;
  cubeLight: string; // top faces
  cubeMid: string; // front faces (the face you see most)
  cubeDark: string; // side faces
  ship: string;
  shipShade: string;
  text: string;
}

// Hand-picked. Level n uses PALETTES[(n - 1) % PALETTES.length].
// Only the first is in use for now; the rest are candidates for later levels.
export const PALETTES: Palette[] = [
  {
    name: 'bone',
    ground: '#e6e1d6',
    sky: '#f1ede4',
    fog: '#d8d2c4',
    cubeLight: '#d9a27a',
    cubeMid: '#c07a4f',
    cubeDark: '#8a5236',
    ship: '#2b2824',
    shipShade: '#57514a',
    text: '#2b2824',
  },
  {
    name: 'tidewater',
    ground: '#dadfdb',
    sky: '#ecefeb',
    fog: '#c9d1cd',
    cubeLight: '#8fb0ac',
    cubeMid: '#5f8784',
    cubeDark: '#3d5d5b',
    ship: '#1f2a2a',
    shipShade: '#4a5857',
    text: '#1f2a2a',
  },
  {
    name: 'clay',
    ground: '#d9cfc2',
    sky: '#ebe4d9',
    fog: '#c8bcad',
    cubeLight: '#a39483',
    cubeMid: '#73665a',
    cubeDark: '#4a4038',
    ship: '#2e2620',
    shipShade: '#5c5148',
    text: '#2e2620',
  },
  {
    name: 'lichen',
    ground: '#e1dfd0',
    sky: '#efede2',
    fog: '#d1cebb',
    cubeLight: '#aaa982',
    cubeMid: '#7f805a',
    cubeDark: '#56583c',
    ship: '#2a2b1e',
    shipShade: '#55573f',
    text: '#2a2b1e',
  },
  {
    name: 'ink',
    ground: '#1c1b19',
    sky: '#2a2825',
    fog: '#33302c',
    cubeLight: '#ece5d5',
    cubeMid: '#c6bdaa',
    cubeDark: '#8c8476',
    ship: '#ece5d5',
    shipShade: '#9a9284',
    text: '#e6dfd0',
  },
  {
    name: 'ember',
    ground: '#1f2325',
    sky: '#2c3133',
    fog: '#363d3f',
    cubeLight: '#e3a679',
    cubeMid: '#c28056',
    cubeDark: '#87573b',
    ship: '#e9e0d1',
    shipShade: '#9b9286',
    text: '#e9e0d1',
  },
];

export const CONFIG = {
  render: {
    maxPixelRatio: 2,
    // Adaptive resolution: if frames run slow, render at a lower scale; step
    // back up when there's headroom. Frame times are averaged first.
    adaptive: true,
    minPixelRatio: 0.85,
    pixelRatioStep: 0.25,
    slowFrameMs: 21, // average frame time that counts as struggling (~48 fps)
    fastFrameMs: 14.5, // ...and as comfortable (~69 fps)
    slowForMs: 1200, // struggling this long: step down
    fastForMs: 6000, // comfortable this long: step up
    // Widest play area as width / height. Wider screens (desktop, landscape)
    // get a centred column so the game plays the same as on a phone.
    maxAspect: 0.75,
    antialias: true,
  },

  camera: {
    // Horizontal FOV is held constant so every aspect ratio sees the same
    // width of field; vertical FOV is derived and clamped.
    hfov: 46, // degrees
    minVfov: 48,
    maxVfov: 84,
    fovPerSpeed: 0.1, // extra horizontal degrees per unit of speed above base
    maxFovBoost: 9,
    horizonY: 0.36, // horizon position, fraction of screen height from the top
    shipY: 0.8, // vertical FOV never gets so narrow that the ship drops below this
    height: 2.0,
    distanceBehind: 2.5,
    maxRollDeg: 10,
    rollEase: 6, // higher = snappier
    near: 0.1,
    far: 400,
  },

  // Deep space over the observation deck (and faintly outside at night):
  // a spiral galaxy, stars and the odd shooting star.
  space: {
    sky: '#10141d',
    fog: '#1b2130',
    stars: 420,
    nightStars: 0.55, // star visibility outside at full night
    galaxy: { x: 70, y: 115, z: -360, size: 175, tilt: 0.45 },
    shootingEvery: [1.8, 5], // seconds between shooting stars
  },

  // Ringed planet low in the sky (hidden inside the ship).
  planet: {
    x: -62,
    y: 58,
    z: -360,
    radius: 24,
    body: '#e4d8c4',
    ring: '#cdbda4',
    skyBlend: 0.5, // how much it takes on the sky colour
    ringOpacity: 0.85,
  },

  fog: {
    density: 0.0115, // FogExp2; cubes are invisible near spawnDepth
  },

  ship: {
    halfWidth: 0.25,
    length: 0.72,
    height: 0.08, // ridge height
    hoverY: 0.14,
    maxBankDeg: 24,
    // Hitbox is forgiving: a box narrower than the visual triangle.
    hitHalfWidth: 0.16,
    hitHalfDepth: 0.22,
    shadowOpacity: 0.1,
  },

  steering: {
    maxLateralSpeed: 17, // units / s at full steer, at base speed
    // Steering gets faster with forward speed so dodging stays possible:
    // lateral = maxLateralSpeed * (speed / base)^lateralSpeedExponent
    lateralSpeedExponent: 0.6,
    response: 9, // how fast lateral speed reaches its target
    keyRamp: 7, // how fast keyboard steering ramps to full
    dragRangeFraction: 0.14, // finger travel (fraction of screen width) for full steer
    tilt: {
      deadzoneDeg: 3, // lean ignored either side of neutral
      fullTiltDeg: 16, // lean (beyond the deadzone) for full steer at medium sensitivity
      smoothing: 14, // higher = snappier response to the phone
    },
  },

  // Difficulty rises continuously with score and levels off at a cap:
  //   value = start + (max - start) * (1 - e^(-score / rampPoints))
  // So it climbs gently early, keeps creeping up, and can never pass max.
  // Rough speed at the start of: L1 36, L5 45, L10 53, L20 63, L40 72, never above 75.
  speed: {
    base: 36, // units / s at score 0
    max: 75, // hard cap
    rampPoints: 16000, // larger = slower climb
    titleDrift: 9,
    ease: 0.6, // how fast speed follows its target (per s)
  },

  score: {
    pointsPerUnit: 0.85,
    levelLength: 1000, // levels count distance points only; bonuses don't skip levels
    // Near miss: an obstacle (not a wall) passes within `gap` of the ship's
    // hitbox. Each one in a chain is worth points * chain length, so a chain
    // of 4 pays 25 + 50 + 75 + 100. The chain breaks after `comboWindow` s
    // with no near miss.
    nearMiss: {
      gap: 0.8,
      points: 25,
      comboWindow: 2.5,
      maxCombo: 10, // chain counting stops growing here
      nudge: 0.05, // camera kick
      nudgeMs: 110,
    },
    pickupPoints: 50,
    boostBonus: 0.5, // extra fraction of distance points earned while boosting
  },

  field: {
    cubeSize: 1.0, // footprint (width and depth)
    // Block heights as multiples of cubeSize. Skewed so most are short and a
    // few stand tall: height = min + (max - min) * random^heightBias.
    minHeight: 0.6,
    maxHeight: 2.4,
    heightBias: 2.2,
    halfWidth: 75, // field wraps laterally across [-halfWidth, halfWidth]
    spawnDepth: 230, // cubes appear this far ahead
    recycleBehind: 6, // cubes are freed this far behind the ship
    rowSpacing: 2.2,
    startClearance: 60, // empty runway in front of the ship when a run starts
    // Instance pool sizes per kind.
    maxBlocks: 2800,
    maxHull: 2400,
    maxRocks: 2800,
    maxStrips: 1600,
    maxObstacleRocks: 1400,
    maxBushes: 900,
    maxPours: 500,
    maxPools: 200,
    maxSteam: 200,
    maxBlinkers: 1400,
    maxHolos: 120,
    maxFans: 80,
    maxVents: 400,
    maxDeadTrees: 500,
    maxRockSpires: 500,
    maxCacti: 500,
    maxTumbleweeds: 60,
    maxTufts: 2600,
    maxMesas: 60,
    maxArches: 12,
    maxMushrooms: 1200,
    maxSpires: 800,
    maxCrystals: 700,
    maxPowers: 8,
    maxPickups: 16,
    maxShuttles: 120,
    maxPipes: 2600,
    maxGreebles: 2600,
    maxVoids: 1600,
    maxCanisters: 500,
    maxWaters: 260,
    maxTanks: 160,
    // Cubes per 100 square units, on the same capped curve as speed.
    // Rough density at the start of: L1 0.35, L5 0.52, L10 0.68, L20 0.87, cap 1.05.
    densityStart: 0.35,
    densityMax: 1.05,
    densityRampPoints: 14000,
  },

  blocks: {
    textured: true, // metal and pipe textures; false = flat faces
    textureSize: 256, // pixels per block face (side atlas is 4x this wide)
    anisotropy: 4, // keeps side faces sharp at grazing angles
    // How much of the palette's hue reaches textured blocks. 0 = pure steel grey
    // at the palette face's brightness, 1 = fully palette coloured.
    tint: 0.22,
    brightness: 1.55, // lifts textured faces; the texture itself darkens them

  },

  // Day to night. Time of day advances with score: each level moves one key
  // further along, blending smoothly, and the cycle repeats every
  // `keys.length` levels (10): day, through a blue night, back to day.
  // Each key tints the level palette: sky/fog are blended towards the key's
  // colours by `mix`, the ground is scaled by `light` and blocks by `blocks`
  // (kept brighter than the ground so they stay visible at night). Light
  // values are perceptual (0.5 looks half as bright). The ground also picks
  // up the fog colour as it darkens (`groundFogTint`), which is what carries
  // the blue into the night. Text and ship switch to light tones
  // automatically when what's behind them gets dark.
  atmosphere: {
    enabled: true,
    nightText: '#e8e6e0',
    nightShip: '#dcdcd6',
    groundFogTint: 0.55,
    // Perceptual brightness range over which text/ship cross from dark to light.
    flipFrom: 0.5, // text, measured against the sky
    flipTo: 0.32,
    shipFlipFrom: 0.66, // ship, measured against the ground (flips earlier)
    shipFlipTo: 0.48,
    keys: [
      { name: 'day', sky: '#f1ede4', fog: '#d8d2c4', mix: 0, light: 1, blocks: 1 },
      { name: 'late morning', sky: '#f0ebe0', fog: '#d6d1c6', mix: 0.3, light: 0.98, blocks: 1 },
      { name: 'afternoon', sky: '#ecd8b8', fog: '#d8c5a8', mix: 0.55, light: 0.94, blocks: 0.96 },
      { name: 'golden', sky: '#d9b393', fog: '#c2a48c', mix: 0.75, light: 0.84, blocks: 0.9 },
      { name: 'blue hour', sky: '#8b9ab0', fog: '#8695a8', mix: 0.85, light: 0.7, blocks: 0.82 },
      { name: 'night', sky: '#4a5a78', fog: '#56657e', mix: 0.95, light: 0.56, blocks: 0.74 },
      { name: 'deep night', sky: '#3f4e6b', fog: '#4c5a74', mix: 1, light: 0.52, blocks: 0.72 },
      { name: 'pre-dawn', sky: '#6f7f9c', fog: '#76849b', mix: 0.9, light: 0.62, blocks: 0.78 },
      { name: 'dawn', sky: '#c6c9cf', fog: '#b3b6bb', mix: 0.75, light: 0.84, blocks: 0.9 },
      { name: 'morning', sky: '#efe9dd', fog: '#d6d0c4', mix: 0.35, light: 0.96, blocks: 0.98 },
    ],
  },
  // Themes come in groups of `levelsPerTheme` levels and loop forever:
  // land (1-3), canyon (4-6), interior (7-9), land (10-12) ...
  // Each theme's three levels get progressively harder patterns; overall
  // difficulty keeps rising on the capped speed/density curves.
  //
  // Survivability: every pattern is built around a "safe lane", a clear path
  // that wanders but never turns faster than `lane.slopeFraction` of what
  // the ship can steer at that speed. Obstacles never cover the lane.
  themes: {
    levelsPerTheme: 3,
    fadeIn: 40, // units over which theme colours blend in after a boundary
    fadeOut: 25, // ...and out before the next boundary
    lane: {
      halfWidth: 1.3, // kept clear either side of the lane centre
      // Fraction of the ship's steering ability the lane may use. Low on
      // purpose: it has to leave room for reaction time, not just physics.
      slopeFraction: 0.35,
      retargetMin: 25,
      retargetMax: 60,
      landWander: 22, // how far the lane drifts per retarget on open ground
      // Clear distance either side of every theme change: no obstacles in the
      // last `beforeChange` units of a theme or the first `afterChange` of the next.
      beforeChange: 45,
      afterChange: 50,
    },
    // Open ground is an alien landscape: mushroom trees and spire trees (only
    // their thin trunks collide; you fly under the canopies), dark rocks and
    // crystal clusters.
    //   level 1: sparse scatter
    //   level 2: denser, with rock clusters
    //   level 3: forest path, a clear winding path through dense forest
    land: {
      // Tumbleweeds roll across ahead of you (scenery: they never block the way).
      tumbleweedChance: 0.03, // per row (alien ground and volcanic plain)
      denseFactor: 1.4, // level 2 density multiplier
      clusterSpacing: [30, 55], // level 2
      clusterSize: [3, 6],
      pathHalfStart: 4.2, // level 3 path half-width...
      pathHalfMin: 3.0, // ...narrowing to this with score
      pathRampPoints: 22000,
      pathWander: 14, // gentler lane drift so the path winds smoothly
      forestDensity: 2.6, // level 3 density multiplier outside the path
      edgeChance: 0.75, // chance per row per side of a prop lining the path edge
      // Dressing (alien ground and title screen).
      tuftsPerRow: 12, // grass tufts scattered per row (scenery)
      mesaChance: 0.035, // per row: a mesa on the horizon
      rockFaceSpacing: [160, 320], // between rock faces running alongside the path
      rockFaceLength: [40, 90],
      rockFaceGap: [6, 11], // distance from the lane to the face
      archSpacing: [380, 650], // between natural rock arches over the path
      bigHills: [1, 3], // big hill sections per open-ground theme
      bigHillWidth: [70, 130], // half-width of a big hill (units along the run)
      bigHillHeight: [3.5, 6],
    },    // The canyon is about readable shapes, not random clutter: the walls wind,
    // and obstacles are dark rocks that stand out from the sand.
    //   level 1: winding path, a few lone boulders
    //   level 2: rockfall bands across the path with one wide gap
    //   level 3: pillar slalom plus occasional bands
    canyon: {
      ground: '#d2bea3',
      rock: '#a88b70', // walls
      obstacle: '#5e4a3c', // boulders and pillars: darker so they read early
      halfWidthStart: 10, // path half-width on the first canyon
      halfWidthMin: 6, // never narrower than this
      widthRampPoints: 22000,
      mouthHalfWidth: 34, // wide entrance that funnels down
      // Variety: pebbles on the floor, towering cliffs, natural bridges overhead.
      pebblesPerRow: 4,
      cliffChance: 0.12, // per row per side: a huge rock towering over the wall
      bridgeSpacing: [260, 480],
      // Split paths: a rock island divides the canyon into two branches. The lane
      // runs down one; the other has its own guaranteed line, more rocks and
      // bonus pickups.
      splitSpacing: [420, 700],
      splitLength: [45, 85], // island length
      splitIsland: [1.4, 2.6], // island half-width
      splitWiden: 22, // units to widen the walls before (and narrow after)
      splitRejoin: 30, // clear stretch after the island, to cross back from the other branch
      splitAltRocks: 0.55, // chance per row of a rock in the other branch
      splitAltPickups: 3,
      mouth: 90, // funnel length
      exit: 80, // funnel to the interior door at the end
      centreSlopeFraction: 0.45, // walls wind at this fraction of the lane's max slope
      loneBoulderSpacing: [40, 70], // level 1
      bandSpacing: [38, 55], // level 2 (level 3 uses 2x)
      bandGapWidth: 4.4,
      pillarSpacing: [22, 32], // level 3
      wallCrystals: 0.22, // chance per row per side of crystals on the canyon sides
      wallCacti: 0.06, // chance per row per side of an alien cactus by the wall (canyon only, not the asteroids)
      tumbleweedChance: 0.04, // per row: one rolls across the canyon floor
      // Ramps, platforms and drops (heights are looks only: see terrain.ts).
      elevation: {
        spacing: [60, 140], // platform length between changes
        rise: [2.4, 4.4],
        riseLength: [30, 46], // ramps stay gentle
        drop: [1.8, 3.6],
        dropLength: [8, 13], // drops are short and steep
        dropChance: 0.55, // going down: a drop rather than a ramp
        min: -4, // relative to where the canyon began
        max: 7,
        returnSlope: 12, // units of run per unit of height, heading back level at the end
      },
      // Upper and lower routes: a split's branch with the bonus line climbs, the other dips.
      lift: { up: 2.6, down: -1.5, ease: 16 },
      // Chasms: the floor falls away and a bridge carries the lane across. From
      // level 1 rope bridges; from 2 also wide ones with planks missing; from 3
      // also ones that fork around a gap (pickups on the far branch).
      chasm: {
        firstAfter: [90, 200], // after the mouth
        spacing: [420, 700],
        length: [26, 46],
        splitLength: [80, 110],
        splitOffset: 5.2, // how far the fork's second bridge swings out
        bridgeHalf: 1.9,
        wideHalf: 4.4,
        holeLength: [5, 9], // missing stretches...
        holeGap: [4, 8], // ...and whole stretches between
        railHeight: 0.75,
        riseChance: 0.35,
        altPickups: 3,
      },
    },
    // The ship interior is a chain of rooms joined by short corridors (see
    // interior.ts). Each room is a reusable template; which ones can appear
    // depends on the level within the theme (minSub 0 = from level 7,
    // 1 = from level 8, 2 = level 9). `weight` is the relative chance.
    interior: {
      sky: '#4d5664',
      fog: '#59636f',
      light: 0.92, // block brightness inside, independent of time of day
      strip: '#ece8de',
      floorShade: 0.6, // floors/ceilings relative to the darkest block face
      halfWidthStart: 3.6, // corridor half-width...
      halfWidthMin: 2.8, // ...narrowing to this with score
      widthRampPoints: 22000,
      doorExtra: 0.8, // the entrance door is this much wider than the corridor
      wallHeight: 3.4,
      centreSlopeFraction: 0.75,
      connectorLength: [14, 24], // corridor between rooms
      corridorPieceChance: 0.35, // a designed corridor piece instead of a plain one
      taperMin: 12, // shortest width change into or out of a room
      roomShift: [2, 8], // each room's centre line shifts sideways this much (random side)
      corridorJog: [3, 7], // some corridors jog sideways this much...
      corridorJogChance: 0.6, // ...this often
      sizeVariation: [0.7, 1.6], // each room's extra width is scaled by a random factor in this range
      heightVariation: [0.85, 1.25],
      wanderExtra: 3, // how far beyond corridor width the lane may wander in wide rooms
      lights: { amber: '#e3a35c', teal: '#7cc6bd', red: '#d46a5c', dark: '#1f2226', green: '#8fc77a' },
      // Wall dressing colours (pipes and greebles share this table).
      decor: {
        steel: '#8e959c',
        copper: '#b27b52',
        teal: '#5e8e8a',
        red: '#9b4c44',
        dark: '#2b2f34',
        yellow: '#c9a03c',
        panel: '#5a6068',
        green: '#5f7d55',
        wood: '#8a6a4a', // canyon bridges
        woodDark: '#5c4532',
        rope: '#c8b48a',
        glass: '#9cc9cf', // lab tanks
        cliff: '#6e5a48', // canyon chasm sides
      },
      pitDepth: 10, // how far the pit walls go down (below that it's black)
      void: '#07090c', // pit bottom
      railHeight: 0.9, // catwalk railings
      // Ramps between decks: gentler and lower than the canyon's (the ceiling comes too).
      elevation: {
        spacing: [90, 180],
        rise: [1.2, 2.4],
        riseLength: [22, 34],
        drop: [1.2, 2.2],
        dropLength: [10, 14],
        dropChance: 0.3,
        min: -3,
        max: 4,
        returnSlope: 10,
      },
      // Exterior hull the canyon runs into.
      facade: { width: 46, height: [12, 22], towers: [3, 5], masts: [2, 4] },
      rooms: {
        cargo: { weight: 3, minSub: 0, length: [60, 100], extraWidth: 3.8, height: 4.4, rowSpacing: [7, 10], pitch: 3.2, fill: 0.45, fillRampPoints: 40000 },
        servers: { weight: 3, minSub: 0, length: [55, 90], extraWidth: 2.4, height: 3.8, rowSpacing: [9, 12], pitch: 2.9, rackLength: 4 },
        deck: { weight: 2, minSub: 0, length: [60, 90], extraWidth: 2.6, height: 3.6, featureSpacing: [12, 18], enclosure: 0.3 },
        shaft: { weight: 2, minSub: 1, length: [35, 55], extraWidth: -0.6, minHalfWidth: 2.4, height: 2.6, lightSpacing: [5, 8] },
        junction: { weight: 2, minSub: 0, length: [60, 95], dividerHalf: 0.6, crates: 0.7 },
        fork: { weight: 2, minSub: 1, length: [65, 100], height: 4.2, dividerHalf: 0.55, branchScale: 0.85, crates: 0.6 },
        uneven: { weight: 2, minSub: 1, length: [55, 90], dividerHalf: 0.55, narrowExtra: 0.5, wideExtra: 2.2, crates: 1.1 },
        islands: { weight: 3, minSub: 1, length: [70, 110], extraWidth: 6, height: 4.6, spacing: [8, 13], width: [1.2, 3.6], islandLength: [4, 11] },
        chicane: { weight: 2, minSub: 2, length: [100, 150], extraWidth: 2.4, swing: 0.75, segment: 22 },
        gantry: { weight: 3, minSub: 1, length: [70, 110], extraWidth: 5, height: 6, catwalkHalf: 1.5, sideWalks: [14, 22], sideLength: [8, 18] },
        breach: { weight: 3, minSub: 0, length: [70, 110], extraWidth: 3, height: 4, holeSpacing: [6, 14], holeLength: [9, 22], bothChance: 0.35 },
        // Wall holes in ordinary corridors too, from level 8.
        corridorHoles: { minSub: 1, chance: 0.5, spacing: [4, 12], length: [7, 14], bothChance: 0.3 },
        hydroponics: { weight: 2, minSub: 0, length: [60, 100], extraWidth: 4.5, height: 6.2, rowSpacing: [8, 12], pitch: 3.6, fill: 0.6 },
        lasers: { weight: 3, minSub: 1, length: [50, 80], extraWidth: 0.9, gateSpacing: [11, 15], gapWidth: 2.9 },
        reactor: { weight: 2, minSub: 1, length: [55, 80], extraWidth: 6, height: 6, coreHalf: 2.2, pylonSpacing: [14, 20] },
        pistons: { weight: 3, minSub: 2, length: [55, 85], extraWidth: 1.6, spacing: [10, 14], travel: 0.1, motionMargin: 0.45 },
        hangar: {
          weight: 2,
          minSub: 2,
          length: [70, 110],
          extraWidth: 9,
          height: 7,
          rowSpacing: [13, 18],
          pitch: 4.8,
          fill: 0.7,
          shuttleHalfWidth: 1.75,
          doorAt: 0.85, // blast doors this far through the room
          doorGap: 0.9, // clearance either side of the lane once closed
          doorClose: [70, 6], // closes over 70 units of approach, done 6 ahead
        },
        // Animated rooms (fx.ts): coolant curtains, steam vents, molten metal.
        coolant: { weight: 2, minSub: 0, length: [60, 90], extraWidth: 2.6, height: 4.4, curtainSpacing: [11, 16], gapWidth: 3.2 },
        vents: { weight: 2, minSub: 1, length: [55, 85], extraWidth: 2.2, height: 3.8, rowSpacing: [7, 10], pitch: 2.1, period: 30, ventHalf: 0.45 },
        foundry: { weight: 2, minSub: 1, length: [60, 90], extraWidth: 3, height: 5.2, curtainSpacing: [13, 18], gapWidth: 3.2 },
        // Landmark rooms.
        // Drop shaft: a railed catwalk over a deep shaft, then the deck drops away steeply to the level below.
        dropShaft: { weight: 2, minSub: 1, length: [80, 110], extraWidth: 4, height: 7.5, catwalkHalf: 1.6, drop: [3.5, 5], dropLength: [10, 14], dropAt: 0.6 },
        // Cargo lift: the floor rises on a lift platform; hooks on chains swing across.
        cargoLift: { weight: 2, minSub: 0, length: [75, 105], extraWidth: 4, height: 6.5, rise: [2.6, 3.6], liftLength: [8, 11], liftAt: 0.35, hookSpacing: [11, 16], hookY: 0.45, hookFreq: 0.09, crates: 0.35 },
        // Flooded section: water over the deck; railed catwalks, one on the lane.
        flooded: { weight: 2, minSub: 1, length: [70, 105], extraWidth: 4.5, height: 4.6, catwalkHalf: 1.5, sideWalks: [12, 20], sideLength: [10, 20], level: -0.45 },
        // Command deck: tiers of consoles under a big viewscreen, the floor raised a step.
        command: { weight: 2, minSub: 0, length: [70, 100], extraWidth: 5, height: 4.6, tier: 1.1, rowSpacing: [9, 13], gapWidth: 3.2, enclosure: 0.35 },
        // Ventilation: giant fans turning in pits under the deck; the lane keeps to the walkways.
        fanRoom: { weight: 2, minSub: 1, length: [65, 95], extraWidth: 4.5, height: 6.5, pitSpacing: [10, 15], pitLength: [7, 11], fanSize: 3 },
        // Lab: rows of glass tanks of glowing liquid, benches and holograms.
        lab: { weight: 2, minSub: 0, length: [60, 95], extraWidth: 3.6, height: 4.6, rowSpacing: [8, 11], pitch: 2.4, tankRadius: 0.5, fill: 0.6 },
        // Set piece: reactor collapse (debris falls off the lane as you approach).
        collapse: { weight: 1.5, minSub: 2, length: [70, 95], extraWidth: 6, spacing: [5, 8], landAhead: [9, 16], fallOver: 22 },
      },
    },
  },

  // Boost: a meter that fills slowly on its own and from pickups. Hold the
  // boost control (or Shift / W / Up) to spend it for extra speed. Faster
  // means more distance, so more points, at more risk.
  boost: {
    fillSeconds: 60, // empty to full with no pickups
    drainSeconds: 3.5, // full to empty while boosting
    minToStart: 0.08, // need at least this much to begin
    // Double-tap and hold anywhere: a quick tap, then a press that starts within
    // gapMs of it and near it, boosts for as long as it's held (and still steers).
    doubleTap: { tapMs: 250, gapMs: 250, slopPx: 70 },
    speedMultiplier: 1.45,
    easeIn: 5, // how fast boost speed ramps up (per s)
    easeOut: 2.5,
    fovKick: 10, // extra horizontal degrees at full boost
    cameraPullBack: 0.8, // camera drops back so the ship surges ahead
    cameraDrop: 0.18, // ...and slightly lower
    shipPitchDeg: 4, // nose dips forward
    vibration: 0.025, // fine camera jitter at full boost
    speedLines: {
      count: 44,
      opacity: 0.55,
      lengthPerSpeed: 0.11, // streak length in units per unit of speed
      rushFactor: 1.6, // streaks move this much faster than the world
      innerX: 0.55, // nearest a streak gets to the ship's centre line
      outerX: 4.2,
      minY: 0.1,
      maxY: 2.4,
    },
    pickup: {
      amount: 0.15, // meter gained per pickup
      spacing: [260, 420], // distance between pickups (placed on the safe lane)
      height: 0.8, // centre height; bobs around this
      bob: 0.1,
      size: 0.55,
      color: '#e2b86b',
      collectRadius: 1.0,
      spinSpeed: 2.4, // radians per second
    },
  },

  // Set levels (courses.ts).
  courses: {
    starCredits: 50, // per new star
  },

  // Assist mode (settings): a gentler way to play.
  assist: {
    speed: 0.8, // forward speed multiplier
    markerEvery: 3, // rows between safe-line markers
  },

  // Tumbleweeds: how far they roll across, over how much of your approach.
  tumbleweed: { travel: [22, 34], over: [150, 210], size: [0.8, 1.3] },

  // Rolling hills on open ground, and chasm depth (see terrain.ts). Looks only: collision is flat.
  terrain: {
    amplitude: 1.6,
    freqA: 0.045, // two waves, ~140 and ~57 units long
    freqB: 0.11,
    fade: 80, // units to fade in and out at each end of a theme
    flatEdge: 40, // flat this far into and before the end of a theme
    shipPitch: 0.6, // how much the ship noses up and down with the slope
    pitDepth: 16, // how far canyon chasms drop
    shade: 2.5, // ground brightness change per unit of slope
  },

  // Biomes (see biomes.ts): outdoor looks that rotate in each loop of the themes.
  biomes: {
    // Prop mixes for open ground by biome (relative chances).
    mix: {
      alien: { mushroom: 0.28, spire: 0.14, rock: 0.18, crystal: 0.1, bush: 0.15, deadTree: 0, rockSpire: 0.05, cactus: 0.1 },
      ice: { mushroom: 0, spire: 0.22, rock: 0.2, crystal: 0.38, bush: 0, deadTree: 0.05, rockSpire: 0.15, cactus: 0 },
      volcanic: { mushroom: 0, spire: 0.08, rock: 0.43, crystal: 0.1, bush: 0, deadTree: 0.2, rockSpire: 0.15, cactus: 0.04 },
    },
    lavaChance: 0.6, // per row on the volcanic plain: a glowing crack off the lane
    looks: {
      ice: {
        ground: '#e4edf2',
        sky: '#dfe9f0',
        fog: '#cfdde6',
        rock: '#9fb4c2',
        obstacle: '#6f8a9e',
        light: [0.82, 0.97, 1.15] as [number, number, number],
        amount: 0.75,
      },
      volcanic: {
        ground: '#2a2322',
        sky: '#7a4c3c',
        fog: '#5e3e34',
        rock: '#4a3c38',
        obstacle: '#2c2422',
        light: [0.5, 0.42, 0.42] as [number, number, number],
        amount: 0.9,
        ship: ['#e6ddd4', '#b3a69c'] as [string, string],
      },
      asteroids: {
        ground: '#101218',
        sky: '#141824',
        fog: '#1a1e2a',
        rock: '#5b5a5e',
        obstacle: '#3d3c42',
        light: [0.8, 0.8, 0.85] as [number, number, number],
        amount: 0.85,
      },
    },
  },

  // Theme events (see events.ts): one may start as the middle level of a theme begins.
  events: {
    chance: 0.6,
    seconds: 22,
    meteors: { count: 6, every: [0.5, 1.6], distance: [140, 240], tail: 1.4, color: '#e2763f' },
    sandstorm: { color: '#c9a57a', fog: 0.8, streaks: 70, width: 9, wind: 26, length: 1.4, opacity: 0.8 },
    redAlert: { color: '#d8433a', dark: '#2a0e10', pulseHz: 0.7, alarmEvery: 2.4 },
  },

  // Power-ups: rarer than boost pickups, also on the safe lane. They stack.
  powers: {
    spacing: [1300, 2000], // distance between power-ups (replaces a boost pickup)
    firstAfter: 600, // none in the first stretch of a run
    size: 0.5,
    shield: { color: '#6fb7d9', graceSeconds: 1.2 }, // lasts until you hit something
    magnet: { color: '#b48ad8', seconds: 9, reach: 28, pull: 7 },
    slow: { color: '#7fc28e', seconds: 6, factor: 0.62 },
  },
  // Sound design. Everything is synthesised (no files) and everything is in D:
  // the engine is tuned to the root, the music changes mode per theme, and
  // near-miss chains climb the current scale. Levels below are gains.
  audio: {
    // Buses
    master: 0.75,
    musicBus: 0.55,
    sfxBus: 0.9,
    ambienceBus: 0.7,
    // Engine and continuous layers
    engine: 0.07, // body tone
    engineIdle: 0.02, // on the title screen
    rumble: 0.09, // low thrust noise
    whine: 0.006, // turbine whine, rises with speed
    air: 0.03, // air rushing past
    airBoost: 0.07,
    roar: 0.06, // extra layer while boosting
    canyonWind: 0.06,
    interiorHum: 0.022,
    clanksPerSecond: 0.18, // distant metal creaks inside the ship
    // Effects per theme
    reverbLand: 0.12,
    reverbInterior: 0.5,
    echoLand: 0.2,
    echoCanyon: 0.55,
    muffleHz: 650, // master low-pass after a crash
    // One-shots
    passRange: 2.5, // obstacles within this pass with a whoosh
    passWhoosh: 0.05,
    nearWhoosh: 0.14,
    chain: 0.07,
    pickup: 0.08,
    boost: 0.1,
    level: 0.06,
    impact: 0.16,
    alarm: 0.05,
    wind: 0.09,
    door: 0.07,
    theme: 0.14,
    crash: 0.35,
    debris: 0.05,
    music: {
      pad: 0.09,
      bass: 0.11,
      lead: 0.05,
      hats: 0.02,
      bpmMin: 84,
      bpmMax: 116,
      bpmBoost: 8,
      leadDensity: 0.14, // chance of a note per eighth...
      leadDensityIntensity: 0.32, // ...plus this much at full intensity
      leadDensityBoost: 0.2,
      // Layers that join as the near-miss chain grows (chain length to start).
      chainLayers: { pulse: 2, arp: 4, hats: 6 },
      pulse: 0.08,
      arp: 0.026,
    },
  },
  crash: {
    freezeMs: 120,
    shakeMs: 340,
    shakeAmount: 0.22,
    fragments: 6,
    fragmentSpeed: 5,
    overDelayMs: 650, // when the game over text starts fading in
    retryLockMs: 900, // ignore taps for this long after a crash
  },

  ui: {
    paletteFadeSeconds: 1.2, // palette cross-fade at each loop of the themes
    fadeMs: 200,
  },

  storageKeys: {
    best: 'endless.best',
    sound: 'endless.sound', // 1 on, 0 off
  },
} as const;
