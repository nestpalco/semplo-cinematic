/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SINGLE SOURCE OF TRUTH — the Vellora-style cinematic forward-glide hero.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Each entry is ONE scene: a FLAT interior/exterior photograph we DOLLY INTO
 *  (the camera glides forward toward a focal feature), a bilingual headline
 *  (BG / EN) shown as a real HTML overlay, and the per-scene "feel" tuning.
 *  Array order === walk-through order: you glide THROUGH the home, scene to
 *  scene, each cut a horizontal wipe with the forward motion never stalling.
 *
 *  ── HOW THE DOLLY WORKS ──────────────────────────────────────────────────
 *  A flat photo has real depth + a vanishing point, so scaling the image UP
 *  from its focal point (transform-origin) reads as the camera pushing FORWARD
 *  toward that point — gliding into the room toward a destination (a doorway,
 *  a window, the sea). A subtle translate nudges the focal toward screen centre
 *  as you arrive, so the destination "lands" in front of you.
 *
 *  ── FOCAL POINT (the destination you glide toward) ───────────────────────
 *  `focal: { x, y }` in PERCENT of the image (0,0 = top-left … 100,100 =
 *  bottom-right). This is the dolly's transform-origin — the one point that
 *  stays put while everything else expands past it. Aim it at the deepest
 *  feature: the lit doorway, the bright far window, the horizon.
 *
 *  ── DOLLY RANGE (how far the camera travels) ─────────────────────────────
 *  `dolly: { from, to }` = the camera's start and end SCALE for the scene.
 *    • from < 1.0  → start slightly PULLED BACK (more of the room shows). The
 *                    layer still fully covers the viewport because every photo
 *                    carries a constant overscan (`motion.cover`, ~1.08), so
 *                    `from` can dip to ~0.94 without revealing edge gaps.
 *    • to   > 1.0  → end pushed IN toward the focal point.
 *  The FELT travel is (to − from): widening the range — especially by lowering
 *  `from` — increases the sense of forward motion WITHOUT pushing the end-scale
 *  (`to`) harder into the warp zone.
 *
 *  ── THE LIMIT IS FISHEYE WARP ────────────────────────────────────────────
 *  These are WIDE / fisheye 1080px stills, so the ceiling is set by `to` (the
 *  closest point): magnify too far and the baked barrel curvature swims and the
 *  upscaled pixels soften. What matters is the EFFECTIVE magnification at the
 *  end = `to × motion.cover`. Guide rails (effective magnification):
 *
 *      ≤1.17  gentle/safe   ·   1.18–1.23  noticeable   ·   1.24–1.29 strong
 *      (only stable central-vanishing-point frames, e.g. arrival's path)
 *      >~1.31  the fisheye lines bow / image swims — back off.
 *  Frames whose depth runs straight down the centre (arrival) tolerate the most;
 *  broad rooms whose curvature sits mid-frame (living, kitchen) bow soonest, so
 *  raise their `to` cautiously. `from` is purely the pull-back — it costs no warp.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const scenes = [
  {
    id: 'arrival', // /assets/scenes/arrival.png — dusk exterior, lit entrance, paved path
    bg: 'Пристигане',
    en: 'The Arrival',
    subBg: 'По пътеката, към светлината на дома.',
    subEn: 'Down the path, toward the light of home.',
    // The path runs dead-centre straight to the glowing double doorway, a hair
    // above the middle — a stable central vanishing point, so we push the most.
    focal: { x: 50, y: 43 },
    // STRONG opener — most headroom (central vanishing point). Pull back to a wide
    // establishing view, then glide deep down the path into the doorway.
    // effective end ≈ 1.18 × 1.08 = 1.27 (≈27% mag) — closest to its ~1.29 ceiling.
    dolly: { from: 0.95, to: 1.18 },
  },
  {
    id: 'living', // /assets/scenes/living.png — double-height living room, media wall
    bg: 'Дневната',
    en: 'The Living Room',
    subBg: 'Светлина, която диша.',
    subEn: 'Light that breathes.',
    // Glide toward the central fireplace/media wall under the vaulted ceiling.
    focal: { x: 50, y: 47 },
    // Wide fisheye room, curvature mid-frame — bows soonest, so raise `to` cautiously.
    // effective end ≈ 1.10 × 1.08 = 1.19 (≈19% mag) — ~3pts under its ~1.22 ceiling.
    dolly: { from: 0.96, to: 1.1 },
  },
  {
    id: 'kitchen', // /assets/scenes/kitchen.png — island, far bright window/dining
    bg: 'Кухнята',
    en: 'The Kitchen',
    subBg: 'Сърцето на дома.',
    subEn: 'The heart of the home.',
    // The island leads the eye back to the bright far windows — glide that way.
    focal: { x: 50, y: 42 },
    // Long room but barrel curvature sits mid-frame — keep `to` modest.
    // effective end ≈ 1.10 × 1.08 = 1.19 (≈19% mag) — ~3pts under its ~1.22 ceiling.
    dolly: { from: 0.96, to: 1.1 },
  },
  {
    id: 'retreat', // /assets/scenes/retreat.png — sea-view living, the closer
    bg: 'Уединение',
    en: 'The Retreat',
    subBg: 'Където погледът среща морето.',
    subEn: 'Where the view meets the sea.',
    // The horizon/sea sits just above centre through the glass — glide to it.
    focal: { x: 50, y: 40 },
    // The closer — a touch more pull toward the water. Some headroom (the glass/
    // horizon is fairly rectilinear), but the side walls curve, so stay moderate.
    // effective end ≈ 1.13 × 1.08 = 1.22 (≈22% mag) — ~3pts under its ~1.25 ceiling.
    dolly: { from: 0.955, to: 1.13 },
  },
]

// UI copy, bilingual. [bg, en]
export const ui = {
  brand: ['Semplo', 'Semplo'],
  tagline: ['Интериорно студио', 'Interior studio'],
  nav: {
    projects: ['Проекти', 'Projects'],
    studio: ['Студио', 'Studio'],
    contact: ['Контакт', 'Contact'],
  },
  scrollHint: ['Скрол', 'Scroll'],
  cta: {
    eyebrow: ['Портфолио', 'Portfolio'],
    title: ['Разгледайте нашите проекти.', 'Explore our projects.'],
    text: [
      'Подбрана селекция от завършени интериори — от градски апартаменти до къщи край морето.',
      'A curated selection of finished interiors — from city apartments to houses by the sea.',
    ],
    button: ['Вижте проектите', 'View projects'],
  },
}

/*
 * ── Choreography & camera tuning ───────────────────────────────────────────
 * Tweak the "feel" of the forward-glide here without touching main.js.
 */
export const motion = {
  // ★★★ THE PACING DIAL ★★★ — viewport-heights of scroll each scene's slow GLIDE
  // (its long "hold") occupies. This is the ONE number to fine-tune how slow /
  // cinematic the forward motion feels. Bigger = slower & more scroll per scene.
  //   Desktop total pin ≈ scenes × (scrollPerScene + wipeScroll) of viewport.
  //   This 6.0 is ~5× the old pacing — a deliberate, gliding push through each room.
  // (Mobile + reduced-motion DON'T pin — native scroll, unaffected by this.)
  scrollPerScene: 6.0,

  // The wipe between scenes gets its OWN small scroll budget, so the cut stays a
  // SNAPPY transition no matter how long the glide is. The glide spends this many
  // viewport-heights of scroll. glide : wipe ≈ 6.0 : 0.7 ≈ 8.6 : 1.
  wipeScroll: 0.7,
  wipeEase: 'power1.inOut', // the clip-reveal easing (the "swipe" feel)

  // Dolly velocity shaping — position along each scene's `from → to` range, where
  // 0 = `from` (start, pulled back) and 1 = `to` (end, pushed in). The endpoints
  // never change, so the peak scale — and thus the fisheye warp — is governed only
  // by per-scene `to`. The long HOLD carries most of the travel (rest→holdEnd) =
  // the slow glide, while the short wipe windows carry only a gentle surge
  // (holdEnd→to accelerate out / from→rest decelerate in) so cuts stay continuous.
  dollyEnter: 0.0, //   position at a scene's first frame (= `from`; reads as "already
  //                    moving" via velocity, not via a zoom offset).
  dollyRest: 0.14, //   position reached by the end of the decelerating entrance.
  dollyHoldEnd: 0.82, // position reached by the end of the long hold; the exit wipe
  //                    then accelerates the last 0.18 of the range up to `to`.

  // Constant photo OVERSCAN (a base scale baked onto every layer) so a scene can
  // start PULLED BACK (`dolly.from` < 1.0) and still fully cover the viewport — no
  // edge gaps. It's also the multiplier on every scale: effective on-screen
  // magnification = dolly scale × cover. Raise it only if you push a `from` below
  // ~0.94 (needs more overscan to keep covering); higher = a touch more baseline zoom.
  cover: 1.08,

  // A subtle translate so the focal point drifts toward screen centre as you
  // glide in (the destination "arrives" in front of you). Fraction of the
  // focal's offset from centre, at full dolly. 0 = pure zoom, no translate.
  focalDrift: 0.14,

  // Always-on ambient drift (so a held scene is never dead-static). Amplitude
  // in % of the frame, and the loop period in seconds. Skipped in reduced-motion.
  ambient: { amp: 0.7, seconds: 15 },

  scrub: 0.6, // ScrollTrigger scrub smoothing (seconds of catch-up). Higher = silkier, looser.
  wipeDir: 'ltr', // horizontal wipe direction: 'ltr' reveals left→right (forward feel)
}
