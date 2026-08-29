import {
  hero,
  ambients,
  projects,
  interludes,
  strips,
  catalogs,
  business,
  reviews,
  captcha,
  ui,
  motion,
} from './sections.config.js'
import { businessLd } from './schema.js'
import manifest from './videos.manifest.json'
import pmanifest from './projects.manifest.json'

/* ──────────────────────────────────────────────────────────────────────────
 * SEMPLO — calm, photography-first page. ONE signature moment, native scroll.
 *
 *   HERO      — one full-bleed video. Plays ONCE on load, then holds its final
 *               frame. No pin, no scrub. Subtle replay on click. Serif headline
 *               + sub + CTA + a scroll cue overlaid.
 *   AMBIENT   — quiet full-width "living photograph" loops between content.
 *               Autoplay muted, loop, play/pause on visibility, gentle parallax.
 *   PROJECTS  — the centerpiece editorial gallery. Large imagery, refined hover,
 *               opens a detail overlay with an edge-to-edge photo sequence.
 *
 *   Fallbacks kept intact:
 *     reduced-motion → posters only, no video load, no reveals, no parallax.
 *     mobile         → light autoplay (720 variants) or posters; native scroll.
 *     no-JS          → the <noscript> poster gallery in index.html.
 *   Everyone gets NATIVE scroll — nothing is pinned or scroll-jacked.
 *
 *   Core engine is vanilla (IntersectionObserver + CSS). Two LAZY chunks add
 *   polish on top, both skipped/deferred so the main bundle stays lean:
 *     ./motion.js — GSAP + ScrollTrigger + SplitText reveals, parallax,
 *                   Ken Burns. Imported only when motion-ok. No pins ever.
 *     ./pano.js   — Three.js 360° viewer. Imported only when a project
 *                   overlay WITH a panorama opens (all modes — drag works
 *                   under reduced-motion too; only auto-yaw is disabled).
 * ────────────────────────────────────────────────────────────────────────── */

/* ?forcemotion — demo override. OS accessibility settings (e.g. Windows
 * "Animation effects" off) make the browser report prefers-reduced-motion:
 * reduce, which fully disables the motion layer. When presenting to a client,
 * append ?forcemotion to guarantee the full experience regardless of the
 * presenting machine's OS setting. */
const forceMotion = new URLSearchParams(location.search).has('forcemotion')
const osReduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const prefersReduced = osReduced && !forceMotion
const isMobile =
  matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches

console.info(
  `[semplo] mode: ${prefersReduced ? 'REDUCED (no reveals/parallax/Ken Burns)' : 'MOTION'}` +
    ` — OS prefers-reduced-motion: ${osReduced ? 'reduce' : 'no-preference'}` +
    (forceMotion ? ' — overridden by ?forcemotion' : '') +
    (osReduced && !forceMotion ? ' — append ?forcemotion to override for demos' : '')
)

document.body.classList.add(prefersReduced ? 'reduced' : 'motion')
if (isMobile) document.body.classList.add('is-mobile')
if (prefersReduced) document.documentElement.style.scrollBehavior = 'auto'

/* Desktop + motion-ok: PATTERN B applies — scroll drives the scrub-flagged
 * videos (hero pinned, ambient strips position-linked) via motion.js. */
const scrubDesktop = !prefersReduced && !isMobile

/* ── polish motion layer — its own lazy chunk, motion-ok visitors only.
 *    prime() hides the hero copy (ideally behind the loader) so the intro can
 *    reveal it; if the chunk fails, nothing was hidden — content just shows,
 *    and scrub-mode videos fall back to the calm autoplay behaviour. */
let motionMod = null
const motionReady = prefersReduced
  ? Promise.resolve()
  : import('./motion.js')
      .then((m) => {
        motionMod = m
        m.prime()
      })
      .catch(() => {
        motionlessFallback() // scrub videos must still move: play them forward
      })

/* ── 1. Bilingual UI ──────────────────────────────────────────────────────── */
let lang = 'bg'
const dig = (p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), ui)
function applyLang(next) {
  lang = next
  const idx = lang === 'bg' ? 0 : 1
  document.documentElement.lang = lang
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = dig(el.dataset.i18n)
    if (Array.isArray(v)) el.textContent = v[idx]
  })
  document.querySelectorAll('[data-bg][data-en]').forEach((el) => {
    el.textContent = lang === 'bg' ? el.dataset.bg : el.dataset.en
  })
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    const v = dig(el.dataset.i18nAria)
    if (Array.isArray(v)) el.setAttribute('aria-label', v[idx])
  })
  // form placeholders (from ui.form) and per-element aria pairs (used by the
  // review star rows, whose label carries an interpolated rating)
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = dig(el.dataset.i18nPh)
    if (Array.isArray(v)) el.placeholder = v[idx]
  })
  document.querySelectorAll('[data-aria-bg][data-aria-en]').forEach((el) => {
    el.setAttribute('aria-label', lang === 'bg' ? el.dataset.ariaBg : el.dataset.ariaEn)
  })
  document.querySelectorAll('.lang__btn').forEach((b) => {
    const on = b.dataset.lang === lang
    b.classList.toggle('is-active', on)
    b.setAttribute('aria-pressed', String(on))
  })
  syncThemeBtn() // the theme switch's accessible name is bilingual too
  // motion layer listens: scrub-linked SplitText titles must re-split new text
  document.dispatchEvent(new Event('semplo:lang'))
}
document
  .querySelectorAll('.lang__btn')
  .forEach((b) => b.addEventListener('click', () => applyLang(b.dataset.lang)))

/* ── 1b. Light / Dark theme ────────────────────────────────────────────────
 * The whole site is themed by ONE attribute — <html data-theme="light|dark">
 * — which every colour token in styles.css hangs off, so nav (both its states),
 * sections, footer, project overlay, catalogues grid and the map all follow
 * without a single per-component branch here.
 *
 * Precedence: a stored choice > the OS preference. The inline boot script in
 * index.html already resolved that before first paint (no flash); this block
 * owns the toggle, persistence, and — while the visitor has made no explicit
 * choice — keeps following later OS changes. */
const THEME_KEY = 'semplo:theme'
const darkMQ = matchMedia('(prefers-color-scheme: dark)')
const themeBtn = document.querySelector('[data-theme-toggle]')
const themeMeta = document.querySelector('meta[name="theme-color"]')
let theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
let themeAnimT = 0

const storedTheme = () => {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null // private mode / blocked storage — theming still works, just per-visit
  }
}

function syncThemeBtn() {
  if (!themeBtn) return
  const idx = lang === 'bg' ? 0 : 1
  const label = theme === 'dark' ? ui.theme.toLight[idx] : ui.theme.toDark[idx]
  themeBtn.setAttribute('aria-label', label)
  themeBtn.title = label
  themeBtn.setAttribute('aria-pressed', String(theme === 'dark'))
}

function applyTheme(next, { persist = true } = {}) {
  theme = next === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  // brief colour-only cross-fade so surfaces glide rather than snap
  if (!prefersReduced) {
    root.classList.add('theme-anim')
    clearTimeout(themeAnimT)
    themeAnimT = setTimeout(() => root.classList.remove('theme-anim'), 420)
  }
  root.dataset.theme = theme
  if (themeMeta) themeMeta.content = theme === 'dark' ? '#121110' : '#f3f1ec'
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {}
  }
  syncThemeBtn()
}

themeBtn?.addEventListener('click', () => applyTheme(theme === 'dark' ? 'light' : 'dark'))
darkMQ.addEventListener('change', (e) => {
  if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', { persist: false })
})
syncThemeBtn()

/* ── 2. Templates ─────────────────────────────────────────────────────────── */
const posterFor = (m) => `/videos/${isMobile && m.posterMobile ? m.posterMobile : m.poster}`

function heroHTML() {
  const m = manifest[hero.id]
  // Scrub mode starts on frame 0 (the empty room) → poster must match frame 0.
  // Everywhere else the poster stays the LAST frame (the furnished payoff).
  const poster =
    scrubDesktop && hero.scrubVideo && m.posterFirst ? `/videos/${m.posterFirst}` : posterFor(m)
  return `
    <section class="hero" data-hero data-id="${hero.id}" data-dark>
      <div class="hero__media">
        <img class="hero__poster" src="${poster}" alt="" aria-hidden="true" />
        <video class="hero__video" data-hero-video muted playsinline preload="none"
               disablepictureinpicture poster="${poster}"></video>
      </div>
      <button class="hero__replay" type="button" data-replay hidden
              data-i18n-aria="replay" aria-label="Replay">
        <span class="hero__replay-icon" aria-hidden="true">↺</span>
      </button>
      <div class="hero__inner">
        <h1 class="hero__title" data-bg="${hero.bg}" data-en="${hero.en}">${hero.bg}</h1>
        <p class="hero__sub" data-bg="${hero.subBg}" data-en="${hero.subEn}">${hero.subBg}</p>
        <p class="hero__cred" data-bg="${hero.credBg}" data-en="${hero.credEn}">${hero.credBg}</p>
        <a class="hero__cta" href="${hero.ctaHref}" data-bg="${hero.ctaBg}" data-en="${hero.ctaEn}">${hero.ctaBg}</a>
      </div>
      <div class="hero__scroll" data-hint aria-hidden="true">
        <span data-i18n="scrollHint">Скрол</span><span class="hero__scroll-line"></span>
      </div>
    </section>`
}

function ambientHTML(a) {
  const m = manifest[a.id]
  const poster = posterFor(m)
  const hasText = !!a.lineBg
  const cap = hasText
    ? `<figcaption class="ambient__cap">
         <span class="ambient__eyebrow" data-bg="${a.eyebrowBg}" data-en="${a.eyebrowEn}">${a.eyebrowBg}</span>
         <span class="ambient__line" data-bg="${a.lineBg}" data-en="${a.lineEn}">${a.lineBg}</span>
       </figcaption>`
    : ''
  return `
    <section class="ambient" data-ambient data-id="${a.id}" data-dark
             aria-hidden="${hasText ? 'false' : 'true'}">
      <div class="ambient__media" data-parallax>
        <img class="ambient__poster" src="${poster}" alt="" aria-hidden="true" />
        <video class="ambient__video" data-ambient-video muted playsinline loop preload="none"
               disablepictureinpicture poster="${poster}"></video>
      </div>
      ${cap}
    </section>`
}

function interludeHTML(t) {
  // PATTERN A: `bgFx` names the animated background variant behind the type
  // (blueprint linework / material texture / soft geometry). The layer markup
  // is injected by motion.js — reduced-motion never gets a layer at all.
  const alive = t.bgFx ? ` data-alive="${t.bgFx}"` : ''
  const id = t.anchor ? ` id="${t.anchor}"` : '' // nav anchor target
  // Optional "about" extras (studio): a second paragraph, a stat, and an image.
  const body2 = t.bodyBg2
    ? `<p class="interlude__body interlude__body2" data-bg="${t.bodyBg2}" data-en="${t.bodyEn2}">${t.bodyBg2}</p>`
    : ''
  const stat = t.stat
    ? `<div class="studio__stat">
         <span class="studio__num">${t.stat.num}</span>
         <span class="studio__stat-label" data-bg="${t.stat.labelBg}" data-en="${t.stat.labelEn}">${t.stat.labelBg}</span>
       </div>`
    : ''
  const figure = t.image
    ? `<figure class="studio__media">
         <img src="${isMobile && t.image.srcMobile ? t.image.srcMobile : t.image.src}"
              alt="${t.image.altEn}" loading="lazy" decoding="async" />
       </figure>`
    : ''
  const rich = t.image || t.stat || t.bodyBg2 // expanded "about" layout
  const lead = `
        <p class="interlude__eyebrow" data-bg="${t.eyebrowBg}" data-en="${t.eyebrowEn}">${t.eyebrowBg}</p>
        <h2 class="interlude__title" data-bg="${t.bg}" data-en="${t.en}">${t.bg}</h2>
        <p class="interlude__body" data-bg="${t.bodyBg}" data-en="${t.bodyEn}">${t.bodyBg}</p>
        ${body2}${stat}`
  const inner = rich
    ? `<div class="interlude__inner studio__grid">
         <div class="studio__lead">${lead}</div>
         ${figure}
       </div>`
    : `<div class="interlude__inner">${lead}</div>`
  return `
    <section class="interlude${rich ? ' studio' : ''}" data-interlude${alive}${id}>
      ${inner}
    </section>`
}

/* project assets resolve through src/projects.manifest.json (emitted by
 * scripts/optimize-projects.mjs walking assets/projects/<id>/): the config
 * entry carries copy + panorama labels, the manifest carries what files exist */
const pAsset = (pid, type, name, w) => `/projects/${pid}/${type}/${name}-${w}.webp`
const galleryOf = (p) => pmanifest[p.id]?.gallery || []
const sketchesOf = (p) => pmanifest[p.id]?.sketches || []

function projectsHTML() {
  // PATTERN C: every card is a uniform BIG cover holding a horizontal film
  // strip of its first frames. Scroll advances the strip rightward (motion.js);
  // without the motion layer the strip simply shows frame 1 (overflow hidden).
  const K = motion.stripFrames
  const cards = projects
    .map((p, i) => {
      const imgs = galleryOf(p)
        .slice(0, K)
        .map(
          (n, k) =>
            `<img src="${pAsset(p.id, 'gallery', n, k === 0 && isMobile ? 900 : 1600)}" alt=""
                  loading="${k === 0 && i === 0 ? 'eager' : 'lazy'}" decoding="async" />`
        )
        .join('')
      return `
      <button class="project" type="button" data-project="${i}" aria-haspopup="dialog">
        <span class="project__media">
          <span class="project__strip" data-strip>${imgs}</span>
          <span class="project__view" aria-hidden="true" data-i18n="projects.view">${ui.projects.view[0]}</span>
        </span>
        <span class="project__meta">
          <span class="project__title" data-bg="${p.titleBg}" data-en="${p.titleEn}">${p.titleBg}</span>
          <span class="project__sub" data-bg="${p.metaBg}" data-en="${p.metaEn}">${p.metaBg}</span>
        </span>
      </button>`
    })
    .join('')
  return `
    <section class="projects" id="work">
      <header class="projects__head" data-interlude>
        <div class="interlude__inner">
          <p class="projects__eyebrow" data-i18n="projects.eyebrow">Избрани проекти</p>
          <h2 class="projects__title" data-i18n="projects.title">Завършени интериори.</h2>
        </div>
      </header>
      <div class="gallery">${cards}</div>
    </section>`
}

/* ── 3. Compose the page from config (single source of truth) ─────────────── */
const root = document.querySelector('[data-sections]')
root.innerHTML =
  heroHTML() +
  interludeHTML(interludes[0]) +
  ambientHTML(ambients[0]) +
  projectsHTML() +
  (interludes[1] ? interludeHTML(interludes[1]) : '') +
  (ambients[1] ? ambientHTML(ambients[1]) : '') +
  (interludes[2] ? interludeHTML(interludes[2]) : '') +
  (ambients[2] ? ambientHTML(ambients[2]) : '') +
  ambients.slice(3).map(ambientHTML).join('') // any extra ambient slots append here

/* Catalogues grid — cards injected from config (bilingual), each a download
 * link to its migrated PDF in /public/catalogs/. Typographic cover in-palette. */
{
  const grid = document.querySelector('[data-catgrid]')
  if (grid) {
    grid.innerHTML = catalogs
      .map(
        (c) => `
      <a class="catcard" href="/catalogs/${c.id}.pdf" download
         aria-label="${c.titleEn} — PDF, ${c.size}">
        <span class="catcard__cover">
          <span class="catcard__doc">PDF</span>
          <span class="catcard__cat" data-bg="${c.catBg}" data-en="${c.catEn}">${c.catBg}</span>
          <span class="catcard__title" data-bg="${c.titleBg}" data-en="${c.titleEn}">${c.titleBg}</span>
        </span>
        <span class="catcard__foot">
          <span class="catcard__dl" data-i18n="catalogs.download">${ui.catalogs.download[0]}</span>
          <span class="catcard__size">${c.size}</span>
        </span>
      </a>`
      )
      .join('')
  }
}

/* PATTERN C horizontal strips (portfolio) — containers live in index.html;
 * tracks are filled from config so photos stay one-list-per-strip. */
document.querySelectorAll('[data-hstrip]').forEach((el) => {
  const list = strips[el.dataset.hstrip]
  if (!list) return
  el.innerHTML = `<div class="hstrip__track" data-hstrip-track>${list
    .map((src) => `<img src="${src}" alt="" loading="lazy" decoding="async" />`)
    .join('')}</div>`
})

/* ── Contact details: one source of truth ─────────────────────────────────
 * The visible strings already come from `ui.contact` (which mirrors `business`)
 * via data-i18n, but hrefs can't. Rewrite every tel:/mailto: from `business` so
 * a changed number can never leave a stale link behind. */
{
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => (a.href = `tel:${business.tel}`))
  document
    .querySelectorAll('a[href^="mailto:"]')
    .forEach((a) => (a.href = `mailto:${business.email}`))
}

/* ── ОТЗИВИ — review cards from config ────────────────────────────────────
 * Google's review text is only available through the billed Places API, so the
 * `reviews` array in sections.config.js is the source and the client pastes
 * their real reviews into it. Both languages are baked into data-bg/data-en
 * (including the localised date), so the language toggle swaps them with the
 * same mechanism as the rest of the page — no re-render, and the scroll reveal
 * already applied to each card is never disturbed. */
{
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    )
  const stars = (rating) =>
    Array.from({ length: 5 }, (_, i) => `<i${i < Math.round(rating) ? '' : ' data-off'}>★</i>`).join('')
  const ratingLabel = (rating, i) => ui.reviews.of[i].replace('{r}', String(rating))
  const monthYear = (iso, loc) => {
    const d = new Date(`${iso}T00:00:00`)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString(loc, { year: 'numeric', month: 'long' })
  }

  const grid = document.querySelector('[data-reviews-grid]')
  if (grid) {
    grid.innerHTML = reviews.items
      .map((r) => {
        const dBg = monthYear(r.date, 'bg-BG')
        const dEn = monthYear(r.date, 'en-GB')
        const todo = r.todo
          ? `<span class="review__todo" data-bg="${esc(ui.reviews.todo[0])}"
                   data-en="${esc(ui.reviews.todo[1])}">${esc(ui.reviews.todo[0])}</span>`
          : ''
        return `
      <figure class="review${r.todo ? ' is-todo' : ''}">
        <span class="stars" role="img" aria-label="${esc(ratingLabel(r.rating, 0))}"
              data-aria-bg="${esc(ratingLabel(r.rating, 0))}"
              data-aria-en="${esc(ratingLabel(r.rating, 1))}">${stars(r.rating)}</span>
        <blockquote class="review__text" data-bg="${esc(r.textBg)}" data-en="${esc(r.textEn)}">${esc(
          r.textBg
        )}</blockquote>
        <figcaption class="review__by">
          <span class="review__author">${esc(r.author)}</span>
          <span class="review__date" data-bg="${esc(dBg)}" data-en="${esc(dEn)}">${esc(dBg)}</span>
        </figcaption>
        ${todo}
      </figure>`
      })
      .join('')
  }

  // the aggregate line above the grid: ★★★★★ + "5.0 от 5 · 12 отзива в Google"
  const aggStars = document.querySelector('[data-reviews-stars]')
  if (aggStars) {
    aggStars.innerHTML = stars(reviews.rating)
    aggStars.setAttribute('role', 'img')
    aggStars.dataset.ariaBg = ratingLabel(reviews.rating, 0)
    aggStars.dataset.ariaEn = ratingLabel(reviews.rating, 1)
  }
  const aggText = document.querySelector('[data-reviews-aggtext]')
  if (aggText) {
    const fill = (i) =>
      ui.reviews.agg[i]
        .replace('{r}', reviews.rating.toFixed(1))
        .replace('{n}', String(reviews.count))
    aggText.dataset.bg = fill(0)
    aggText.dataset.en = fill(1)
    aggText.textContent = fill(0)
  }
  const aggLink = document.querySelector('[data-reviews-link]')
  if (aggLink && reviews.url) aggLink.href = reviews.url

  /* SEO: rebuild the LocalBusiness JSON-LD with aggregateRating + review hung
   * off the same entity. src/schema.js decides what is publishable — placeholder
   * entries are excluded, and while ALL of them are placeholders no rating or
   * review is emitted at all (see the note in that file). index.html keeps a
   * static copy of the business node as the no-JS fallback; this replaces it. */
  const ldTag = document.querySelector('[data-ld-business]')
  if (ldTag) {
    try {
      ldTag.textContent = JSON.stringify(businessLd(business, reviews, 'bg'), null, 2)
    } catch {} // structured data is an enhancement — never let it break the page
  }
}

applyLang('bg')

/* ── Pin-aware smooth anchor scrolling ─────────────────────────────────────
 * Raw #hash jumps land wrong once sections are pinned (pin-spacers shift real
 * scroll positions, and a jump can land inside a spacer = blank). Instead we
 * read the target's LIVE position at click time (getBoundingClientRect + scrollY
 * is always correct, whatever the pin state) and offset by the fixed nav. Works
 * in every language (targets are stable ids, not text). */
const NAV_H = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 76
let navSettling = false // an anchor scroll is in flight → keep the nav shown until it stops
let navSettleHardT = 0
function scrollToId(id) {
  // an anchor jump scrolls DOWN → don't let hide-on-scroll pull the nav away.
  // Held shown until the scroll (and any pin/layout settle) actually stops; a
  // hard cap guarantees the hold can never get stuck (e.g. anchoring in place).
  navSettling = true
  document.body.classList.remove('nav-hidden')
  clearTimeout(navSettleHardT)
  navSettleHardT = setTimeout(() => { navSettling = false }, 4000)
  // Once the motion chunk is loaded, its ScrollToPlugin scroll is pin-aware and
  // refresh-safe. Before that (or reduced-motion, where motion never loads)
  // there are no pins, so a plain live-position scroll is correct.
  if (motionMod && motionMod.scrollToTarget) {
    motionMod.scrollToTarget(id)
    return true
  }
  const target = id === 'top' ? document.body : document.getElementById(id)
  if (!target) return false
  const top = id === 'top' ? 0 : target.getBoundingClientRect().top + window.scrollY - NAV_H + 1
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReduced ? 'auto' : 'smooth' })
  return true
}
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const href = a.getAttribute('href')
    if (!href || href.length < 2) return
    const id = href.slice(1)
    if (id === 'top' || document.getElementById(id)) {
      e.preventDefault()
      scrollToId(id)
      history.replaceState(null, '', href)
    }
  })
})

/* ── Compact-nav hamburger (mobile, ≤620px) — opens the links as a dropdown.
 * The language toggle stays in the bar (always reachable); this panel just
 * holds the nav links. Closes on link choice, ESC, or scroll. ── */
{
  const burger = document.querySelector('[data-burger]')
  if (burger) {
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open)
      burger.setAttribute('aria-expanded', String(open))
    }
    burger.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')))
    document.querySelectorAll('.nav__links a').forEach((a) =>
      a.addEventListener('click', () => setOpen(false))
    )
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false)
    })
    window.addEventListener(
      'scroll',
      () => {
        if (document.body.classList.contains('nav-open')) setOpen(false)
      },
      { passive: true }
    )
  }
}

/* ── 4. Reveal once the hero poster has decoded (no flash) ────────────────── */
let revealed = false
function revealPage() {
  if (revealed) return
  revealed = true
  document.body.classList.remove('not-ready')
  document.body.classList.add('is-ready')
  motionReady.then(() => motionMod?.start()) // hero intro + scroll reveals
}
{
  const p = root.querySelector('.hero__poster')
  if (p && p.complete) revealPage()
  else if (p) {
    p.addEventListener('load', revealPage, { once: true })
    p.addEventListener('error', revealPage, { once: true })
  }
  setTimeout(revealPage, 3500) // safety — never trap the user on the loader
}

/* ── 5. Lazy-loader for every video slot (hero + ambients) ────────────────── */
function slotSrc(id) {
  const m = manifest[id]
  return `/videos/${isMobile ? m.mobile : m.desktop}`
}
function startLoad(video) {
  if (video.dataset.loaded) return
  video.dataset.loaded = '1'
  video.preload = 'auto'
  video.src = slotSrc(video.closest('[data-id]').dataset.id)
  video.load()
}
if (!prefersReduced) {
  const marginPct = Math.round(motion.preloadMargin * 100)
  const lazyIO = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        const v = e.target.querySelector('[data-hero-video],[data-ambient-video]')
        if (v) startLoad(v)
        lazyIO.unobserve(e.target)
      })
    },
    { rootMargin: `${marginPct}% 0px ${marginPct}% 0px` }
  )
  root.querySelectorAll('[data-hero],[data-ambient]').forEach((s) => lazyIO.observe(s))
}

/* ── 6. HERO video ─────────────────────────────────────────────────────────
 *    Desktop motion-ok (scrubDesktop): PATTERN B — motion.js pins the hero and
 *    maps scroll → currentTime (scrolling furnishes the room). No autoplay.
 *    Mobile motion-ok: the calm play-once → hold + replay behaviour.
 *    Reduced: poster (finished room) only. */
let heroPlayOnce = () => {}
if (!prefersReduced) {
  const heroSec = root.querySelector('[data-hero]')
  const video = heroSec.querySelector('[data-hero-video]')
  const replay = heroSec.querySelector('[data-replay]')

  const playOnce = () => {
    const pr = video.play()
    if (pr && pr.catch) pr.catch(() => {}) // blocked autoplay → poster (final frame) holds
  }
  video.addEventListener(
    'loadeddata',
    () => {
      heroSec.classList.add('is-playable')
      if (!scrubDesktop) playOnce() // scrub mode: motion.js owns playback position
    },
    { once: true }
  )
  heroPlayOnce = playOnce // fallback hook if the motion chunk fails to load
  video.addEventListener('ended', () => {
    heroSec.classList.add('is-ended') // holds the last frame; reveals the replay affordance
    replay.hidden = false
  })
  const doReplay = () => {
    heroSec.classList.remove('is-ended')
    replay.hidden = true
    try {
      video.currentTime = 0
    } catch {}
    playOnce()
  }
  replay.addEventListener('click', (e) => {
    e.stopPropagation()
    doReplay()
  })
  // clicking the held final frame also replays (tasteful, discoverable)
  heroSec.querySelector('.hero__media').addEventListener('click', () => {
    if (heroSec.classList.contains('is-ended')) doReplay()
  })
  startLoad(video) // the hero is the one clip we fetch eagerly — it IS the moment
}

/* ── 7. AMBIENT strips ─────────────────────────────────────────────────────
 *    scrubVideo slots on desktop = PATTERN B (motion.js scrubs them; loading
 *    still handled by the lazy IO in §5, well before entry). Everything else
 *    (mobile, reduced-off ambient3) keeps autoplay-while-visible. */
const isScrubSlot = (sec) =>
  scrubDesktop && [hero, ...ambients].some((s) => s.scrubVideo && s.id === sec.dataset.id)
function enableAmbientAutoplay(includeScrubSlots) {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        const v = e.target.querySelector('[data-ambient-video]')
        if (!v) return
        if (e.isIntersecting) {
          startLoad(v)
          v.classList.add('is-playable')
          const pr = v.play()
          if (pr && pr.catch) pr.catch(() => {})
        } else {
          v.pause()
        }
      })
    },
    { threshold: motion.playThreshold }
  )
  root.querySelectorAll('[data-ambient]').forEach((s) => {
    if (includeScrubSlots || !isScrubSlot(s)) io.observe(s)
  })
}
if (!prefersReduced) enableAmbientAutoplay(false)

/* If the motion chunk never arrives, scrub-mode videos must not sit frozen:
 * hero plays once (its calm behaviour), scrub ambients join the autoplay IO. */
function motionlessFallback() {
  heroPlayOnce()
  enableAmbientAutoplay(true)
}

/* ── 8/9. Parallax + scroll reveals now live in the lazy motion layer
 *    (src/motion.js). Reduced-motion never loads it → content is simply
 *    visible, nothing drifts. ── */

/* ── 10a. Nav theme + hide-on-scroll ───────────────────────────────────────
 * THEME (all modes): body.nav-ink ⇔ no [data-dark] section (hero / ambient
 *   strip) sits under the nav band → ink text + paper frosted bar; otherwise
 *   white text + scrim over media. Section-position based (not blend modes —
 *   they invert unreliably over composited <video> layers).
 * HIDE (motion only): once the hero is scrolled past, the nav slides up on a
 *   downward scroll and returns on any upward scroll. Always shown over the
 *   hero and at the very top; disabled under reduced-motion. */
{
  const darkEls = [...root.querySelectorAll('[data-dark]')]
  const heroEl = root.querySelector('[data-hero]')
  const mid = NAV_H / 2
  let pending = false
  let lastY = window.scrollY
  let settleT = 0
  const update = () => {
    pending = false
    const y = window.scrollY
    const overMedia = darkEls.some((el) => {
      const r = el.getBoundingClientRect()
      return r.top < mid && r.bottom > mid
    })
    document.body.classList.toggle('nav-ink', !overMedia)

    if (!prefersReduced) {
      const heroBottom = heroEl ? heroEl.getBoundingClientRect().bottom : 0
      const pastHero = heroBottom <= NAV_H + 4
      if (navSettling) {
        // anchor scroll in flight: keep shown; end the hold once scroll has been
        // quiet for 1200ms (long enough to bridge the hero-pin stall that briefly
        // freezes the programmatic scroll), re-baselined for the next user scroll.
        document.body.classList.remove('nav-hidden')
        clearTimeout(settleT)
        settleT = setTimeout(() => { navSettling = false; lastY = window.scrollY }, 1200)
      } else if (!pastHero) {
        document.body.classList.remove('nav-hidden') // over / through the hero
      } else if (y > lastY + 8) {
        document.body.classList.add('nav-hidden') // meaningful downward scroll → hide
      } else if (y < lastY - 4) {
        document.body.classList.remove('nav-hidden') // any upward scroll → show
      }
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

/* ── 10b. Hide the hero scroll cue after the first scroll ─────────────────── */
{
  const hint = root.querySelector('[data-hint]')
  if (hint) {
    const onScroll = () => {
      if (window.scrollY > 12) {
        hint.classList.add('is-hidden')
        window.removeEventListener('scroll', onScroll)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
  }
}

/* ── 11. PROJECTS — detail overlay (tabs: process work ⇄ finished photos) ──
 * Projects WITH `sketches` get a two-tab bar — Проект (sketches/plans) and
 * Галерия (the photo sequence). The GALLERY opens selected: the finished
 * photography is the payoff and the one view every project has; the process
 * drawings are the deeper dive. Projects without sketches show no bar at all.
 *
 * The 360° panorama is deliberately NOT a tab: it sits as a SHARED block
 * between the tab bar and the switchable panel, so it is on screen the moment
 * the overlay opens (no hunting) and never vanishes on a tab switch. The tab
 * bar is sticky, and switching scrolls the fresh panel up under it so the
 * change is always visible. */
{
  const overlay = document.createElement('div')
  overlay.className = 'pdetail'
  overlay.hidden = true
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.innerHTML = `
    <button class="pdetail__close" type="button" data-pdetail-close
            data-i18n-aria="projects.close" aria-label="Close">
      <span aria-hidden="true">✕</span>
    </button>
    <div class="pdetail__scroll" data-pdetail-scroll tabindex="0">
      <header class="pdetail__head">
        <p class="pdetail__meta" data-pdetail-meta></p>
        <h2 class="pdetail__title" data-pdetail-title></h2>
        <p class="pdetail__blurb" data-pdetail-blurb></p>
      </header>
      <div class="pdetail__tabs" data-pdetail-tabs role="tablist"
           data-i18n-aria="projects.tabs" aria-label="${ui.projects.tabs[0]}" hidden>
        <button class="pdetail__tab" type="button" role="tab" data-tab="project"
                id="pdetail-tab-project" aria-controls="pdetail-panel-project"
                aria-selected="false" tabindex="-1"
                data-i18n="projects.tabProject">${ui.projects.tabProject[0]}</button>
        <button class="pdetail__tab" type="button" role="tab" data-tab="gallery"
                id="pdetail-tab-gallery" aria-controls="pdetail-panel-gallery"
                aria-selected="true" tabindex="0"
                data-i18n="projects.tabGallery">${ui.projects.tabGallery[0]}</button>
      </div>
      <div class="pdetail__seq" data-pdetail-seq></div>
    </div>`
  document.body.appendChild(overlay)

  const elClose = overlay.querySelector('[data-pdetail-close]')
  const elScroll = overlay.querySelector('[data-pdetail-scroll]')
  const elMeta = overlay.querySelector('[data-pdetail-meta]')
  const elTitle = overlay.querySelector('[data-pdetail-title]')
  const elBlurb = overlay.querySelector('[data-pdetail-blurb]')
  const elSeq = overlay.querySelector('[data-pdetail-seq]')
  const elTabs = overlay.querySelector('[data-pdetail-tabs]')
  const tabBtns = [...elTabs.querySelectorAll('[role="tab"]')]
  let lastFocus = null
  let pano = null // live 360° viewer instance for the open project
  let panoRoom = 0 // index into the open project's `panoramas` config list
  let overlayCleanup = null // motion-layer teardown for the open project
  let openToken = 0 // guards async pano setup against a fast close/reopen

  const roomSrc = (p, i) =>
    pAsset(p.id, 'panoramas', p.panoramas[i].file, isMobile ? 2048 : 4096)

  /* The 360° viewer: Three.js + ONE texture load, only here — never on the
   * main page. Works in every mode; auto-yaw is off under reduced-motion. */
  async function setupPano(p, token) {
    const stageEl = overlay.querySelector('[data-pano-stage]')
    if (!stageEl) return
    try {
      const { createPano } = await import('./pano.js')
      if (token !== openToken || overlay.hidden) return // closed while loading
      pano = createPano(stageEl, {
        // panoRoom, not 0: the visitor may have picked a room while Three.js
        // was still downloading — honour the choice they already made
        src: roomSrc(p, panoRoom),
        scroller: elScroll,
        scrollYawDeg: motion.panoScrollYaw,
        autoYaw: !prefersReduced,
      })
    } catch {} // viewer is an enhancement — the photo sequence still stands
  }

  /* room switcher: one viewer, textures swapped in place (never N canvases) */
  function selectRoom(p, i) {
    panoRoom = i
    const room = p.panoramas[i]
    const label = overlay.querySelector('[data-pano-room]')
    if (label) {
      label.dataset.bg = room.bg
      label.dataset.en = room.en
      label.textContent = lang === 'bg' ? room.bg : room.en
    }
    overlay.querySelectorAll('[data-pano-jump]').forEach((b, k) => {
      b.classList.toggle('is-active', k === i)
      b.setAttribute('aria-pressed', String(k === i))
    })
    pano?.setSource(roomSrc(p, i)) // no instance yet → setupPano honours panoRoom
  }

  /* ── tabs: Проект (sketches) ⇄ Галерия (photos) ─────────────────────────
   * WAI-ARIA tabs with roving tabindex + arrow keys; selection follows focus
   * (automatic activation). Panels are hidden/shown; a switch scrolls the
   * fresh panel up under the sticky bar so the change is always on screen. */
  function selectTab(name, { scroll = false } = {}) {
    tabBtns.forEach((b) => {
      const on = b.dataset.tab === name
      b.setAttribute('aria-selected', String(on))
      b.tabIndex = on ? 0 : -1
      b.classList.toggle('is-active', on)
    })
    overlay.querySelectorAll('[data-pdetail-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.pdetailPanel !== name
    })
    if (scroll) {
      // refresh FIRST: ScrollTrigger.refresh() writes the scroller's position
      // back while re-measuring, which cancels an in-flight smooth scrollTo
      motionMod?.refreshOverlay?.() // re-measure the gallery parallax triggers
      const panel = overlay.querySelector(`[data-pdetail-panel="${name}"]`)
      if (panel) {
        // put the panel's first content just under the sticky bar; the shared
        // pano block glides out above so the switch is visible immediately
        const top = Math.max(0, panel.offsetTop - elTabs.offsetHeight)
        if (!prefersReduced && motionMod?.scrollOverlayTo) {
          // gsap glide — a native smooth scroll here gets cancelled by the
          // ScrollTrigger.refresh() that still-loading gallery images fire
          motionMod.scrollOverlayTo(elScroll, top)
        } else {
          elScroll.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' })
        }
      }
    }
  }
  tabBtns.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn.dataset.tab, { scroll: true }))
    btn.addEventListener('keydown', (e) => {
      const dir = { ArrowRight: 1, ArrowLeft: -1, Home: 0, End: 0 }
      if (!(e.key in dir)) return
      e.preventDefault()
      const to =
        e.key === 'Home' ? 0
        : e.key === 'End' ? tabBtns.length - 1
        : (i + dir[e.key] + tabBtns.length) % tabBtns.length
      tabBtns[to].focus()
      selectTab(tabBtns[to].dataset.tab, { scroll: true })
    })
  })

  /* click-to-zoom for sketches: fit view ⇄ pannable 3000px view (drawings
   * carry fine linework — "readable" means reachable at full size) */
  const zoomedSketch = () => overlay.querySelector('.pdetail__sketch.is-zoomed')
  function setZoom(fig, on) {
    const btn = fig.querySelector('[data-sketch-zoom]')
    const img = fig.querySelector('img')
    if (on && img.dataset.zoomSrc && img.src !== img.dataset.zoomSrc) img.src = img.dataset.zoomSrc
    fig.classList.toggle('is-zoomed', on)
    btn.setAttribute('aria-pressed', String(on))
    const label = on ? ui.projects.zoomOut : ui.projects.zoomIn
    btn.dataset.ariaBg = label[0]
    btn.dataset.ariaEn = label[1]
    btn.setAttribute('aria-label', label[lang === 'bg' ? 0 : 1])
  }
  let openedProject = null // config entry of the open overlay (for room clicks)
  elSeq.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-pano-jump]')
    if (jump && openedProject) return selectRoom(openedProject, +jump.dataset.panoJump)
    const btn = e.target.closest('[data-sketch-zoom]')
    if (!btn) return
    const fig = btn.closest('.pdetail__sketch')
    setZoom(fig, !fig.classList.contains('is-zoomed'))
  })

  function openProject(i) {
    const p = projects[i]
    if (!p) return
    const t = (bg, en) => (lang === 'bg' ? bg : en)
    const token = ++openToken
    elMeta.textContent = t(p.metaBg, p.metaEn)
    elTitle.textContent = t(p.titleBg, p.titleEn)
    elBlurb.textContent = t(p.blurbBg, p.blurbEn) || ''
    elTitle.dataset.bg = p.titleBg; elTitle.dataset.en = p.titleEn
    elMeta.dataset.bg = p.metaBg; elMeta.dataset.en = p.metaEn
    elBlurb.dataset.bg = p.blurbBg || ''; elBlurb.dataset.en = p.blurbEn || ''

    const L = lang === 'bg' ? 0 : 1
    const frames = galleryOf(p)
      .map(
        (n) =>
          `<figure class="pdetail__frame"><img src="${pAsset(p.id, 'gallery', n, 1600)}" alt="" loading="lazy" decoding="async" /></figure>`
      )
      .join('')
    // 360° block: shared between both views — first thing under the tab bar,
    // so it is on screen when the overlay opens and survives tab switches.
    // Multi-room projects get a chip switcher; the badge always names the room.
    const rooms = p.panoramas || []
    panoRoom = 0
    const roomChips =
      rooms.length > 1
        ? `<div class="pdetail__pano-rooms" role="group"
                data-i18n-aria="pano.rooms" aria-label="${ui.pano.rooms[L]}">${rooms
            .map(
              (r, i) => `
              <button class="pdetail__pano-room${i === 0 ? ' is-active' : ''}" type="button"
                      data-pano-jump="${i}" aria-pressed="${i === 0}"
                      data-bg="${r.bg}" data-en="${r.en}">${lang === 'bg' ? r.bg : r.en}</button>`
            )
            .join('')}</div>`
        : ''
    const panoBlock = rooms.length
      ? `<div class="pdetail__pano">
           <div class="pdetail__pano-stage" data-pano-stage></div>
           <span class="pdetail__pano-badge"><span data-i18n="pano.badge">${ui.pano.badge[L]}</span> · <span
                 data-pano-room data-bg="${rooms[0].bg}" data-en="${rooms[0].en}">${lang === 'bg' ? rooms[0].bg : rooms[0].en}</span></span>
           ${roomChips}
           <p class="pdetail__pano-hint" data-i18n="pano.hint">${ui.pano.hint[L]}</p>
         </div>`
      : ''

    const sketchNames = sketchesOf(p)
    const hasSketches = sketchNames.length > 0
    elTabs.hidden = !hasSketches
    if (hasSketches) {
      const zoomLabel = ui.projects.zoomIn
      const sketches = sketchNames
        .map(
          (n) => `
        <figure class="pdetail__sketch">
          <button class="pdetail__sketch-btn" type="button" data-sketch-zoom
                  aria-pressed="false" aria-label="${zoomLabel[L]}"
                  data-aria-bg="${zoomLabel[0]}" data-aria-en="${zoomLabel[1]}">
            <img src="${pAsset(p.id, 'sketches', n, 1000)}" data-zoom-src="${pAsset(p.id, 'sketches', n, 3000)}"
                 alt="" loading="lazy" decoding="async" />
          </button>
        </figure>`
        )
        .join('')
      elSeq.innerHTML =
        panoBlock +
        `<div class="pdetail__panel" id="pdetail-panel-project" data-pdetail-panel="project"
              role="tabpanel" tabindex="0" aria-labelledby="pdetail-tab-project" hidden>${sketches}</div>` +
        `<div class="pdetail__panel" id="pdetail-panel-gallery" data-pdetail-panel="gallery"
              role="tabpanel" tabindex="0" aria-labelledby="pdetail-tab-gallery">${frames}</div>`
      selectTab('gallery') // the finished work opens; Проект is the deeper dive
    } else {
      // no sketches → no tab bar, no panel semantics: the overlay as it was
      elSeq.innerHTML = panoBlock + frames
    }

    overlay.setAttribute('aria-label', t(p.titleBg, p.titleEn))
    openedProject = p
    lastFocus = document.activeElement
    overlay.hidden = false
    document.body.classList.add('is-locked')
    requestAnimationFrame(() => {
      overlay.classList.add('is-open')
      elScroll.scrollTop = 0
      elClose.focus()
      if (motionMod) overlayCleanup = motionMod.overlayMotion(elScroll)
    })
    if (rooms.length) setupPano(p, token)
    document.addEventListener('keydown', onKey)
  }
  function closeProject() {
    openToken++ // invalidate any in-flight pano setup
    overlay.classList.remove('is-open')
    document.body.classList.remove('is-locked')
    document.removeEventListener('keydown', onKey)
    const inst = pano
    const cleanup = overlayCleanup
    pano = null
    overlayCleanup = null
    let finished = false
    const done = () => {
      if (finished) return // transitionend AND the timeout both call this
      finished = true
      overlay.hidden = true
      overlay.removeEventListener('transitionend', done)
      inst?.destroy() // dispose GL context, texture, listeners
      cleanup?.() // revert overlay ScrollTriggers
      if (lastFocus && lastFocus.focus) lastFocus.focus()
    }
    overlay.addEventListener('transitionend', done)
    setTimeout(done, 450) // fallback if no transition fires
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      // a zoomed sketch swallows the first ESC (zoom out, stay in the overlay)
      const z = zoomedSketch()
      if (z) return setZoom(z, false)
      return closeProject()
    }
    if (e.key === 'Tab') {
      // focus trap across everything focusable in the overlay (close button,
      // visible tabs — roving tabindex keeps unselected ones out — and the
      // zoom buttons of whichever panel is shown)
      // getClientRects, not offsetParent: the close button is position:fixed,
      // which reports offsetParent === null even while perfectly visible
      const f = [...overlay.querySelectorAll('button, [tabindex="0"]')].filter(
        (el) => !el.closest('[hidden]') && el.tabIndex >= 0 && el.getClientRects().length > 0
      )
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (!overlay.contains(document.activeElement)) {
        e.preventDefault(); first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }
  }

  root.querySelectorAll('[data-project]').forEach((btn) =>
    btn.addEventListener('click', () => openProject(+btn.dataset.project))
  )
  elClose.addEventListener('click', closeProject)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeProject()
  })
}

/* ── 12. ENQUIRY FORM overlay (emailed by the function, AJAX) ──────────────
 * The "Свържете се с нас" button used to be a mailto: link — a dead end on any
 * machine without a configured mail client, and it captured nothing. It now
 * opens the form that ships statically in index.html; this module only wires
 * up open/close, validation and the AJAX POST.
 *
 * Submission is AJAX so the visitor stays on the page: POST the form
 * url-encoded to its own action — /api/enquiry (the Vercel serverless
 * function in api/enquiry.js), which verifies the Turnstile token and EMAILS
 * the enquiry to the studio over SMTP (no hosted form service; the one we
 * once relied on silently dropped submissions past its free cap, which is
 * why the form self-hosts). Locally (`vite preview`) there is no function
 * runtime, so the POST fails and the error state shows — that is the error
 * path working, not a bug.
 *
 * Accessibility: role="dialog" + aria-modal, focus moves in on open and back to
 * the opener on close, Tab is trapped inside the panel, ESC and a backdrop click
 * both dismiss, and the page behind is scroll-locked (body.is-locked). */
{
  const modal = document.querySelector('[data-form-modal]')
  const form = modal?.querySelector('[data-form]')
  if (modal && form) {
    const panel = modal.querySelector('.cform__panel')
    const bodyEl = modal.querySelector('[data-form-body]')
    const doneEl = modal.querySelector('[data-form-done]')
    const errEl = modal.querySelector('[data-form-err]')
    const errTitle = modal.querySelector('[data-form-err-title]')
    const errText = modal.querySelector('[data-form-err-text]')
    const errMail = modal.querySelector('[data-form-err-mail]')
    const submitBtn = modal.querySelector('[data-form-submit]')
    const submitLabel = modal.querySelector('[data-form-submit-label]')
    const capHost = modal.querySelector('[data-turnstile]')
    const FOCUSABLE =
      'a[href], button:not(:disabled), input:not([disabled]):not([tabindex="-1"]),' +
      'select:not([disabled]), textarea:not([disabled])'
    const L = () => (lang === 'bg' ? 0 : 1)
    let lastFocus = null
    let sending = false
    let closeT = 0

    /* ── the error panel, four ways ──────────────────────────────────────────
     * One panel serves the generic failure and the three CAPTCHA states. We
     * rewrite the title/text elements' data-i18n KEYS rather than their text, so
     * applyLang() keeps whichever message is on screen correct if the visitor
     * switches language afterwards — no bespoke re-translation path. */
    const ERRORS = {
      generic: ['form.errTitle', 'form.errText', true],
      captcha: ['form.captchaFailedTitle', 'form.captchaFailedText', true],
      captchaLoad: ['form.captchaLoadTitle', 'form.captchaLoadText', true],
      // "still verifying" is not a failure — no mailto escape hatch needed
      captchaPending: ['form.captchaPendingTitle', 'form.captchaPendingText', false],
    }
    function showError(kind) {
      const [titleKey, textKey, withMail] = ERRORS[kind] || ERRORS.generic
      errTitle.dataset.i18n = titleKey
      errText.dataset.i18n = textKey
      errTitle.textContent = dig(titleKey)[L()]
      errText.textContent = dig(textKey)[L()]
      errMail.hidden = !withMail
      errEl.hidden = false
      errEl.scrollIntoView({ block: 'nearest', behavior: prefersReduced ? 'auto' : 'smooth' })
    }

    /* ── Turnstile, loaded LAZILY on first open ──────────────────────────────
     * Deliberately not in the page bundle or a preload: it is ~60–90 KB of third
     * party that only matters to someone who actually opens the enquiry form, so
     * non-enquiring visitors never pay for it and it cannot touch LCP/INP on the
     * page itself. `render=explicit` means the script does not hunt the DOM for
     * widgets — we place ours when we are ready. */
    let capScript = null
    let capId = null
    let capRenderedAs = '' // theme|lang the live widget was built with
    let capBroken = false

    const usingTestKey = captcha.testKeys.includes(captcha.sitekey)
    if (usingTestKey) {
      console.warn(
        `[semplo] Turnstile is using Cloudflare's TEST site key (${captcha.sitekey}) — the ` +
          `enquiry form is NOT protected. Replace \`captcha.sitekey\` in src/sections.config.js ` +
          `with the real key and set TURNSTILE_SECRET_KEY in Vercel → Project → ` +
          `Settings → Environment Variables.`
      )
    }

    function loadTurnstile() {
      if (capScript) return capScript
      capScript = new Promise((resolve, reject) => {
        // the script calls this global once its API is ready
        window.__semploTurnstile = () => resolve(window.turnstile)
        const s = document.createElement('script')
        s.src = `${captcha.scriptSrc}?render=explicit&onload=__semploTurnstile`
        s.async = true
        s.defer = true
        s.onerror = () => reject(new Error('turnstile script blocked'))
        document.head.appendChild(s)
        // an ad-blocker can neuter the request without firing onerror
        setTimeout(() => reject(new Error('turnstile script timed out')), 12_000)
      }).catch((e) => {
        capScript = null // let a retry re-attempt the load
        throw e
      })
      return capScript
    }

    async function mountCaptcha() {
      if (!capHost) return
      // read the theme off the root attribute rather than the module's `theme`
      // variable: the attribute is what the page is actually painted with, and
      // it stays correct even if something set it without going through
      // applyTheme() (the pre-paint boot script in index.html does exactly that)
      const active = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      const want = `${active}|${lang}`
      // Turnstile cannot restyle or re-translate a live widget — to follow the
      // theme or language it has to be torn down and rebuilt. (Both are in fact
      // unreachable while the dialog is open, since the backdrop swallows clicks
      // on the nav, so in practice this only fires when the visitor changes one,
      // closes nothing, and opens the dialog again.)
      try {
        const ts = await loadTurnstile()
        capBroken = false
        if (capId !== null && capRenderedAs !== want) {
          ts.remove(capId)
          capId = null
        }
        if (capId === null) {
          capId = ts.render(capHost, {
            sitekey: captcha.sitekey,
            theme: active,
            language: lang === 'bg' ? 'bg' : 'en',
            size: 'flexible', // spans the column like every other control
            action: 'enquiry', // shows up in Cloudflare's analytics
            callback: () => {
              // Clear ONLY the "still verifying" nag, and only that one. Matching
              // every form.captcha* key here wiped the "security check failed"
              // message the visitor needs to read: a rejected submit resets the
              // widget, the reset issues a fresh token, and this callback then
              // erased the explanation a moment after it appeared.
              if (!errEl.hidden && errTitle.dataset.i18n === 'form.captchaPendingTitle') {
                errEl.hidden = true
              }
            },
            'expired-callback': () => ts.reset(capId),
            'error-callback': () => {
              capBroken = true
            },
          })
          capRenderedAs = want
          // published on the host element: Turnstile encodes theme/language as
          // opaque path segments in its iframe URL, so this is the only stable
          // way to see (or assert) what the live widget was actually built with
          capHost.dataset.rendered = want
          // a dummy sitekey returns a token but draws nothing — show the badge
          // so the box never looks simply broken
          const badge = capHost.querySelector('[data-captcha-test]')
          if (badge) badge.hidden = !usingTestKey
        } else {
          ts.reset(capId) // fresh token: they are single-use and time-limited
        }
      } catch {
        capBroken = true // handled at submit time, not with an alert on open
      }
    }

    const capToken = () => {
      try {
        return (capId !== null && window.turnstile?.getResponse(capId)) || ''
      } catch {
        return ''
      }
    }
    const capReset = () => {
      try {
        if (capId !== null) window.turnstile?.reset(capId)
      } catch {}
    }

    const focusables = () =>
      [...panel.querySelectorAll(FOCUSABLE)].filter(
        (el) => !el.closest('[hidden]') && el.offsetParent !== null
      )

    function openForm() {
      clearTimeout(closeT)
      lastFocus = document.activeElement
      // a previous success leaves the done panel showing — reset to the form
      bodyEl.hidden = false
      doneEl.hidden = true
      errEl.hidden = true
      form.classList.remove('was-submitted', 'is-sending')
      modal.hidden = false
      document.body.classList.add('is-locked')
      document.body.classList.remove('nav-open')
      requestAnimationFrame(() => {
        modal.classList.add('is-open')
        panel.scrollTop = 0
        // straight into the first field: one less click before typing
        ;(modal.querySelector('#cf-name') || focusables()[0])?.focus()
      })
      document.addEventListener('keydown', onKey, true)
      // fetch + render the CAPTCHA now, not on page load. Fire-and-forget: it
      // resolves while they are still typing, and any failure surfaces at submit
      // rather than interrupting them the moment the dialog appears.
      mountCaptcha()
    }

    function closeForm() {
      if (modal.hidden) return
      modal.classList.remove('is-open')
      document.body.classList.remove('is-locked')
      document.removeEventListener('keydown', onKey, true)
      clearTimeout(closeT)
      closeT = setTimeout(() => {
        modal.hidden = true
      }, 400) // matches the .cform opacity transition
      if (lastFocus?.focus) lastFocus.focus()
    }

    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation() // don't also trip the mobile-nav ESC handler
        closeForm()
        return
      }
      if (e.key !== 'Tab') return
      const f = focusables()
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      // keep Tab inside the dialog (and pull it back if focus escaped entirely)
      if (!panel.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document
      .querySelectorAll('[data-form-open]')
      .forEach((b) => b.addEventListener('click', openForm))
    modal.querySelectorAll('[data-form-close]').forEach((b) => b.addEventListener('click', closeForm))
    modal.querySelector('[data-form-backdrop]')?.addEventListener('click', closeForm)

    /* Native constraint validation stays in charge: an invalid form never fires
     * `submit` at all (no novalidate), so the browser's own bubbles are what the
     * visitor sees. This click handler only arms the invalid-field styling,
     * because it runs BEFORE that validation pass. */
    submitBtn.addEventListener('click', () => form.classList.add('was-submitted'))

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (sending) return

      /* CAPTCHA gate, client side. This is a courtesy check so the visitor gets
       * a useful message instead of a bounced POST — the ACTUAL enforcement is
       * the token verification in api/enquiry.js, which a client cannot skip
       * by editing this file. */
      if (!capToken()) {
        // distinguish "blocked/never loaded" from "just not finished yet"
        showError(capBroken || capId === null ? 'captchaLoad' : 'captchaPending')
        if (capBroken) mountCaptcha() // one quiet retry of the script
        return
      }

      sending = true
      errEl.hidden = true
      form.classList.add('is-sending')
      submitBtn.disabled = true
      submitLabel.textContent = ui.form.sending[L()]
      try {
        const res = await fetch(form.getAttribute('action') || '/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          // FormData → url-encoded keeps the honeypot and Turnstile's
          // cf-turnstile-response input in the payload the function checks
          body: new URLSearchParams(new FormData(form)).toString(),
        })
        if (!res.ok) {
          // the function reports a rejected token as 403 { error: 'captcha' }
          const why = res.status === 403 ? await res.json().catch(() => ({})) : {}
          throw Object.assign(new Error(`HTTP ${res.status}`), { captcha: why.error === 'captcha' })
        }
        form.reset()
        bodyEl.hidden = true
        doneEl.hidden = false
        panel.scrollTop = 0
        doneEl.querySelector('[data-form-close]')?.focus()
      } catch (err) {
        showError(err?.captcha ? 'captcha' : 'generic')
      } finally {
        // A token is single-use and Cloudflare has now consumed it, so the
        // widget must be reset either way — otherwise a retry re-sends a spent
        // token and the function rejects it a second time.
        capReset()
        sending = false
        form.classList.remove('is-sending')
        submitBtn.disabled = false
        submitLabel.textContent = ui.form.submit[L()]
      }
    })
  }
}
