/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — portfolio page generator (static HTML from config).
 * ─────────────────────────────────────────────────────────────────────────
 *  The homepage is index.html + main.js. The PORTFOLIO is a second kind of
 *  page: a listing at `portfolio.path` and one page per project under it. Each
 *  is a real static HTML file so crawlers, link previews and no-JS visitors
 *  get the full content — title, meta, Open Graph, the copy, every photo —
 *  without executing a script. src/page.js then ENHANCES the page (language
 *  and theme toggles, the hero slider, the category filter, the 360° viewer,
 *  the reveal motion).
 *
 *  Written from src/sections.config.js (`projects`, `portfolio`, `ui`,
 *  `business`) + src/projects.manifest.json (which photos exist):
 *
 *      portfolio/index.html              the filterable grid
 *      portfolio/<id>/index.html         one page per project
 *      public/sitemap.xml                homepage + portfolio + every project
 *                                        page + the catalogue PDFs
 *
 *  The generated HTML under portfolio/ is GITIGNORED — it is rebuilt by the
 *  Vite plugin in vite.config.js on every `vite build` / `vite` start (and on
 *  every config change while the dev server runs), so it can never go stale.
 *  sitemap.xml is written into public/ (committed, like the other public
 *  files) and regenerated the same way.
 *
 *  Run standalone:  node scripts/build-pages.mjs
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// the homepage's hand-set lastmod (it was in the hand-written sitemap before
// this generator took over) — bump when the homepage content changes
const HOME_LASTMOD = '2026-08-02'

/* ── tiny template helpers ─────────────────────────────────────────────── */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
/** bilingual element: BG shown, EN carried for the runtime toggle */
const bi = (tag, bg, en, attrs = '') =>
  `<${tag}${attrs ? ' ' + attrs : ''} data-bg="${esc(bg)}" data-en="${esc(en)}">${esc(bg)}</${tag}>`
/** ui-string element (runtime toggle via data-i18n) */
const t = (ui, key, tag = 'span', attrs = '') => {
  const v = key.split('.').reduce((o, k) => (o ? o[k] : undefined), ui)
  return `<${tag}${attrs ? ' ' + attrs : ''} data-i18n="${key}">${esc(v[0])}</${tag}>`
}
const clip = (s, n = 158) => {
  const str = String(s || '').replace(/\s+/g, ' ').trim()
  if (str.length <= n) return str
  const cut = str.slice(0, n - 1)
  const word = cut.slice(0, Math.max(cut.lastIndexOf(' '), n - 30)).replace(/[\s.,;:—–-]+$/, '')
  return word + '…'
}

/* ── derived per-project values ────────────────────────────────────────── */
function derive(p, ui, pmanifest) {
  const m = pmanifest[p.id] || { gallery: [], sketches: [], panoramas: [] }
  const gallery = m.gallery || []
  const cover = p.cover && gallery.includes(p.cover) ? p.cover : gallery[0]
  const typeBg = p.typeBg || ui.portfolio.types[p.category]?.[0] || ''
  const typeEn = p.typeEn || ui.portfolio.types[p.category]?.[1] || ''
  const area =
    p.area != null
      ? {
          bg: ui.portfolio.area[0].replace('{n}', String(p.area)),
          en: ui.portfolio.area[1].replace('{n}', String(p.area)),
        }
      : null
  const todo = new Set(p.todo || [])
  return { m, gallery, cover, typeBg, typeEn, area, todo }
}

const asset = (pid, type, name, w) => `/projects/${pid}/${type}/${name}-${w}.webp`
/** width/height attributes from the manifest's recorded dims — the browser
 *  reserves the image's box before the file arrives (no layout shift). The
 *  values are the largest variant's pixels; CSS sizes the box, the attributes
 *  only fix its aspect ratio. Empty string when a dim is unknown. */
const dimAttrs = (m, type, name) => {
  const d = m.dims?.[`${type}/${name}`]
  return d ? ` width="${d[0]}" height="${d[1]}"` : ''
}

/* ── shared chrome (mirrors index.html — keep the two in step) ─────────── */
function themeBoot() {
  return `<script>
      (function () {
        var t
        try {
          t = localStorage.getItem('semplo:theme')
        } catch (e) {}
        if (t !== 'light' && t !== 'dark')
          t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        document.documentElement.dataset.theme = t
        if (t === 'dark') {
          var m = document.querySelector('meta[name="theme-color"]')
          if (m) m.content = '#121110'
        }
        /* motion-ok visitors: hold the reveal targets invisible until the
           motion chunk has taken them over (no flash-then-hide). page.js lifts
           this class the moment motion starts — or after a safety timeout. */
        var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        var force = /[?&]forcemotion/.test(location.search)
        if (!reduce || force) document.documentElement.classList.add('motion-pending')
      })()
    </script>`
}

function head({ ui, business, title, titleEn, description, canonical, ogImage, ogAlt, type = 'website' }) {
  const og = ogImage || {
    url: `${business.url}${business.ogImage.path}`,
    type: business.ogImage.type,
    width: business.ogImage.width,
    height: business.ogImage.height,
  }
  return `<!doctype html>
<html lang="bg">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title data-bg="${esc(title)}" data-en="${esc(titleEn)}">${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <!-- Generated by scripts/build-pages.mjs from src/sections.config.js — do not edit by hand. -->
    <link rel="canonical" href="${esc(canonical)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:url" content="${esc(canonical)}" />
    <meta property="og:site_name" content="${esc(business.name)}" />
    <meta property="og:locale" content="bg_BG" />
    <meta property="og:locale:alternate" content="en_GB" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:image" content="${esc(og.url)}" />
    <meta property="og:image:type" content="${esc(og.type)}" />
    <meta property="og:image:width" content="${og.width}" />
    <meta property="og:image:height" content="${og.height}" />
    <meta property="og:image:alt" content="${esc(ogAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link
      rel="icon"
      href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23f3f1ec'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='22' fill='%23a6760a' text-anchor='middle'%3ES%3C/text%3E%3C/svg%3E"
    />
    <meta name="theme-color" content="#f3f1ec" />
    ${themeBoot()}
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..600;1,9..144,300..500&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="/src/styles.css" />
    <link rel="stylesheet" href="/src/portfolio.css" />
  </head>`
}

function nav({ ui, portfolio }) {
  return `
    <div class="nav-scrim" data-nav-scrim aria-hidden="true"></div>
    <header class="nav" data-nav>
      <a class="nav__brand" href="/">
        <span class="nav__logo" data-i18n="brand">SEMPLO DESIGN</span>
        <span class="nav__tag" data-i18n="tagline">Интериорно студио</span>
      </a>
      <nav class="nav__links" id="nav-links" aria-label="Primary">
        <a href="${portfolio.path}" data-i18n="nav.work" aria-current="page">Проекти</a>
        <a href="/#catalogs" data-i18n="nav.catalogs">Каталози</a>
        <a href="/#studio" data-i18n="nav.studio">Студио</a>
        <a href="/#contact" data-i18n="nav.contact">Контакт</a>
        <a href="https://semplohome.com/" target="_blank" rel="noopener" class="nav__ext" data-i18n="nav.shop">Магазин</a>
      </nav>
      <div class="lang" role="group" aria-label="Language">
        <button type="button" class="lang__btn is-active" data-lang="bg" aria-pressed="true">BG</button>
        <span class="lang__sep">·</span>
        <button type="button" class="lang__btn" data-lang="en" aria-pressed="false">EN</button>
      </div>
      <button class="themetog" data-theme-toggle type="button"
              aria-pressed="false" aria-label="Тъмен режим" title="Тъмен режим">
        <svg class="themetog__moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/>
        </svg>
        <svg class="themetog__sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
            <circle cx="12" cy="12" r="4.1"/>
            <path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>
          </g>
        </svg>
      </button>
      <button class="nav__burger" data-burger type="button" aria-label="Меню"
              aria-expanded="false" aria-controls="nav-links">
        <span></span><span></span><span></span>
      </button>
    </header>`
}

function footer({ business }) {
  return `
      <footer class="foot">
        <div class="foot__col foot__social">
          <a href="https://www.facebook.com/semplodesign.bulgaria" target="_blank" rel="noopener" aria-label="Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M14 9h3l.4-3H14V4.3c0-.9.3-1.5 1.6-1.5H17V.1C16.7.1 15.7 0 14.6 0 12.2 0 10.6 1.4 10.6 4v2H8v3h2.6v8H14V9z"/>
            </svg>
          </a>
          <a href="https://www.instagram.com/semplo.design" target="_blank" rel="noopener" aria-label="Instagram">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.3 2.2.4.6.2 1 .4 1.4.9.5.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.3 1.8-.4 2.2-.2.6-.4 1-.9 1.4-.4.5-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.3-2.2-.4-.6-.2-1-.4-1.4-.9-.5-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.3-1.8.4-2.2.2-.6.4-1 .9-1.4.4-.5.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 12 18.6 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 12 7.7a4.3 4.3 0 0 1 0 8.6zm6.8-11.2a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z"/>
            </svg>
          </a>
        </div>
        <div class="foot__col foot__center">
          <span class="foot__brand" data-i18n="brand">SEMPLO DESIGN</span>
          <span data-i18n="foot.rights">© 2026 SEMPLO DESIGN — Интериорно студио · Всички права запазени</span>
          <a class="foot__credit" href="https://webservices.agency" target="_blank"
             rel="noopener" data-i18n="foot.credit">Изработка и поддръжка — webservices.agency</a>
        </div>
        <div class="foot__col foot__contact">
          <span data-i18n="contact.addr">бул. „Околовръстен път“ 130, София</span>
          <a href="tel:${esc(business.tel)}" data-i18n="contact.phone">${esc(business.phone)}</a>
          <a href="mailto:${esc(business.email)}" data-i18n="contact.email">${esc(business.email)}</a>
        </div>
      </footer>`
}

/** placeholder badge for copy the client has not supplied yet */
const todoBadge = (ui, key = 'todo') =>
  `<span class="pj-todo" data-i18n="portfolio.${key}">${esc(ui.portfolio[key][0])}</span>`

/* ── the listing: portfolio/index.html ──────────────────────────────────── */
function listingPage(cfg) {
  const { projects, portfolio, ui, business, pmanifest } = cfg
  const chips = ['all', ...portfolio.categories]
    .map((c) => {
      const key = c === 'all' ? 'portfolio.all' : `portfolio.cats.${c}`
      return `<button class="pf-filter__btn" type="button" data-filter="${c}" aria-pressed="${c === 'all'}">${t(ui, key, 'span')}</button>`
    })
    .join('\n          ')

  const cards = projects
    .map((p, i) => {
      const d = derive(p, ui, pmanifest)
      const cover = d.cover
      const src = asset(p.id, 'gallery', cover, 1600)
      const srcset = `${asset(p.id, 'gallery', cover, 900)} 900w, ${src} 1600w`
      const meta = [bi('span', p.locationBg, p.locationEn), bi('span', d.typeBg, d.typeEn)]
      if (d.area) meta.push(bi('span', d.area.bg, d.area.en))
      return `
        <a class="pcard" href="${portfolio.path}${p.id}/" data-cat="${esc(p.category)}">
          <span class="pcard__media">
            <img src="${src}" srcset="${srcset}" sizes="(max-width: 720px) 100vw, 50vw"${dimAttrs(d.m, 'gallery', cover)}
                 alt="${esc(p.titleEn)} — ${esc(d.typeEn)}, ${esc(p.locationEn)}"
                 loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async" />
            <span class="pcard__view" aria-hidden="true" data-i18n="portfolio.view">${esc(ui.portfolio.view[0])}</span>
          </span>
          <span class="pcard__body">
            ${t(ui, `portfolio.types.${p.category}`, 'span', 'class="pcard__cat"')}
            ${bi('span', p.titleBg, p.titleEn, 'class="pcard__title"')}
            ${bi('span', p.cardBg, p.cardEn, 'class="pcard__blurb"')}
            <span class="pcard__meta">${meta.join('<span class="pcard__sep" aria-hidden="true">·</span>')}</span>
            ${d.todo.has('card') ? todoBadge(ui) : ''}
          </span>
        </a>`
    })
    .join('')

  const title = `${ui.portfolio.title[0]} — ${business.name}`
  const titleEn = `${ui.portfolio.title[1]} — ${business.name}`
  return `${head({
    ui,
    business,
    title,
    titleEn,
    description: `${ui.portfolio.intro[0]} ${ui.portfolio.intro[1]}`,
    canonical: `${business.url}${portfolio.path.slice(1)}`,
    ogAlt: 'SEMPLO DESIGN — завършен интериор в мека дневна светлина',
  })}
  <body class="nav-ink" data-page="portfolio">
    ${nav(cfg)}

    <main id="top">
      <section class="pf">
        <header class="pf-head">
          ${t(ui, 'portfolio.eyebrow', 'p', 'class="pf-head__eyebrow"')}
          ${t(ui, 'portfolio.title', 'h1', 'class="pf-head__title"')}
          ${t(ui, 'portfolio.intro', 'p', 'class="pf-head__intro"')}
        </header>
        <div class="pf-filter" role="group" data-i18n-aria="portfolio.filter"
             aria-label="${esc(ui.portfolio.filter[0])}" data-filters>
          ${chips}
        </div>
        <div class="pf-grid" data-grid>${cards}
        </div>
        ${t(ui, 'portfolio.empty', 'p', 'class="pf-empty" data-empty hidden')}
      </section>
      ${footer(cfg)}
    </main>

    <script type="module" src="/src/page.js"></script>
  </body>
</html>
`
}

/* ── one project: portfolio/<id>/index.html ─────────────────────────────── */
function projectPage(p, i, cfg) {
  const { projects, portfolio, ui, business, pmanifest } = cfg
  const d = derive(p, ui, pmanifest)
  const url = `${business.url}${portfolio.path.slice(1)}${p.id}/`
  // prev / next wrap around the config order — but never show the SAME project
  // on both sides: with two projects only "next" appears, with one neither
  const N = projects.length
  const prev = N >= 3 ? projects[(i - 1 + N) % N] : null
  const next = N >= 2 ? projects[(i + 1) % N] : null

  /* hero slider — the first `heroFrames` photos, first eager */
  const heroNames = d.gallery.slice(0, Math.max(1, portfolio.heroFrames))
  const slides = heroNames
    .map(
      (n, k) => `
          <figure class="pj-hero__slide" data-slide="${k}" role="group" aria-roledescription="slide"
                  aria-label="${k + 1} / ${heroNames.length}">
            <img src="${asset(p.id, 'gallery', n, 1600)}"${dimAttrs(d.m, 'gallery', n)}
                 srcset="${asset(p.id, 'gallery', n, 900)} 900w, ${asset(p.id, 'gallery', n, 1600)} 1600w"
                 sizes="100vw" alt="" loading="${k < 2 ? 'eager' : 'lazy'}"
                 ${k === 0 ? 'fetchpriority="high"' : ''} decoding="async" />
          </figure>`
    )
    .join('')

  /* meta row: location · type [· area] — area is optional and simply absent */
  const meta = [
    bi('span', p.locationBg, p.locationEn, 'class="pj-meta__item"'),
    bi('span', d.typeBg, d.typeEn, 'class="pj-meta__item"'),
  ]
  if (d.area)
    meta.push(
      bi('span', d.area.bg, d.area.en, 'class="pj-meta__item"') +
        (d.todo.has('area') ? todoBadge(ui, 'todoArea') : '')
    )
  else if (d.todo.has('area')) meta.push(todoBadge(ui, 'todoAreaMissing')) // no figure yet — say so

  /* full gallery: every photo, lazy */
  const frames = d.gallery
    .map(
      (n) => `
          <figure class="pj-frame">
            <img src="${asset(p.id, 'gallery', n, 1600)}"${dimAttrs(d.m, 'gallery', n)}
                 srcset="${asset(p.id, 'gallery', n, 900)} 900w, ${asset(p.id, 'gallery', n, 1600)} 1600w"
                 sizes="100vw" alt="" loading="lazy" decoding="async" />
          </figure>`
    )
    .join('')

  /* 360° block — only for projects with labelled rooms (same chrome as the
     homepage overlay: badge, hint, chip switcher; page.js mounts the viewer) */
  const rooms = p.panoramas || []
  const roomChips =
    rooms.length > 1
      ? `<div class="pdetail__pano-rooms" role="group" data-i18n-aria="pano.rooms"
                 aria-label="${esc(ui.pano.rooms[0])}">${rooms
          .map(
            (r, k) => `
              <button class="pdetail__pano-room${k === 0 ? ' is-active' : ''}" type="button"
                      data-pano-jump="${k}" aria-pressed="${k === 0}"
                      data-bg="${esc(r.bg)}" data-en="${esc(r.en)}">${esc(r.bg)}</button>`
          )
          .join('')}
            </div>`
      : ''
  const panoBlock = rooms.length
    ? `
      <section class="pj-pano" data-pano data-rooms='${esc(JSON.stringify(rooms.map((r) => r.file)))}'>
        <div class="pj-intro__inner pj-pano__head">
          ${t(ui, 'portfolio.pano', 'h2', 'class="pj-h2"')}
        </div>
        <div class="pdetail__pano">
          <div class="pdetail__pano-stage" data-pano-stage></div>
          <span class="pdetail__pano-badge"><span data-i18n="pano.badge">${esc(ui.pano.badge[0])}</span> · <span
                data-pano-room data-bg="${esc(rooms[0].bg)}" data-en="${esc(rooms[0].en)}">${esc(rooms[0].bg)}</span></span>
          ${roomChips}
          <p class="pdetail__pano-hint" data-i18n="pano.hint">${esc(ui.pano.hint[0])}</p>
        </div>
      </section>`
    : ''

  const realTitleBg = p.realizationTitleBg || ui.portfolio.realization[0]
  const realTitleEn = p.realizationTitleEn || ui.portfolio.realization[1]

  const title = `${p.titleBg} — ${d.typeBg}, ${p.locationBg} · ${business.name}`
  const titleEn = `${p.titleEn} — ${d.typeEn}, ${p.locationEn} · ${business.name}`
  const ogAlt = `${p.titleEn} — ${d.typeEn} in ${p.locationEn} by ${business.name}`
  const navLink = (proj, dir) => `
          <a class="pj-nav__link pj-nav__link--${dir}" href="${portfolio.path}${proj.id}/" rel="${dir}">
            ${t(ui, dir === 'prev' ? 'portfolio.prevProject' : 'portfolio.nextProject', 'span', 'class="pj-nav__dir"')}
            ${bi('span', proj.titleBg, proj.titleEn, 'class="pj-nav__title"')}
          </a>`

  return `${head({
    ui,
    business,
    title,
    titleEn,
    description: clip(`${p.cardBg} ${p.conceptBg}`),
    canonical: url,
    ogImage: { url: `${business.url}projects/${p.id}/og.jpg`, type: 'image/jpeg', width: 1200, height: 630 },
    ogAlt,
    type: 'article',
  })}
  <body data-page="project" data-project="${esc(p.id)}">
    ${nav(cfg)}

    <main id="top">
      <!-- ── HERO: photo slider with the title overlaid ── -->
      <section class="pj-hero" data-dark data-slider>
        <div class="pj-hero__track" data-slider-track tabindex="0" aria-roledescription="carousel"
             data-i18n-aria="portfolio.slider" aria-label="${esc(ui.portfolio.slider[0])}">${slides}
        </div>
        <div class="pj-hero__inner">
          ${t(ui, `portfolio.types.${p.category}`, 'p', 'class="pj-hero__eyebrow"')}
          ${bi('h1', p.titleBg, p.titleEn, 'class="pj-hero__title"')}
        </div>
        <div class="pj-hero__ctrl"${heroNames.length < 2 ? ' hidden' : ''}>
          <button class="pj-hero__btn" type="button" data-slider-prev data-i18n-aria="portfolio.prev"
                  aria-label="${esc(ui.portfolio.prev[0])}"><span aria-hidden="true">←</span></button>
          <span class="pj-hero__count" aria-live="polite"><span data-slider-i>1</span><span class="pj-hero__of" aria-hidden="true">/</span>${heroNames.length}</span>
          <button class="pj-hero__btn" type="button" data-slider-next data-i18n-aria="portfolio.next"
                  aria-label="${esc(ui.portfolio.next[0])}"><span aria-hidden="true">→</span></button>
        </div>
      </section>

      <!-- ── META + two-column text ── -->
      <section class="pj-intro">
        <div class="pj-intro__inner">
          <p class="pj-meta" data-meta>${meta.join('<span class="pj-meta__sep" aria-hidden="true">·</span>')}</p>
          <div class="pj-text">
            <div class="pj-text__col${d.todo.has('concept') ? ' is-todo' : ''}">
              ${bi('h2', p.conceptTitleBg, p.conceptTitleEn, 'class="pj-text__title"')}
              ${bi('p', p.conceptBg, p.conceptEn, 'class="pj-text__body"')}
              ${d.todo.has('concept') ? todoBadge(ui) : ''}
            </div>
            <div class="pj-text__col${d.todo.has('realization') ? ' is-todo' : ''}">
              ${bi('h2', realTitleBg, realTitleEn, 'class="pj-text__title"')}
              ${bi('p', p.realizationBg, p.realizationEn, 'class="pj-text__body"')}
              ${d.todo.has('realization') ? todoBadge(ui) : ''}
            </div>
          </div>
        </div>
      </section>

      <!-- ── 360° block — only for projects with rooms; sits BEFORE the full
           gallery on purpose: it is the page's most distinctive element and a
           14-photo gallery would otherwise bury it (moved 2026-09-16) ── -->${panoBlock}

      <!-- ── FULL GALLERY ── -->
      <section class="pj-gallery" aria-labelledby="pj-gallery-title">
        <h2 class="visually-hidden" id="pj-gallery-title" data-i18n="portfolio.gallery">${esc(ui.portfolio.gallery[0])}</h2>${frames}
      </section>

      <!-- ── PREV / NEXT ── -->
      <nav class="pj-nav${prev ? '' : ' pj-nav--no-prev'}${next ? '' : ' pj-nav--no-next'}"
           data-i18n-aria="portfolio.other" aria-label="${esc(ui.portfolio.other[0])}">${prev ? navLink(prev, 'prev') : ''}
          <a class="pj-nav__all" href="${portfolio.path}">${t(ui, 'portfolio.allProjects', 'span')}</a>${next ? navLink(next, 'next') : ''}
      </nav>

      <!-- ── quiet CTA → the homepage contact block ── -->
      <section class="pj-cta">
        <div class="pj-intro__inner">
          ${t(ui, 'cta.eyebrow', 'p', 'class="pj-cta__eyebrow"')}
          ${t(ui, 'portfolio.ctaTitle', 'h2', 'class="pj-cta__title"')}
          ${t(ui, 'portfolio.ctaText', 'p', 'class="pj-cta__text"')}
          <a class="cta__btn" href="/#contact" data-i18n="cta.button">${esc(ui.cta.button[0])}</a>
        </div>
      </section>
      ${footer(cfg)}
    </main>

    <script type="module" src="/src/page.js"></script>
  </body>
</html>
`
}

/* ── sitemap.xml ────────────────────────────────────────────────────────── */
function sitemap({ projects, portfolio, catalogs, business }) {
  const origin = business.url.replace(/\/$/, '')
  const url = (loc, lastmod) =>
    `  <url>\n    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`
  const latest = projects.map((p) => p.updated).filter(Boolean).sort().pop()
  const rows = [
    url(business.url, HOME_LASTMOD),
    url(`${origin}${portfolio.path}`, latest),
    ...projects.map((p) => url(`${origin}${portfolio.path}${p.id}/`, p.updated)),
    ...catalogs.map((c) => url(`${origin}/catalogs/${c.id}.pdf`)),
  ]
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  SEMPLO DESIGN — sitemap. GENERATED by scripts/build-pages.mjs from
  src/sections.config.js on every build — do not edit by hand.

  Listed: the homepage, the portfolio page, one URL per project page, and the
  catalogue PDFs (genuinely indexable content whose links are injected by
  JavaScript on the homepage, so a crawler that runs no scripts would otherwise
  never find them).

  Anchor targets (#work, #studio, #reviews, #contact) are deliberately NOT
  listed — they are positions within the homepage, not separate URLs.

  <changefreq> and <priority> are omitted on purpose: Google ignores both.
  Every <loc> derives from \`business.url\`; the e2e suite compares them.
-->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${rows.join('\n')}
</urlset>
`
}

/* ── entry point ────────────────────────────────────────────────────────── */
/**
 * Generate every portfolio page + the sitemap. Returns the Rollup `input`
 * map for the generated HTML entries (vite.config.js spreads it).
 * Re-imports the config with a cache-busting query so the dev-server watcher
 * sees edits to src/sections.config.js without a restart.
 */
export async function buildPages({ quiet = false } = {}) {
  const cfgUrl = pathToFileURL(resolve(ROOT, 'src/sections.config.js')).href + `?t=${Date.now()}`
  const config = await import(cfgUrl)
  const pmanifest = JSON.parse(readFileSync(resolve(ROOT, 'src/projects.manifest.json'), 'utf8'))
  const cfg = { ...config, pmanifest }
  const { projects, portfolio } = cfg
  const dir = resolve(ROOT, portfolio.path.replace(/^\/|\/$/g, ''))

  // start clean: a project removed from config must not leave a stale page
  if (existsSync(dir)) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !projects.some((p) => p.id === entry.name))
        rmSync(resolve(dir, entry.name), { recursive: true, force: true })
    }
  }
  mkdirSync(dir, { recursive: true })

  const inputs = {}
  const listing = resolve(dir, 'index.html')
  writeFileSync(listing, listingPage(cfg))
  inputs.portfolio = listing
  projects.forEach((p, i) => {
    const pdir = resolve(dir, p.id)
    mkdirSync(pdir, { recursive: true })
    const file = resolve(pdir, 'index.html')
    writeFileSync(file, projectPage(p, i, cfg))
    inputs[`portfolio-${p.id}`] = file
  })
  writeFileSync(resolve(ROOT, 'public/sitemap.xml'), sitemap(cfg))

  if (!quiet)
    console.log(
      `✓ portfolio pages: ${portfolio.path} + ${projects.length} project page(s) → ${dir.replace(ROOT, '.')}/  · public/sitemap.xml`
    )
  return { inputs, dir }
}

// CLI: node scripts/build-pages.mjs
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPages().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
