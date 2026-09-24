/*
 * ── Video tier ────────────────────────────────────────────────────────────
 * ONE place decides which encode of a video slot this visitor gets. Both the
 * page (main.js: markup, posters, lazy loader) and the motion layer
 * (motion.js: scrub eager-load) import it, so a slot can never mix tiers.
 *
 * Desktop (scrubbed, full-bleed, landscape):
 *   hd      → <id>-1920.mp4 + poster-1920    (viewports wider than 1440 CSS px,
 *                                             or DPR ≥ 1.5 at ≥ 1024 px — Retina
 *                                             laptops upscale a 1280 clip 2×)
 *   sd      → <id>-1280.mp4 + poster         (everything else)
 *
 * Mobile (≤ 820 px or a coarse pointer; forward autoplay, no scrub):
 *   portrait-hd → <id>-portrait-hd.mp4 (≤ 1080×1920) + poster-portrait-hd
 *   portrait    → <id>-portrait.mp4    (≤ 720×1280)  + poster-portrait
 *                 PHONES: viewport aspect ≤ 5:8. Every full-bleed section is
 *                 narrower than 9:16 there, so object-fit: cover was showing a
 *                 ~190 px-wide strip of the 720 landscape file painted 6× up
 *                 (measured 2026-09-24). The portrait files ARE that centre
 *                 strip, at up to the source's full height — same framing,
 *                 six times the detail. hd where the source is 4K; a 1080p
 *                 delivery has only the one portrait file and gets it at any DPR.
 *   mobile-hd   → <id>-1080.mp4 + poster-1080  (landscape / tablet, DPR ≥ 2)
 *   mobile      → <id>-720.mp4  + poster-720   (landscape / tablet, DPR 1)
 *
 * The tier is decided ONCE at boot: a resize or rotation keeps the clip that
 * is already decoded — re-fetching 1–10 MB mid-scroll is worse than a slightly
 * soft frame. Every helper falls back to the next file down when a manifest
 * entry lacks a variant (older manifests, the ambient loops' missing HD), so
 * they are safe for every entry.
 */
export const isMobile =
  matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches

// phones held upright: taller than 8:5 → the 9:16 centre-crop encodes
export const isPortrait = isMobile && matchMedia('(max-aspect-ratio: 5/8)').matches

// DPR ≥ 2 → the larger of each mobile pair (1080 landscape / 1080×1920 portrait)
export const isMobileHd = isMobile && matchMedia('(min-resolution: 2dppx)').matches

export const isHd =
  !isMobile &&
  matchMedia('(min-width: 1441px), (min-width: 1024px) and (min-resolution: 1.5dppx)').matches

export const tier = isMobile
  ? (isPortrait ? 'portrait' : 'mobile') + (isMobileHd ? '-hd' : '')
  : isHd
    ? 'hd'
    : 'sd'

// the hd member of a mobile pair when this device rates it AND the manifest has it
const pair = (m, hdKey, sdKey) => (isMobileHd && m[hdKey]) || m[sdKey]

// the clip to load for a manifest entry
export const clipFor = (m) => {
  if (isMobile) {
    const file = isPortrait && m.portrait ? pair(m, 'portraitHd', 'portrait') : pair(m, 'mobileHd', 'mobile')
    return `/videos/${file}`
  }
  return `/videos/${isHd && m.desktopHd ? m.desktopHd : m.desktop}`
}

// the poster (first-paint image) for a manifest entry
export const posterFor = (m) => {
  if (isMobile) {
    const file =
      (isPortrait && m.posterPortrait ? pair(m, 'posterPortraitHd', 'posterPortrait') : null) ||
      pair(m, 'posterMobileHd', 'posterMobile') ||
      m.poster
    return `/videos/${file}`
  }
  return `/videos/${isHd && m.posterHd ? m.posterHd : m.poster}`
}

// the FIRST-frame poster a scrubbed slot rests on (only the hero has one —
// its default poster is the LAST frame, see optimize-videos.mjs). Desktop only:
// mobile never scrubs, so it never needs frame 0.
export const posterFirstFor = (m) =>
  `/videos/${isHd && m.posterFirstHd ? m.posterFirstHd : m.posterFirst}`
