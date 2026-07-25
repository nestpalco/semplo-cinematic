# Drop your real 360° panoramas here

This folder holds your **original equirectangular 360° panoramas** — the source
of truth. They stay as photographs; the build generates optimized WebP variants
automatically. Anything in `/public/pano/` is a build artifact.

## What an image must be

A **true equirectangular 360° panorama**: aspect ratio **2 : 1** (width = 2 ×
height), e.g. `8000×4000`. This is the standard output of a 360° camera or a
"panorama / equirectangular" render. (A flat photo will look stretched — the
optimizer warns if an image isn't ~2:1.)

Accepted: `.jpg .jpeg .png .webp .tif .tiff .avif`. Upload the **largest** you
have — the optimizer downsizes to **4096** (desktop) + **2048** (mobile/low-power)
and never upscales.

## 1. Name each file after its room id

The base filename must match the room's `id` in `src/rooms.config.js`:

| File to drop here | Room id    | Room          |
| ----------------- | ---------- | ------------- |
| `bedroom.jpg`     | `bedroom`  | The Bedroom (SEMPLO CONCEPT wall) |
| `living.jpg`      | `living`   | The Living Room |
| `office.jpg`      | `office`   | The Study     |
| `hallway.jpg`     | `hallway`  | The Hallway   |

> If a room has **no** image here yet, a clearly-labelled seamless **placeholder**
> 360° panorama is generated for it automatically (so the crossfade still works).
> Drop in the real file and it takes over — placeholders are never used over a
> real image.

## 2. Add / edit the room in `src/rooms.config.js`

Each room carries its bilingual caption and its **look targets** (the guided pan).
Full instructions are at the top of that file. The short version:

```js
{
  id: 'kitchen',                 // → /assets/panoramas/kitchen.jpg
  bg: 'Кухнята',  en: 'The Kitchen',
  subBg: 'Сърцето на дома.', subEn: 'The heart of the home.',
  look: [                        // camera keyframes the scroll pans through
    { yaw: -40, pitch: -4 },     // yaw 0 = centre of the flat image, + = right
    { yaw:  30, pitch: -3 },     // aim a feature at fraction u:  yaw ≈ (u−0.5)×360
  ],
  home: { yaw: 0, pitch: -3 },   // resting view for reduced-motion mode (optional)
}
```

Array order = the order you walk through the home.

## 3. Build

```bash
npm run optimize     # → /public/pano/*.webp + src/panoramas.manifest.json
# or just:
npm run dev          # runs placeholders + optimizer first, then starts Vite
```

The optimizer prints the weight of everything and how much the page actually
loads at once (one width per device, current + next room only).
