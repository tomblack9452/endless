# itch.io

The web build of the game, hosted on itch.io as an HTML5 project, with a link
to the Android app on its page and in the game (the title's "get it on google
play", web only).

| File | Use |
|---|---|
| `cover-630x500.png` | Cover image (itch's 630 × 500) |
| `banner-960x320.png` | The page's banner (Edit theme → Images → Banner) |
| `background-2560x1600.png` | The page's background: the banner's dusk carried out to the sides, with the game's own trees, crystals, cacti and rocks down both edges (rendered from `src/world/props.ts`), fading to the page colour (no repeat, top centre, not fixed) |
| `../listing/screenshots/phone-01.png` … `phone-06.png` | Screenshots |

## Settings

- **Kind of project:** HTML. **Classification:** Games. **Release status:** Released.
- **Pricing:** No payments (or "Donate" if you'd like tips).
- **Upload:** a zip of what's *inside* `dist/` (index.html at the zip's top),
  with **This file will be played in the browser** ticked.
- **Embed options:** viewport 480 × 854; **Mobile friendly** on, orientation
  **Portrait**; **Fullscreen button** on; **Automatically start on page load**
  off (a click to start lets the sound play); scrollbars off.
- **Genre:** Action. **Tags:** endless-runner, space, arcade, 3d, low-poly,
  casual, one-button, singleplayer, mobile, leaderboard.
- **Links:** the Google Play page,
  https://play.google.com/store/apps/details?id=com.tomblack.endlessspace

## Theme (Edit theme)

The store art's dusk: BG `#1c1a26`, BG 2 `#26222f`, text `#ece4d8`, links
`#e8a060`; font Work Sans (or Lato), size Large; the banner above; embed BG
`#1c1a26`.

## Short description (tagline)

One thumb. Endless sky. Fly close, chain near misses, climb the weekly ranks.

## Description

**One thumb. Endless sky.**

Endless Space is a calm, quick space runner you play with one thumb. Fly your
ship low over alien plains, down winding canyons, through asteroid belts and
the corridors of a giant ship, and see how far you can go.

- **Fly close:** near misses chain into bigger scores.
- **Six places to fly:** open ground, canyon, ship interior, ice field,
  asteroid belt and volcanic plain, with day turning to night as you go.
- **A new ranked course every week,** the same for everyone, with leagues to
  climb, and a daily challenge.
- **160+ looks** for your ship: hulls, paints, markings, flames.
- **Power-ups:** shields, magnets, phase and double points.

Plays with a mouse, touch or the arrow keys. Your progress is kept in this
browser.

**On Android:** get it on Google Play for purchases, cloud save and more:
https://play.google.com/store/apps/details?id=com.tomblack.endlessspace

## Updating it

Build (`npm run build`), zip what's inside `dist/` again, upload the new zip
on the project's edit page, tick "played in the browser" on it, and delete the
old one.
