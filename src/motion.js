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
 *   effects run position-linked (nativeStatement / nativeAmbient), videos
 *   autoplay (main.js), card strips stay static.
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

/* Pin lengths in viewport-heights — deliberately TIGHT so the page doesn't get
 * exhausting. The effect fills EFFECT_END of the pin, then it holds briefly and
 * releases. Retune here. */
const PIN = { hero: 1.6, text: 1.0, video: 1.2, card: 0.9, strip: 1.1 }
const EFFECT_END = 0.85

/* Which effect families PIN (desktop). Flip a flag to false to un-pin that
 * family → it reverts to native position-linked scroll (shorter page). The
 * scroll-video pins (hero + ambients) always pin — that IS the furnishing
 * moment. Recommended first un-pins if the page feels long: card, then text. */
const PIN_ENABLED = { text: false, card: false }

/* ── MOTION TEMPO (fine-tune here) ──────────────────────────────────────────
 * reveal : once-only reveal/tween DURATIONS ×this (1.1 = 10% slower)
 * scrub  : scrub catch-up SMOOTHING ×this — bigger = the effect glides toward
 *          the scroll position more gradually (applied to every scroll-linked
 *          effect: video scrubs, parallax, strips, titles). (1.1 = 10% more
 *          gradual.)
 * The project card-strip speed is set separately by RANGE.card* + the media
 * height (styles.css .project__media) — see the card note below. */
const SPEED = { reveal: 1.1, scrub: 1.1 }
const SMOOTH = +(motion.scrub.smooth * SPEED.scrub).toFixed(3) // scrub catch-up (s)
const REVEAL_DUR = +(R.duration * SPEED.reveal).toFixed(3)
const REVEAL_STAG = +(R.stagger * SPEED.reveal).toFixed(3)
const MASK_DUR = +(1.0 * SPEED.reveal).toFixed(3)

/* Native (mobile / unpinned) trigger ranges — begin in view, end before leaving. */
const RANGE = {
  reveal: 'top 80%',
  rowStart: 'top 82%', rowEnd: 'bottom 30%',
  // Card film strip — SLOWED ~½ speed (was 'top 30%'→'top 5%' ≈ 214px of scroll;
  // now 'top 46%'→'top 3%' ≈ 368px, ~1.7× more scroll per frame). To keep the
  // WHOLE card fully in view across that wider range, the media is shortened to
  // 46vh (was 58vh) in styles.css so the card (~54vh) has the head/foot room the
  // longer range needs. Frame 1 still holds through entry; scrub reverses.
  cardStart: 'top 46%', cardEnd: 'top 3%',
}

const REST_SEL =
  '.interlude__eyebrow, .interlude__body, .interlude__btn, .studio__stat, .studio__media,' +
  '.projects__eyebrow, .cta__eyebrow, .cta__text, .cta__btn, .cta__contacts'

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
function maskReveal(el, vars = {}) {
  const split = SplitText.create(el, { type: 'lines', mask: 'lines' })
  return gsap.from(split.lines, {
    yPercent: 115,
    duration: MASK_DUR,
    ease: 'power3.out',
    stagger: 0.11,
    onComplete: () => split.revert(),
    ...vars,
  })
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
    <img class="alive-bg__tex" src="/projects/g5-02-900.webp" alt="" loading="lazy"
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
    tl.fromTo(el, { y: -46 * sp }, { y: 46 * sp, ease: 'none', duration: 1 }, 0)
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
    gsap.fromTo(el, { y: -30 * sp }, {
      y: 30 * sp, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: SMOOTH },
    })
  })
}
function nativeHstrip(track) {
  track.querySelectorAll('img').forEach((img) => {
    if (!img.complete) img.addEventListener('load', lazyRefresh, { once: true })
  })
  gsap.fromTo(track, { x: 0 }, {
    x: () => -Math.max(0, track.scrollWidth - track.parentElement.clientWidth),
    ease: 'none',
    scrollTrigger: {
      trigger: track.closest('[data-hstrip]'),
      start: RANGE.rowStart, end: RANGE.rowEnd, scrub: SMOOTH, invalidateOnRefresh: true,
    },
  })
}
function nativeStatement(sec) {
  const layer = injectAlive(sec)
  if (layer) nativeParallax(sec, speedEls(layer))
  const track = sec.querySelector('[data-hstrip-track]')
  if (track) nativeHstrip(track)
  const display = sec.querySelector('.interlude__title, .cta__title, .projects__title')
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
function nativeAmbient(sec) {
  const cap = sec.querySelector('.ambient__cap')
  if (cap) {
    hide(cap.children)
    ScrollTrigger.create({ trigger: sec, start: RANGE.reveal, once: true, onEnter: () => riseIn(cap.children) })
    gsap.fromTo(cap, { y: 26 }, {
      y: -26, ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: SMOOTH },
    })
  }
  const media = sec.querySelector('[data-parallax]')
  if (media) gsap.fromTo(media, { y: () => -sec.offsetHeight * motion.parallax }, {
    y: () => sec.offsetHeight * motion.parallax, ease: 'none',
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
    document.querySelectorAll('.interlude, .cta, .projects__head').forEach(nativeStatement)
    document.querySelectorAll('[data-ambient]').forEach(nativeAmbient)
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
    // Unpinned desktop sections: projects header + contact (too tall to pin: map/footer)
    document.querySelectorAll('.projects__head, .cta').forEach(nativeStatement)
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

/* ── overlayMotion(scrollEl): motion inside an opened project overlay ─────── */
export function overlayMotion(scrollEl) {
  const ctx = gsap.context(() => {
    const head = scrollEl.querySelectorAll('.pdetail__head > *')
    hide(head)
    riseIn(head, { delay: 0.15 })
    scrollEl.querySelectorAll('.pdetail__frame img').forEach((img) => {
      gsap.fromTo(img, { yPercent: -5, scale: 1.12 }, {
        yPercent: 5, scale: 1.12, ease: 'none',
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
