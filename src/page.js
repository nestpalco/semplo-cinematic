import { projects, portfolio, motion } from './sections.config.js'
import * as motionMod from './motion.js'
import {
  applyLang,
  storedLang,
  initTheme,
  initBurger,
  initContactLinks,
} from './chrome.js'

/* ──────────────────────────────────────────────────────────────────────────
 * SEMPLO — runtime for the PORTFOLIO pages (/portfolio/ and /portfolio/<id>/).
 *
 *   The HTML of these pages is GENERATED at build time by
 *   scripts/build-pages.mjs from the config, complete with copy, photos, meta
 *   and Open Graph tags — nothing here renders content. This module only
 *   ENHANCES what is already on the page:
 *     chrome     BG/EN toggle, light/dark switch, burger, tel/mailto hrefs
 *                (shared with the homepage via src/chrome.js)
 *     nav        ink-vs-over-media state + hide-on-scroll-down
 *     listing    the category filter (with a #hash deep link)
 *     project    the hero photo slider, the lazy 360° viewer
 *     motion     the reveal layer (src/motion.js, lazy, motion-ok only)
 *
 *   Native scroll everywhere — no pins, nothing scroll-jacked. Reduced-motion
 *   gets the page exactly as served: no reveals, no parallax, instant slider.
 * ────────────────────────────────────────────────────────────────────────── */

const forceMotion = new URLSearchParams(location.search).has('forcemotion')
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const prefersReduced = osReduced && !forceMotion
const isMobile =
  matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches

document.body.classList.add(prefersReduced ? 'reduced' : 'motion')
if (isMobile) document.body.classList.add('is-mobile')
if (prefersReduced) document.documentElement.style.scrollBehavior = 'auto'

/* ── shared chrome ────────────────────────────────────────────────────────── */
initTheme({ prefersReduced })
initBurger()
initContactLinks()
applyLang(storedLang() || 'bg')

const kind = document.body.dataset.page // 'portfolio' | 'project'
const project = projects.find((p) => p.id === document.body.dataset.project) || null

/* ── nav: ink over paper, cream over media; hides on scroll-down ───────────
 * Same rule as the homepage (main.js §10a): the bar is "ink" unless a
 * [data-dark] section (here: the project hero slider) sits under it. */
{
  const NAV_H =
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 76
  const darkEls = [...document.querySelectorAll('[data-dark]')]
  const mid = NAV_H / 2
  let pending = false
  let lastY = window.scrollY
  const update = () => {
    pending = false
    const y = window.scrollY
    const overMedia = darkEls.some((el) => {
      const r = el.getBoundingClientRect()
      return r.top < mid && r.bottom > mid
    })
    document.body.classList.toggle('nav-ink', !overMedia)
    if (!prefersReduced) {
      if (y < NAV_H * 2) document.body.classList.remove('nav-hidden')
      else if (y > lastY + 8) document.body.classList.add('nav-hidden')
      else if (y < lastY - 4) document.body.classList.remove('nav-hidden')
    }
    lastY = y
  }
  const onScroll = () => {
    if (!pending) {
      pending = true
      requestAnimationFrame(update)
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onScroll)
  update()
}

/* ── LISTING: category filter ─────────────────────────────────────────────
 * Buttons carry data-filter (all | <category>), cards carry data-cat. A pick
 * hides the rest, updates aria-pressed, mirrors itself into the URL hash (so
 * /portfolio/#house is shareable) and tells the motion layer the grid has
 * re-flowed. */
if (kind === 'portfolio') {
  const btns = [...document.querySelectorAll('[data-filter]')]
  const cards = [...document.querySelectorAll('.pcard')]
  const empty = document.querySelector('[data-empty]')
  const valid = new Set(['all', ...portfolio.categories])

  function apply(cat, { push = true } = {}) {
    if (!valid.has(cat)) cat = 'all'
    btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === cat)))
    let shown = 0
    cards.forEach((c) => {
      const on = cat === 'all' || c.dataset.cat === cat
      c.hidden = !on
      if (on) shown++
    })
    if (empty) empty.hidden = shown > 0
    if (push) history.replaceState(null, '', cat === 'all' ? location.pathname : `#${cat}`)
    document.dispatchEvent(new CustomEvent('semplo:filter', { detail: { cat, shown } }))
  }
  btns.forEach((b) => b.addEventListener('click', () => apply(b.dataset.filter)))
  // the hash is the deep link — honoured on load AND on back/forward / a
  // hash-only navigation (which never reloads the page)
  const fromHash = () => {
    const h = location.hash.slice(1)
    apply(h && valid.has(h) ? h : 'all', { push: false })
  }
  window.addEventListener('hashchange', fromHash)
  if (location.hash.length > 1) fromHash()
}

/* ── PROJECT: hero photo slider ───────────────────────────────────────────
 * A native scroll-snap track (works with no JS at all: swipe / trackpad /
 * scrollbar). This adds the arrows, the 1/N counter and ← → keys, and warms
 * the NEXT slide's lazy image so a click never lands on a blank frame. */
if (kind === 'project') {
  const sec = document.querySelector('[data-slider]')
  const track = sec?.querySelector('[data-slider-track]')
  if (sec && track) {
    const slides = [...track.children]
    const n = slides.length
    const iEl = sec.querySelector('[data-slider-i]')
    const prev = sec.querySelector('[data-slider-prev]')
    const next = sec.querySelector('[data-slider-next]')
    let cur = 0
    const width = () => Math.max(1, track.clientWidth)
    const index = () => Math.min(n - 1, Math.max(0, Math.round(track.scrollLeft / width())))
    const warm = (i) => {
      const img = slides[i]?.querySelector('img')
      if (img && img.loading === 'lazy') img.loading = 'eager'
    }
    const go = (i) => {
      const to = ((i % n) + n) % n // wraps both ways
      warm(to)
      warm(to + 1)
      track.scrollTo({ left: to * width(), behavior: prefersReduced ? 'auto' : 'smooth' })
    }
    const sync = () => {
      const i = index()
      if (i === cur) return
      cur = i
      if (iEl) iEl.textContent = String(i + 1)
      warm(i + 1)
    }
    let pending = false
    track.addEventListener(
      'scroll',
      () => {
        if (pending) return
        pending = true
        requestAnimationFrame(() => {
          pending = false
          sync()
        })
      },
      { passive: true }
    )
    prev?.addEventListener('click', () => go(index() - 1))
    next?.addEventListener('click', () => go(index() + 1))
    sec.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(index() - 1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(index() + 1)
      }
    })
    // a resize changes the slide width — re-seat the track on the current slide
    window.addEventListener('resize', () => track.scrollTo({ left: cur * width(), behavior: 'auto' }))
    warm(1)
  }
}

/* ── PROJECT: 360° block (Three.js viewer, lazy) ──────────────────────────
 * Present only for projects with labelled rooms (the generator decides).
 * Three.js + the equirect texture load when the block approaches the
 * viewport, never before; the room chips swap the texture in place. */
if (kind === 'project' && project) {
  const panoSec = document.querySelector('[data-pano]')
  const stage = panoSec?.querySelector('[data-pano-stage]')
  const rooms = project.panoramas || []
  if (panoSec && stage && rooms.length) {
    let pano = null
    let room = 0
    const src = (i) =>
      `/projects/${project.id}/panoramas/${rooms[i].file}-${isMobile ? 2048 : 4096}.webp`
    const label = panoSec.querySelector('[data-pano-room]')
    const chips = [...panoSec.querySelectorAll('[data-pano-jump]')]
    function selectRoom(i) {
      room = i
      const r = rooms[i]
      if (label) {
        label.dataset.bg = r.bg
        label.dataset.en = r.en
        label.textContent = document.documentElement.lang === 'bg' ? r.bg : r.en
      }
      chips.forEach((b, k) => {
        b.classList.toggle('is-active', k === i)
        b.setAttribute('aria-pressed', String(k === i))
      })
      pano?.setSource(src(i)) // no viewer yet → the mount below honours `room`
    }
    chips.forEach((b) => b.addEventListener('click', () => selectRoom(+b.dataset.panoJump)))
    const io = new IntersectionObserver(
      async ([e]) => {
        if (!e.isIntersecting) return
        io.disconnect()
        try {
          const { createPano } = await import('./pano.js')
          pano = createPano(stage, {
            src: src(room),
            scroller: window,
            scrollYawDeg: motion.panoScrollYaw,
            autoYaw: !prefersReduced,
          })
        } catch {} // the viewer is an enhancement — the gallery still stands
      },
      { rootMargin: '480px 0px' }
    )
    io.observe(stage)
  }
}

/* ── motion layer (motion-ok only) ────────────────────────────────────────
 * The inline boot script in <head> added html.motion-pending, which keeps the
 * reveal targets invisible until motion.js has taken them over (no flash).
 * The chunk is imported STATICALLY here (unlike the homepage, which
 * lazy-loads it): Vite then modulepreloads it alongside this file, so the
 * reveal can start the moment the page is parsed instead of after a second
 * round-trip — these are utility pages and the work must show quickly.
 * Whatever happens — reduced-motion, a runtime error, a slow font — the
 * class comes off within 1.2s so content can never be left hidden. */
const lift = () => document.documentElement.classList.remove('motion-pending')
if (prefersReduced) lift()
else {
  try {
    ;(kind === 'portfolio' ? motionMod.startPortfolio() : motionMod.startProject()).catch(lift)
  } catch {
    lift()
  }
}
setTimeout(lift, 1200)

document.body.classList.add('is-ready')
