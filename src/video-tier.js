/*
 * ── Video tier ────────────────────────────────────────────────────────────
 * ONE place decides which encode of a video slot this visitor gets. Both the
 * page (main.js: markup, posters, lazy loader) and the motion layer
 * (motion.js: scrub eager-load) import it, so a slot can never mix tiers.
 *
 *   mobile  → <id>-720.mp4 + poster-720      (≤820px or a coarse pointer)
 *   hd      → <id>-1920.mp4 + poster-1920    (viewports wider than 1440 CSS px,
 *                                             or DPR ≥ 1.5 at ≥ 1024 px — Retina
 *                                             laptops upscale a 1280 clip 2×)
 *   sd      → <id>-1280.mp4 + poster         (everything else)
 *
 * The tier is decided ONCE at boot: a resize across the breakpoint keeps the
 * clip that is already decoded — re-fetching 5–10 MB mid-scroll is worse than
 * a slightly soft frame. Slots without an HD encode (the ambient loops) fall
 * back to their standard file, so the helpers are safe for every manifest entry.
 */
export const isMobile =
  matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches

export const isHd =
  !isMobile &&
  matchMedia('(min-width: 1441px), (min-width: 1024px) and (min-resolution: 1.5dppx)').matches

export const tier = isMobile ? 'mobile' : isHd ? 'hd' : 'sd'

// the clip to load for a manifest entry
export const clipFor = (m) =>
  `/videos/${isMobile ? m.mobile : isHd && m.desktopHd ? m.desktopHd : m.desktop}`

// the poster (first-paint image) for a manifest entry
export const posterFor = (m) =>
  `/videos/${isMobile && m.posterMobile ? m.posterMobile : isHd && m.posterHd ? m.posterHd : m.poster}`

// the FIRST-frame poster a scrubbed slot rests on (only the hero has one —
// its default poster is the LAST frame, see optimize-videos.mjs)
export const posterFirstFor = (m) =>
  `/videos/${isHd && m.posterFirstHd ? m.posterFirstHd : m.posterFirst}`
