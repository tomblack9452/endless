# Endless Space

A minimal 3D endless runner for phones. Steer a small ship through open alien
ground, a winding canyon and the rooms of a ship interior, dodging everything
in your way. Built with Three.js, TypeScript and Vite, packaged for iOS and
Android with Capacitor.

## Run it

```bash
npm install
npm run dev
```

Open the printed local address. To play on a phone, connect it to the same
Wi-Fi and open `http://<your-computer-ip>:5190`.

```bash
npm run build
```

builds a production bundle into `dist/`.

## Controls

- Drag left/right anywhere to steer (arrow keys or A/D on desktop)
- Hold the bottom-right corner to boost (Shift, W, Up or Space on desktop)
- Pause from the top-right corner (Esc or P)

## How it plays

- Levels come in groups of three and loop forever: open ground, canyon, ship
  interior. Speed and density keep rising on capped curves, so it never
  becomes impossible.
- Every layout is built around a hidden safe lane that can always be
  followed at the current speed. Obstacles never cover it.
- Near misses chain into a score multiplier; boost pickups sit on the safe
  lane.
- Day turns to night over ten levels.
- All sound and music is synthesised in the browser, in D, changing mode per
  theme.

## Layout

| File | What it does |
|---|---|
| `src/config.ts` | Every tunable value: speeds, difficulty curves, themes, rooms, audio levels |
| `src/game.ts` | Game states, loop, scoring, boost, menus |
| `src/world.ts` | Obstacle pools and the theme generator (safe lane lives here) |
| `src/interior.ts` | Reusable ship rooms |
| `src/field.ts` | Instanced obstacle pool with collision and moving parts |
| `src/props.ts` | Low-poly trees, rocks, crystals and shuttles |
| `src/renderer.ts` | Scene, camera and sky |
| `src/atmosphere.ts` | Day/night cycle and theme lighting |
| `src/audio/` | Sound engine and generative music |
| `src/ui.ts`, `src/style.css`, `index.html` | HUD and screens |
| `src/dev.ts` | Dev-server-only level skip and test toggles |
