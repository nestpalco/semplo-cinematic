import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { hero, ambients, featured, motion } from './sections.config.js'
import manifest from './videos.manifest.json'
import { clipFor } from './video-tier.js'

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollToPlugin)

/* ──────────────────────────────────────────────────────────────────────────
 * SEMPLO — motion layer (v3: every effect section PINS while its effect plays).
 *
 *   On DESKTOP (motion-ok) each effect-bearing section is pinned at top-top for
 *   a TIGHT window, and its effect is a timeline scrubbed 0→1 across the pin,
 *   finishing at EFFECT_END (before release) so nothing is cut off. Pattern:
 *   ONE ScrollTrigger per section, pin:true + anticipatePin + animation:timeline
 *   (the GSAP-recommended way — never two pins on one element).
 *     PATTERN A  pinText   statement bg parallax (+ any photo row) scrubbed;
 *                          title/body do a masked reveal on pin-enter.
 *     PATTERN B  pinVideo  scroll drives video.currentTime (hero + ambients +
 *                          the three FEATURED project clips).
 *     (PATTERN C, the card film strips, was retired 2026-09-16 with the cards.)
 *
 *   On MOBILE / reduced-motion: NO pins, native scroll unchanged — the same
 *   effects run position-linked (nativeStatement / nativeAmbient) and videos
 *   autoplay (main.js).
 *
 *   Titles reveal via maskReveal (SplitText that auto-reverts on complete), so
 *   between reveals the title is plain text and the bilingual textContent swap
 *   just works — no persistent split to rebuild.
 *   All animation is transform/opacity; seeks are ε-gated.
 * ────────────────────────────────────────────────────────────────────────── */

const R = motion.reveal
const isMobile =
  matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches
const fine = matchMedia('(pointer: fine)').matches
const EPS = motion.scrub.seekEpsilon

/* ── MOTION TEMPO (fine-tune here) ──────────────────────────────────────────
 * Three dials, all "1 = as authored, >1 = slower":
 *   reveal   — once-only reveal/tween DURATIONS ×this.
 *   scrub    — scrub catch-up SMOOTHING ×this; bigger = the effect glides
 *              toward the scroll position more gradually.
 *   distance — how much SCROLL a scroll-linked effect needs to finish. This is
 *              the dial that genuinely slows a scroll effect down: the effect
 *              itself is unchanged, it just takes 15% more scrolling to play
 *              out. Feeds the pin lengths AND every native scroll window.
 *
 * Current tuning (2026-08-13): the SCROLL dials took a further ×1.20 on top of
 * the earlier ×1.15 pass — scrub 1.265 × 1.20 = 1.518, distance 1.15 × 1.20 =
 * 1.38 — per the client's "scroll effects 20% slower". `reveal` stays at the
 * ×1.15 tuning (1.1 × 1.15 = 1.265): once-only reveal durations are not scroll
 * effects and were not asked to change.
 *
 * DRIFT is the inverse, for the handful of effects whose scroll window is fixed
 * by the viewport and therefore CANNOT be widened (the ambient-strip and
 * statement parallaxes travel across one full pass by definition). There, the
 * slow-down has to come off the TRAVEL instead — same idea, other lever.
 * The 360° viewer's scroll-yaw is the same case; it lives in
 * sections.config.js as motion.panoScrollYaw. */
const SPEED = { reveal: 1.265, scrub: 1.518, distance: 1.38 }
const DRIFT = +(1 / SPEED.distance).toFixed(4)

/* Pin lengths in viewport-heights — deliberately TIGHT so the page doesn't get
 * exhausting; SPEED.distance stretches them. The effect fills EFFECT_END of the
 * pin, then it holds briefly and releases. Retune the BASE values.
 * The scroll-scrubbed VIDEO sections are not in this table: their pin is
 * derived from the clip's duration (SCRUB_RATE below) so every clip plays the
 * same seconds of video per pixel of scroll. */
const PIN_BASE = { text: 1.0, strip: 1.1 }
const PIN = Object.fromEntries(
  Object.entries(PIN_BASE).map(([k, v]) => [k, +(v * SPEED.distance).toFixed(3)])
)
const EFFECT_END = 0.85

/* Scrub rate — ONE number for every scroll-scrubbed video (hero, featured,
 * scrub ambients): viewport-heights of pin per second of clip. 0.16 is the
 * hero's pre-normalisation pin (1.6 vh for its 10 s clip) — the rate the client
 * has lived with; SPEED.distance stretches it like every other pin. So a 15 s
 * clip pins 1.5× longer than a 10 s one and all of them feel identical under
 * the finger. The effect still fills EFFECT_END of the pin, and the hero's
 * headline tween is placed in timeline fractions, so it follows the pin. */
const SCRUB_RATE_BASE = 0.16
const SCRUB_RATE = +(SCRUB_RATE_BASE * SPEED.distance).toFixed(4) // vh of pin per second of clip
const scrubPin = (duration) => +(duration * SCRUB_RATE).toFixed(3) // pin length (vh) for a clip

/* Which effect families PIN (desktop). Flip a flag to false to un-pin that
 * family → it reverts to native position-linked scroll (shorter page). The
 * scroll-video pins (hero + ambients) always pin — that IS the furnishing
 * moment. Recommended first un-pins if the page feels long: card, then text. */
const PIN_ENABLED = { text: false }

const SMOOTH = +(motion.scrub.smooth * SPEED.scrub).toFixed(3) // scrub catch-up (s)
const REVEAL_DUR = +(R.duration * SPEED.reveal).toFixed(3)
const REVEAL_STAG = +(R.stagger * SPEED.reveal).toFixed(3)
const MASK_DUR = +(1.0 * SPEED.reveal).toFixed(3)

/* ── Native (mobile / unpinned) trigger ranges — begin in view, end before
 * leaving. Every scroll-linked window here is widened by SPEED.distance.
 *   • Windows that are a pure viewport fraction (the card strips: both ends are
 *     measured off the card's TOP) scale exactly in percent — see topPct().
 *   • Windows that also depend on the element's own height (the photo rows) get
 *     a COMPUTED '+=' end instead, so the 15% is exact there too rather than
 *     approximate — see spanEnd(). */
const topPct = (v) => `top ${+v.toFixed(2)}%`
const ROW_SPAN_VH = 0.52 // photo rows: 'top 82%' → 'bottom 30%' + own height
const RANGE = {
  reveal: 'top 80%',
  rowStart: 'top 82%',
}
/* exact '+=' end: a viewport fraction plus the element's own height, scaled. */
const spanEnd = (el, vhPart) => () =>
  '+=' + Math.round((vhPart * window.innerHeight + el.offsetHeight) * SPEED.distance)

const REST_SEL =
  '.interlude__eyebrow, .interlude__body, .interlude__btn, .studio__stat, .studio__media,' +
  '.projects__eyebrow, .projects__more-link, .cta__eyebrow, .cta__text, .cta__btn, .cta__contacts,' +
  '.reviews__eyebrow, .reviews__agg, .review'
/* Sections that get the statement treatment (masked title reveal + staggered
 * rest) but are NOT `.interlude[data-alive]`: the projects header, the contact
 * block, and the reviews section. Listed once, used by both branches of start()
 * so the two can't drift apart. */
const PLAIN_STATEMENTS = '.projects__head, .projects__more, .cta, .reviews'

const scrubDiag = {}
window.__semploScrub = () =>
  console.table(
    Object.fromEntries(Object.entries(scrubDiag).map(([id, d]) => [id, { rs: d.rs, ct: d.ct }]))
  )

let refreshT = 0
const lazyRefresh = () => {
  clearTimeout(refreshT)
  refreshT = setTimeout(() => ScrollTrigger.refresh(), 200)
}

/* ── shared reveal helpers ────────────────────────────────────────────────── */
/* A masked line reveal that CANNOT clobber a mid-flight language switch.
 * While the tween runs, the element's real text is replaced by SplitText's line
 * divs. If applyLang() rewrites textContent in that window it drops those divs,
 * and the pending `onComplete: split.revert()` would then restore the
 * OLD-language HTML — the switch silently undone. So the reveal cancels itself
 * on `semplo:lang`: the element is already showing the new text at rest.
 * (The hero used to carry this guard on its own; every display title needs it,
 * including the reviews section's, so it lives here now.) */
function maskReveal(el, vars = {}) {
  const split = SplitText.create(el, { type: 'lines', mask: 'lines' })
  const cancel = () => {
    document.removeEventListener('semplo:lang', cancel)
    tw.kill()
  }
  document.addEventListener('semplo:lang', cancel)
  const tw = gsap.from(split.lines, {
    yPercent: 115,
    duration: MASK_DUR,
    ease: 'power3.out',
    stagger: 0.11,
    onComplete: () => {
      document.removeEventListener('semplo:lang', cancel)
      split.revert()
    },
    ...vars,
  })
  return tw
}
function riseIn(targets, vars = {}) {
  return gsap.fromTo(
    targets,
    { autoAlpha: 0, y: R.y },
    { autoAlpha: 1, y: 0, duration: REVEAL_DUR, ease: R.ease, stagger: REVEAL_STAG, ...vars }
  )
}
const hide = (t) => gsap.set(t, { autoAlpha: 0, y: R.y })

function hoverDrift(el) {
  if (!fine) return
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect()
    gsap.to(el, {
      x: ((e.clientX - r.left) / r.width - 0.5) * 6,
      y: ((e.clientY - r.top) / r.height - 0.5) * 4,
      duration: 0.5,
      ease: 'power2.out',
    })
  })
  el.addEventListener('pointerleave', () =>
    gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'power3.out' })
  )
}

/* ── PATTERN A background markup + injector ───────────────────────────────── */
const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.5"'
const ALIVE = {
  blueprint: `
    <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
      <g data-speed="0.7" ${STROKE}>
        <rect x="120" y="140" width="640" height="520"/>
        <line x1="120" y1="400" x2="480" y2="400"/>
        <line x1="480" y1="140" x2="480" y2="330"/>
        <path d="M 480 330 A 70 70 0 0 1 550 400"/>
        <line x1="760" y1="300" x2="1300" y2="300" stroke-dasharray="2 10"/>
        <line x1="760" y1="620" x2="1300" y2="620" stroke-dasharray="2 10"/>
      </g>
      <g data-speed="1.4" ${STROKE}>
        <rect x="880" y="380" width="360" height="180" rx="4"/>
        <rect x="920" y="420" width="120" height="100" rx="50"/>
        <circle cx="1150" cy="470" r="46"/>
        <rect x="180" y="480" width="200" height="120" rx="6"/>
        <line x1="180" y1="540" x2="380" y2="540"/>
      </g>
    </svg>`,
  material: `
    <img class="alive-bg__tex" src="/projects/house-troyan/gallery/01-900.webp" alt="" loading="lazy"
         decoding="async" data-speed="0.8" />
    <div class="alive-bg__wash" data-speed="1.5"></div>`,
  geometry: `
    <svg viewBox="0 0 1400 900" preserveAspectRatio="xMidYMid slice">
      <g data-speed="0.6" ${STROKE}>
        <rect x="950" y="120" width="290" height="640"/>
        <rect x="1010" y="200" width="170" height="480"/>
      </g>
      <g data-speed="1.3" ${STROKE}>
        <circle cx="280" cy="620" r="150"/>
        <rect x="160" y="150" width="230" height="150"/>
      </g>
    </svg>`,
}
function injectAlive(section) {
  const variant = section.dataset.alive
  if (!variant || !ALIVE[variant] || section.querySelector('.alive-bg')) return null
  const layer = document.createElement('div')
  layer.className = `alive-bg alive-bg--${variant}`
  layer.setAttribute('aria-hidden', 'true')
  layer.innerHTML = ALIVE[variant]
  section.prepend(layer)
  const sway = gsap.to(layer, {
    xPercent: 1.2, duration: 16, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true,
  })
  ScrollTrigger.create({
    trigger: section, start: 'top bottom', end: 'bottom top',
    onToggle: (s) => (s.isActive ? sway.play() : sway.pause()),
  })
  return layer
}
const speedEls = (layer) => (layer ? [...layer.querySelectorAll('[data-speed]')] : [])

/* eager-load a scrub clip's desktop variant (frequent-keyframe encodes of
 * 2–10 MB; the lazy IO left them undecoded during the scrub window). The tier
 * (sd 1280 / hd 1920) is the same one main.js chose for the poster. */
function eagerLoad(video, m) {
  if (video.dataset.loaded) return
  video.dataset.loaded = '1'
  video.preload = 'auto'
  video.src = clipFor(m)
  video.load()
}
// a proxy tween that drives currentTime, ε-gated — the "seek" half of Pattern B
function seekTween(tl, video, duration) {
  const proxy = { t: 0 }
  tl.to(proxy, {
    t: Math.max(0, duration - 0.04),
    duration: EFFECT_END,
    ease: 'none',
    onUpdate() {
      if (video.readyState < 2 || video.seeking) return
      if (Math.abs(proxy.t - video.currentTime) > EPS) video.currentTime = proxy.t
    },
  }, 0)
  tl.to({}, { duration: 1 - EFFECT_END }) // hold the last frame before release
}

/* ── DESKTOP pinned builders ──────────────────────────────────────────────── */
function pinCommon(section, length, tl, extra = {}) {
  return ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => '+=' + Math.round(window.innerHeight * length),
    pin: true,
    pinSpacing: true,
    anticipatePin: 1,
    scrub: SMOOTH,
    animation: tl,
    invalidateOnRefresh: true,
    ...extra,
  })
}

function pinHero() {
  const sec = document.querySelector('[data-hero]')
  const video = sec.querySelector('[data-hero-video]')
  const m = manifest[hero.id]
  const playable = () => sec.classList.add('is-playable')
  if (video.readyState >= 2) playable()
  else video.addEventListener('loadeddata', playable, { once: true })
  scrubDiag.hero = { get rs() { return video.readyState }, get ct() { return +video.currentTime.toFixed(2) } }

  const tl = gsap.timeline()
  seekTween(tl, video, m.duration) // scroll furnishes the room
  tl.to('.hero__inner', { y: -44, autoAlpha: 0, ease: 'none', duration: 0.28 }, EFFECT_END - 0.28)
  pinCommon(sec, scrubPin(m.duration), tl) // pin ∝ clip duration (SCRUB_RATE)
}

function pinVideo(sec, cfg) {
  const video = sec.querySelector('video')
  const m = manifest[cfg.id]
  if (!video || !m) return
  eagerLoad(video, m)
  const playable = () => video.classList.add('is-playable')
  if (video.readyState >= 2) playable()
  else video.addEventListener('loadeddata', playable, { once: true })
  scrubDiag[cfg.id] = { get rs() { return video.readyState }, get ct() { return +video.currentTime.toFixed(2) } }

  const tl = gsap.timeline()
  seekTween(tl, video, m.duration)
  const cap = sec.querySelector('.ambient__cap')
  if (cap) hide(cap.children)
  const reveal = cap ? () => riseIn(cap.children) : undefined
  pinCommon(sec, scrubPin(m.duration), tl, { onEnter: reveal, onEnterBack: reveal }) // pin ∝ clip duration
}

function pinText(sec) {
  const layer = injectAlive(sec)
  const track = sec.querySelector('[data-hstrip-track]')
  const tl = gsap.timeline()
  speedEls(layer).forEach((el) => {
    const sp = parseFloat(el.dataset.speed) || 1
    const t = 46 * sp * DRIFT
    tl.fromTo(el, { y: -t }, { y: t, ease: 'none', duration: 1 }, 0)
  })
  if (track) {
    track.querySelectorAll('img').forEach((img) => {
      if (!img.complete) img.addEventListener('load', lazyRefresh, { once: true })
    })
    tl.fromTo(
      track,
      { x: 0 },
      { x: () => -Math.max(0, track.scrollWidth - track.parentElement.clientWidth), ease: 'none', duration: EFFECT_END },
      0
    )
  }
  if (!tl.getChildren().length) tl.to({}, { duration: 1 }) // always give the pin a timeline

  const display = sec.querySelector('.interlude__title, .cta__title')
  const rest = sec.querySelectorAll(REST_SEL)
  if (display) gsap.set(display, { autoAlpha: 0 })
  if (rest.length) hide(rest)
  const reveal = () => {
    if (display) { gsap.set(display, { autoAlpha: 1 }); maskReveal(display) }
    if (rest.length) riseIn(rest, { delay: 0.1 })
  }
  pinCommon(sec, track ? PIN.strip : PIN.text, tl, { onEnter: reveal, onEnterBack: reveal })
}

/* ── NATIVE (mobile / unpinned) builders — position-linked, no pin ─────────── */
function nativeParallax(sec, els) {
  els.forEach((el) => {
    const sp = parseFloat(el.dataset.speed) || 1
    // one full pass IS the window here, so the 15% slow-down comes off travel
    const t = 30 * sp * DRIFT
    gsap.fromTo(el, { y: -t }, {
      y: t, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: SMOOTH },
    })
  })
}
function nativeHstrip(track) {
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', lazyRefresh, { once: true })
  })
  const host = track.closest('[data-hstrip]')
  gsap.fromTo(track, { x: 0 }, {
    x: () => -Math.max(0, track.scrollWidth - track.parentElement.clientWidth),
    ease: 'none',
    scrollTrigger: {
      trigger: host,
      start: RANGE.rowStart,
      end: spanEnd(host, ROW_SPAN_VH), // was 'bottom 30%' — now exact + slowed
      scrub: SMOOTH,
      invalidateOnRefresh: true,
    },
  })
}
function nativeStatement(sec) {
  const layer = injectAlive(sec)
  if (layer) nativeParallax(sec, speedEls(layer))
  const track = sec.querySelector('[data-hstrip-track]')
  if (track) nativeHstrip(track)
  const display = sec.querySelector('.interlude__title, .cta__title, .projects__title, .reviews__title')
  const rest = sec.querySelectorAll(REST_SEL)
  if (display) gsap.set(display, { autoAlpha: 0 })
  if (rest.length) hide(rest)
  ScrollTrigger.create({
    trigger: sec, start: RANGE.reveal, once: true,
    onEnter: () => {
      if (display) { gsap.set(display, { autoAlpha: 1 }); maskReveal(display) }
      if (rest.length) riseIn(rest, { delay: 0.12 })
    },
  })
  if (fine && display) hoverDrift(display)
}
function nativeAmbient(sec) {
  const cap = sec.querySelector('.ambient__cap')
  if (cap) {
    hide(cap.children)
    ScrollTrigger.create({ trigger: sec, start: RANGE.reveal, once: true, onEnter: () => riseIn(cap.children) })
    const t = 26 * DRIFT
    gsap.fromTo(cap, { y: t }, {
      y: -t, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: SMOOTH },
    })
  }
  const media = sec.querySelector('[data-parallax]')
  const px = motion.parallax * DRIFT // fixed window → slow it by travel
  if (media) gsap.fromTo(media, { y: () => -sec.offsetHeight * px }, {
    y: () => sec.offsetHeight * px, ease: 'none',
    scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: SMOOTH, invalidateOnRefresh: true },
  })
}

/* ── pin-aware anchor scroll ───────────────────────────────────────────────
 * ScrollToPlugin drives window scroll frame-by-frame IN SYNC with ScrollTrigger,
 * so it lands accurately even with pins active (native scrollTo jitters against
 * the pins' refreshes). `offsetY` clears the fixed nav; `autoKill` stops if the
 * user grabs the scroll. main.js calls this once the motion chunk is present. */
const NAV_H = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 76
export function scrollToTarget(id) {
  // resolve to a FIXED numeric target (pin-spacers give stable absolute
  // positions). `y: element` re-resolves each frame and drifts against pins.
  const resolveY = () => {
    if (id === 'top') return 0
    const el = document.getElementById(id)
    if (!el) return null
    return Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY - (NAV_H - 1)))
  }
  const y = resolveY()
  if (y == null) return
  // autoKill:false — scrolling THROUGH the pinned hero perturbs scroll each
  // frame, which autoKill misreads as a user grab and cancels the tween.
  gsap.to(window, {
    duration: 0.9,
    ease: 'power2.inOut',
    overwrite: true,
    scrollTo: { y, autoKill: false },
    // The ScrollToPlugin glide can stall short of the mark when the path crosses
    // a pinned section — it catches on the pin boundary and lands ~1 viewport
    // early (seen on #catalogs, just below a pinned ambient). A NATIVE smooth
    // scroll isn't pin-limited, so finish on arrival: re-resolve the target
    // (pins have settled the exact position) and glide out any residual gap,
    // repeating a couple of times until it lands under the nav.
    onComplete: () => {
      let tries = 0
      const settle = () => {
        const y2 = resolveY()
        if (y2 == null) return
        if (Math.abs(y2 - window.scrollY) > 3 && tries < 3) {
          tries += 1
          window.scrollTo({ top: y2, behavior: 'smooth' })
          setTimeout(settle, 650)
        }
      }
      setTimeout(settle, 60)
    },
  })
}

/* ── prime(): hide the hero copy ASAP (behind the loader) ─────────────────── */
export function prime() {
  gsap.set('.hero__title', { autoAlpha: 0 })
  hide(['.hero__sub', '.hero__cta'])
}

/* ── start(): wire the whole page ─────────────────────────────────────────── */
export async function start() {
  await document.fonts.ready

  /* HERO intro (both modes): masked line reveal + sub/cta rise */
  {
    const title = document.querySelector('.hero__title')
    gsap.set(title, { autoAlpha: 1 })
    const heroReveal = maskReveal(title, { delay: 0.15 })
    // If the language is flipped DURING the intro, applyLang() rewrites the
    // title's text (dropping the live SplitText lines), but the reveal's
    // pending `onComplete: split.revert()` would then restore the OLD-language
    // HTML and clobber the switch. Cancel the in-flight reveal so its revert
    // can't fire; the title is already showing the new text at rest.
    document.addEventListener('semplo:lang', () => heroReveal.kill(), { once: true })
    riseIn(['.hero__sub', '.hero__cta'], { delay: 0.55, stagger: 0.14 })
    hoverDrift(title)
  }

  if (isMobile) {
    /* MOBILE — native scroll, no pins. Videos autoplay via main.js. */
    const video = document.querySelector('[data-hero-video]')
    if (video) {
      const KB = motion.kenBurns
      let kb = null
      gsap.set(video, { transformOrigin: '50% 42%' })
      video.addEventListener('ended', () => {
        kb = gsap.fromTo(video, { scale: 1 }, { scale: KB.heroScale, duration: KB.heroSeconds, ease: 'none' })
      })
      video.addEventListener('play', () => { kb?.kill(); kb = null; gsap.set(video, { scale: 1 }) })
    }
    document.querySelectorAll(`.interlude, ${PLAIN_STATEMENTS}`).forEach(nativeStatement)
    document.querySelectorAll('[data-ambient]').forEach(nativeAmbient) // incl. the featured clips
  } else {
    /* DESKTOP — pin every effect section. */
    pinHero()
    // Pattern A statement sections (studio, materials, outlook, catalogs)
    document.querySelectorAll('.interlude[data-alive]').forEach((sec) =>
      PIN_ENABLED.text ? pinText(sec) : nativeStatement(sec)
    )
    // Pattern B scrub-video ambients (ambient1, ambient2) + the three FEATURED
    // project clips — always pin
    document.querySelectorAll('[data-ambient]').forEach((sec) => {
      const cfg = [...ambients, ...featured].find((a) => a.id === sec.dataset.id)
      if (cfg?.scrubVideo) pinVideo(sec, cfg)
      else nativeAmbient(sec) // ambient3 (autoplay loop) stays native
    })
    // Unpinned desktop sections: projects header, reviews, contact (all too tall
    // to pin — the contact block carries the map, the reviews grid is a full band)
    document.querySelectorAll(PLAIN_STATEMENTS).forEach(nativeStatement)
  }

  /* Catalogue cards — staggered reveal on enter (both modes) */
  {
    const cards = gsap.utils.toArray('.catcard')
    if (cards.length) {
      gsap.set(cards, { autoAlpha: 0, y: 28 })
      ScrollTrigger.batch(cards, {
        start: RANGE.reveal, once: true,
        onEnter: (els) => riseIn(els, { stagger: 0.08 }),
      })
    }
  }

  /* Footer reveal (both modes) */
  {
    const foot = document.querySelector('.foot')
    if (foot) {
      gsap.set(foot, { autoAlpha: 0, y: 18 })
      ScrollTrigger.create({
        trigger: foot, start: 'top 96%', once: true,
        onEnter: () => gsap.to(foot, { autoAlpha: 1, y: 0, duration: +(0.8 * SPEED.reveal).toFixed(3), ease: R.ease }),
      })
    }
  }

  /* Magnetic-ish CTA hover (desktop pointers only) */
  if (fine) {
    document.querySelectorAll('.hero__cta, .cta__btn').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect()
        gsap.to(btn, {
          x: ((e.clientX - (r.left + r.width / 2)) / r.width) * 10,
          y: ((e.clientY - (r.top + r.height / 2)) / r.height) * 6,
          duration: 0.4, ease: 'power2.out',
        })
      })
      btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'power3.out' }))
    })
  }

  // images that change layout height → recompute pin positions once settled
  window.addEventListener('load', () => ScrollTrigger.refresh())
}

/* ═══════════════ PORTFOLIO PAGES (/portfolio/, /portfolio/<id>/) ═══════════════
 * Entered from src/page.js. Same helpers, same dials, same feel as the
 * homepage — a statement-style reveal for the headers, a staggered rise for
 * the cards, the overlay's gentle frame parallax for the gallery. No pins:
 * these pages are native scroll in every mode.
 *
 * html.motion-pending (set by each page's inline boot script) keeps the
 * reveal targets invisible until the hide() calls below have put the inline
 * autoAlpha:0 on them — lift() then removes the class and the tweens take
 * over, so nothing ever flashes visible-then-hidden. */
const lift = () => document.documentElement.classList.remove('motion-pending')

/* ── UTILITY-PAGE TEMPO ──────────────────────────────────────────────────
 * The portfolio pages exist to show the work, so the reveal there is quick
 * polish, not an entrance: shorter tweens, tighter staggers, triggers that
 * fire as soon as an element's top clears the fold, and no waiting on the
 * web font beyond a short grace (SplitText re-measures on revert anyway).
 * The homepage keeps its cinematic SPEED-scaled pacing — none of this
 * touches start(). */
const PAGE = {
  dur: 0.5, // rise-in duration (homepage: ~1.07s)
  stagger: 0.045,
  mask: 0.55, // masked title lines (homepage: ~1.27s)
  maskStagger: 0.06,
  delay: 0.03,
  reveal: 'top 92%', // fire early — nothing waits for the visitor to scroll past it
  fontGrace: 350, // ms to wait for fonts before revealing regardless
}
const fontsSoon = () =>
  Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, PAGE.fontGrace))])

/* masked title reveal + staggered rise of everything else in the section */
function pageStatement(sec, displaySel, restSel, { delay = PAGE.delay } = {}) {
  const display = displaySel ? sec.querySelector(displaySel) : null
  const rest = restSel ? sec.querySelectorAll(restSel) : []
  if (display) gsap.set(display, { autoAlpha: 0 })
  if (rest.length) hide(rest)
  ScrollTrigger.create({
    trigger: sec, start: PAGE.reveal, once: true,
    onEnter: () => {
      if (display) {
        gsap.set(display, { autoAlpha: 1 })
        maskReveal(display, { duration: PAGE.mask, stagger: PAGE.maskStagger })
      }
      if (rest.length) riseIn(rest, { delay, duration: PAGE.dur, stagger: PAGE.stagger })
    },
  })
  if (fine && display) hoverDrift(display)
}
function footReveal() {
  const foot = document.querySelector('.foot')
  if (!foot) return
  gsap.set(foot, { autoAlpha: 0, y: 18 })
  ScrollTrigger.create({
    trigger: foot, start: 'top 96%', once: true,
    onEnter: () => gsap.to(foot, { autoAlpha: 1, y: 0, duration: PAGE.dur, ease: R.ease }),
  })
}
function magnetic(sel) {
  if (!fine) return
  document.querySelectorAll(sel).forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect()
      gsap.to(btn, {
        x: ((e.clientX - (r.left + r.width / 2)) / r.width) * 10,
        y: ((e.clientY - (r.top + r.height / 2)) / r.height) * 6,
        duration: 0.4, ease: 'power2.out',
      })
    })
    btn.addEventListener('mouseleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'power3.out' }))
  })
}

/* ── /portfolio/ — header statement, filter row, staggered card grid ────── */
export async function startPortfolio() {
  await fontsSoon()
  const head = document.querySelector('.pf-head')
  if (head) pageStatement(head, '.pf-head__title', '.pf-head__eyebrow, .pf-head__intro')
  const filter = document.querySelector('.pf-filter')
  if (filter) {
    hide(filter)
    ScrollTrigger.create({
      trigger: filter, start: PAGE.reveal, once: true,
      onEnter: () => riseIn(filter, { delay: 0.12, duration: PAGE.dur }),
    })
  }
  const cards = gsap.utils.toArray('.pcard')
  if (cards.length) {
    gsap.set(cards, { autoAlpha: 0, y: 24 })
    ScrollTrigger.batch(cards, {
      start: PAGE.reveal, once: true,
      onEnter: (els) => riseIn(els, { duration: PAGE.dur, stagger: PAGE.stagger }),
    })
    // a filter pick re-flows the grid (cards hide, others move up): re-measure
    // at once so a card pulled into view gets its rise-in now, not on the next
    // scroll — and one already revealed keeps its inline autoAlpha:1
    document.addEventListener('semplo:filter', () => ScrollTrigger.refresh())
  }
  footReveal()
  lift()
  window.addEventListener('load', () => ScrollTrigger.refresh())
}

/* ── /portfolio/<id>/ — hero copy on load, statements, gallery parallax ─── */
export async function startProject() {
  await fontsSoon()
  /* everything that must be hidden BEFORE the pending class is lifted */
  const heroBits = gsap.utils.toArray('.pj-hero__eyebrow, .pj-hero__title, .pj-hero__ctrl')
  hide(heroBits)
  const intro = document.querySelector('.pj-intro')
  if (intro) pageStatement(intro, null, '.pj-meta, .pj-text__col')
  const pano = document.querySelector('.pj-pano')
  if (pano) pageStatement(pano, '.pj-h2', null)
  const nav = document.querySelector('.pj-nav')
  if (nav) pageStatement(nav, null, '.pj-nav__link, .pj-nav__all', { delay: 0 })
  const cta = document.querySelector('.pj-cta')
  if (cta) pageStatement(cta, '.pj-cta__title', '.pj-cta__eyebrow, .pj-cta__text, .cta__btn')
  footReveal()
  lift()

  /* hero copy rises on load — the photo is already there, so no wait */
  riseIn(heroBits, { delay: 0.08, duration: PAGE.dur, stagger: 0.08 })
  const title = document.querySelector('.pj-hero__title')
  if (title) hoverDrift(title)

  /* gallery frames: the overlay's gentle parallax, against the window */
  const fp = +(5 * DRIFT).toFixed(3) // fixed window → slow it by travel
  document.querySelectorAll('.pj-frame img').forEach((img) => {
    gsap.fromTo(img, { yPercent: -fp, scale: 1.12 }, {
      yPercent: fp, scale: 1.12, ease: 'none',
      scrollTrigger: {
        trigger: img.parentElement,
        start: 'top bottom', end: 'bottom top', scrub: SMOOTH, invalidateOnRefresh: true,
      },
    })
    if (!img.complete) img.addEventListener('load', lazyRefresh, { once: true })
  })

  magnetic('.pj-cta .cta__btn')
  window.addEventListener('load', () => ScrollTrigger.refresh())
}

