# Store assets

Every image for Google Play and for ads, and where each one goes. The in-game
copies of the product icons (160 px) are in `public/store/`.

```
store-assets/
├── listing/      the Play store page
├── products/     one icon per in-app product
└── ads/          AdMob and Google Ads images and videos
```

## listing/: Play Console > Grow users > Store presence > Main store listing

| File | Size | Goes in |
|---|---|---|
| `icon-512.png` | 512 × 512 | App icon |
| `feature-graphic.png` | 1024 × 500 | Feature graphic |
| `screenshots/phone-01.png` … `phone-06.png` | 1080 × 1920 | Phone screenshots, in order (captions in [store-listing.md](../store-listing.md#screenshots)) |
| `screenshots/tablet-01.png`, `tablet-02.png` | 1920 × 1080 | 7-inch and 10-inch tablet screenshots |

## products/: Play Console > Monetize with Play > Products > One-time products

One per product, named by its product ID, 512 × 512 32-bit PNG. Play takes
512 to 1080 px square only. Each product's name, description and price are in
[play-console.md](../play-console.md#8-in-app-products).

| File | Product |
|---|---|
| `cores_100.png`, `cores_550.png`, `cores_1200.png`, `cores_2500.png` | Cores packs (violet hexagons) |
| `credits_1000.png`, `credits_2500.png`, `credits_5000.png`, `credits_10000.png` | Credit packs (gold coin stacks; drawn by `scripts/credit-icons.py`, which also writes the game's copies) |
| `starter_pack.png` | Starter pack |
| `season_pass.png` | Season pass |
| `premium.png` | Premium |

## ads/: AdMob and Google Ads campaigns

| Files | Size | Use |
|---|---|---|
| `landscape-1.png` … `landscape-5.png` | 1200 × 628 | Landscape image ads (1.91:1) |
| `square-1.png` … `square-6.png` | 1200 × 1200 | Square image ads (1:1) |
| `portrait-1.png` … `portrait-6.png` | 1200 × 1500 | Portrait image ads (4:5) |
| `extra/wide-1920x1080.png` | 1920 × 1080 | Wide banner, YouTube thumbnails |
| `extra/story-1080x1920.png`, `extra/story-gameplay-1080x1920.png` | 1080 × 1920 | Stories and vertical placements |
| `video/endless-space-landscape.mp4`, `-square.mp4`, `-portrait.mp4` | | Video ads in each shape |
