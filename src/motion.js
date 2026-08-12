import gsap from 'gsap'
import ScrollTrigger from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { ScrollToPlugin } from 'gsap/ScrollToPlugin'
import { hero, ambients, motion } from './sections.config.js'
import manifest from './videos.manifest.json'

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
 *     PATTERN B  pinVideo  scroll drives video.currentTime (hero + ambients).
 *     PATTERN C  pinCard   the card's film strip advances rightward.
 *
 *   On MOBILE / reduced-motion: NO pins, native scroll unchanged — the same
 *   effects run position-linked (nativeStatement / nativeAmbient) and videos
 *   autoplay (main.js). The card film strips DO advance on mobile, but stepped a
 *   whole frame at a time rather than scrubbed per pixel — see mobileCard().
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
 * Everything is currently 15% slower than the previous tuning: reveal and scrub
 * were 1.1 (→ 1.1 × 1.15 = 1.265), and distance is the new dial at 1.15.
 *
 * DRIFT is the inverse, for the handful of effects whose scroll window is fixed
 * by the viewport and therefore CANNOT be widened (the ambient-strip and
 * statement parallaxes travel across one full pass by definition). There,
 * "15% slower" has to come off the TRAVEL instead — same idea, other lever.
 * The 360° viewer's scroll-yaw is the same case; it lives in
 * sections.config.js as motion.panoScrollYaw. */
const SPEED = { reveal: 1.265, scrub: 1.265, distance: 1.15 }
const DRIFT = +(1 / SPEED.distance).toFixed(4)

/* Pin lengths in viewport-heights — deliberately TIGHT so the page doesn't get
 * exhausting; SPEED.distance stretches them. The effect fills EFFECT_END of the
 * pin, then it holds briefly and releases. Retune the BASE values. */
const PIN_BASE = { hero: 1.6, text: 1.0, video: 1.2, card: 0.9, strip: 1.1 }
const PIN = Object.fromEntries(
  Object.entries(PIN_BASE).map(([k, v]) => [k, +(v * SPEED.distance).toFixed(3)])
)
const EFFECT_END = 0.85

/* Which effect families PIN (desktop). Flip a flag to false to un-pin that
 * family → it reverts to native position-linked scroll (shorter page). The
 * scroll-video pins (hero + ambients) always pin — that IS the furnishing
 * moment. Recommended first un-pins if the page feels long: card, then text. */
const PIN_ENABLED = { text: false, card: false }

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
const CARD_END = 3 // strip finishes with the card's top just under the nav
const CARD_SPAN = 43 // base vh of scroll the desktop strip advance occupies
const MCARD_START = 88 // mobile: start as the card's top enters from below
const MCARD_SPAN_VH = 0.68 // mobile: + the card's own height (see spanEnd)
const ROW_SPAN_VH = 0.52 // photo rows: 'top 82%' → 'bottom 30%' + own height
const RANGE = {
  reveal: 'top 80%',
  rowStart: 'top 82%',
  // Card film strip — base span 43vh ('top 46%' → 'top 3%'), × distance. To keep
  // the WHOLE card fully in view across that range the media is capped at 46vh
  // in styles.css, so the card (~54vh) keeps the head/foot room it needs.
  // Frame 1 still holds through entry; the scrub reverses.
  cardStart: topPct(CARD_END + CARD_SPAN * SPEED.distance),
  cardEnd: topPct(CARD_END),
  mCardStart: topPct(MCARD_START),
}
/* exact '+=' end: a viewport fraction plus the element's own height, scaled. */
const spanEnd = (el, vhPart) => () =>
  '+=' + Math.round((vhPart * window.innerHeight + el.offsetHeight) * SPEED.distance)

const REST_SEL =
  '.interlude__eyebrow, .interlude__body, .interlude__btn, .studio__stat, .studio__media,' +
  '.projects__eyebrow, .cta__eyebrow, .cta__text, .cta__btn, .cta__contacts,' +
  '.reviews__eyebrow, .reviews__agg, .review'
/* Sections that get the statement treatment (masked title reveal + staggered
 * rest) but are NOT `.interlude[data-alive]`: the projects header, the contact
 * block, and the reviews section. Listed once, used by both branches of start()
 * so the two can't drift apart. */
const PLAIN_STATEMENTS = '.projects__head, .cta, .reviews'

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
    <img class="alive-bg__tex" src="/projects/sofia-apartment/gallery/10-900.webp" alt="" loading="lazy"
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

/* eager-load a scrub clip's desktop variant (they're 2–3.6 MB frequent-keyframe
 * encodes; the lazy IO left them undecoded during the scrub window). */
function eagerLoad(video, m) {
  if (video.dataset.loaded) return
  video.dataset.loaded = '1'
  video.preload = 'auto'
  video.src = `/videos/${m.desktop}`
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
  pinCommon(sec, PIN.hero, tl)
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
  pinCommon(sec, PIN.video, tl, { onEnter: reveal, onEnterBack: reveal })
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

function pinCard(card) {
  const strip = card.querySelector('[data-strip]')
  const n = strip ? strip.children.length : 0
  gsap.set(card, { autoAlpha: 1 })
  const tl = gsap.timeline()
  if (n > 1) tl.fromTo(strip, { xPercent: 0 }, { xPercent: -100 * (n - 1), ease: 'none', duration: EFFECT_END }, 0)
  tl.to({}, { duration: n > 1 ? 1 - EFFECT_END : 1 })
  pinCommon(card, PIN.card, tl)
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
function nativeCard(card) {
  gsap.set(card, { autoAlpha: 0, y: 36 })
  ScrollTrigger.create({
    trigger: card, start: RANGE.reveal, once: true,
    onEnter: () => gsap.to(card, { autoAlpha: 1, y: 0, duration: REVEAL_DUR, ease: R.ease }),
  })
  const strip = card.querySelector('[data-strip]')
  const n = strip ? strip.children.length : 0
  if (n > 1)
    gsap.fromTo(strip, { xPercent: 0 }, {
      xPercent: -100 * (n - 1), ease: 'none',
      // trigger on THIS card (not the section) so each advances independently,
      // only once it's genuinely in view. scrub:true keeps it crisp/1:1 with
      // scroll — the SLOWDOWN comes from the wider RANGE.card*, not smoothing.
      scrollTrigger: { trigger: card, start: RANGE.cardStart, end: RANGE.cardEnd, scrub: true },
    })
}
/* ── MOBILE project cards — STEPPED, scroll-linked film strip ───────────────
 * The strips were simply dead on mobile: start() never ran any card handler in
 * the isMobile branch, so every card sat on frame 1.
 *
 * They don't just get nativeCard()'s treatment, though. Continuous per-pixel
 * transform scrubbing is the wrong tool under native touch scrolling: during
 * momentum and rubber-band the browser coalesces scroll updates, so a strip
 * driven a fraction of a frame at a time visibly stutters and can land
 * mid-photo when the finger lifts. So on touch the strip advances a WHOLE FRAME
 * at a time — ScrollTrigger is used only to report progress (cheap and reliable
 * on touch, unlike smooth per-pixel output), the progress is bucketed to a
 * frame index, and CSS transitions the translate (see .project.is-stepped in
 * styles.css). Each advance therefore glides on the compositor no matter how
 * chunky the scroll events were, and a card always rests ON a photo.
 *
 * Still fully scroll-linked and reversible — scroll back up and it steps back —
 * with no pin, no scroll-jacking, and no swipe gesture to fight the page scroll.
 * At most n-1 style writes per card per pass. */
function mobileCard(card) {
  gsap.set(card, { autoAlpha: 0, y: 30 })
  ScrollTrigger.create({
    trigger: card, start: RANGE.reveal, once: true,
    onEnter: () => gsap.to(card, { autoAlpha: 1, y: 0, duration: REVEAL_DUR, ease: R.ease }),
  })

  const strip = card.querySelector('[data-strip]')
  const n = strip ? strip.children.length : 0
  if (n < 2) return
  card.classList.add('is-stepped')
  let frame = -1
  const setFrame = (i) => {
    if (i === frame) return
    frame = i
    strip.style.setProperty('--frame', i)
  }
  setFrame(0)
  ScrollTrigger.create({
    trigger: card,
    start: RANGE.mCardStart,
    end: spanEnd(card, MCARD_SPAN_VH),
    invalidateOnRefresh: true,
    // n equal buckets across the pass; progress 1 would give n, so clamp
    onUpdate: (self) => setFrame(Math.min(n - 1, Math.floor(self.progress * n))),
    onLeave: () => setFrame(n - 1), // rest on the last frame past the card
    onLeaveBack: () => setFrame(0),
  })
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
    document.querySelectorAll('[data-ambient]').forEach(nativeAmbient)
    // PATTERN C project cards — stepped strip advance (see mobileCard)
    document.querySelectorAll('.project').forEach(mobileCard)
  } else {
    /* DESKTOP — pin every effect section. */
    pinHero()
    // Pattern A statement sections (studio, materials, outlook, catalogs)
    document.querySelectorAll('.interlude[data-alive]').forEach((sec) =>
      PIN_ENABLED.text ? pinText(sec) : nativeStatement(sec)
    )
    // Pattern B scrub-video ambients (ambient1, ambient2) — always pin
    document.querySelectorAll('[data-ambient]').forEach((sec) => {
      const cfg = ambients.find((a) => a.id === sec.dataset.id)
      if (cfg?.scrubVideo) pinVideo(sec, cfg)
      else nativeAmbient(sec) // ambient3 (autoplay loop) stays native
    })
    // Pattern C project cards
    document.querySelectorAll('.project').forEach((card) =>
      PIN_ENABLED.card ? pinCard(card) : nativeCard(card)
    )
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

/* ── scrollOverlayTo(scroller, y): glide the project overlay's scroller ─────
 * NOT a native smooth scrollTo: the overlay's gallery images fire
 * ScrollTrigger.refresh() as they lazy-load, and each refresh writes the
 * scroller's position once — which cancels a UA smooth scroll mid-flight
 * (observed settling ~400px short on a tab switch). A gsap tween re-writes
 * scrollTop every frame until it lands, so those refreshes can't strand it. */
export function scrollOverlayTo(scroller, y) {
  gsap.to(scroller, {
    duration: 0.8,
    ease: 'power2.inOut',
    overwrite: true,
    scrollTo: { y, autoKill: false },
  })
}

/* ── refreshOverlay(): re-measure overlay ScrollTriggers after a tab switch ──
 * A hidden tabpanel measures as zero-height, so the gallery's frame-parallax
 * triggers hold stale positions after Проект ⇄ Галерия switches — main.js
 * calls this once the panels' hidden state has been swapped. */
export function refreshOverlay() {
  ScrollTrigger.refresh()
}

/* ── overlayMotion(scrollEl): motion inside an opened project overlay ─────── */
export function overlayMotion(scrollEl) {
  const ctx = gsap.context(() => {
    const head = scrollEl.querySelectorAll('.pdetail__head > *')
    hide(head)
    riseIn(head, { delay: 0.15 })
    const fp = +(5 * DRIFT).toFixed(3) // fixed window → slow it by travel
    scrollEl.querySelectorAll('.pdetail__frame img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -fp, scale: 1.12 }, {
        yPercent: fp, scale: 1.12, ease: 'none',
        scrollTrigger: {
          scroller: scrollEl, trigger: img.parentElement,
          start: 'top bottom', end: 'bottom top', scrub: SMOOTH, invalidateOnRefresh: true,
        },
      })
      if (!img.complete) img.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
    })
  })
  return () => ctx.revert()
}
