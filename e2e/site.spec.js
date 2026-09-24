import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import sharp from 'sharp'
import { businessLd, publishable } from '../src/schema.js'
import {
  business, reviews, catalogs, captcha, ui, projects, strips, portfolio, featured,
} from '../src/sections.config.js'

// what assets each project actually has (emitted by scripts/optimize-projects.mjs
// walking assets/projects/<id>/) — the page builds itself from this + the config
const pmanifest = JSON.parse(fs.readFileSync('src/projects.manifest.json', 'utf8'))

const SITE = business.url // 'https://semplodesign.com/'
const SITE_ORIGIN = new URL(SITE).origin
// Cloudflare's dummy sitekeys issue a token but draw NO widget, so a few
// CAPTCHA assertions have to branch on which kind of key is configured. Both
// branches are asserted, so the suite keeps passing — and starts checking the
// real widget — as soon as the production key replaces the placeholder.
const USING_TEST_KEY = captcha.testKeys.includes(captcha.sitekey)

const PHONE = '+359 894 880 088'
const TEL = 'tel:+359894880088'
const WORDMARK = 'SEMPLO DESIGN'

/* ── shared helpers ───────────────────────────────────────────────────────── */

function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // failed-resource messages carry no URL in text() — pull it from location()
    const url = m.location()?.url || ''
    // Errors raised BY THIRD-PARTY SCRIPTS are outside the deploy and flake
    // the suite: fonts.gstatic.com intermittently 404s two Inter woff2 subsets
    // (fallback fonts cover it), and the Google Maps embed's own code logs CORS
    // / "google is not defined" errors from inside its iframe on some runs.
    // Anything our own code logs (same-origin location, or none) still counts,
    // and so does every uncaught page error.
    if (url && !url.includes('localhost')) return
    errors.push(`console.error: ${m.text()} [${url || 'no url'}]`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
}

// Playwright's project-level `use.reducedMotion` didn't reliably reach
// matchMedia here, so emulate it explicitly before every navigation.
test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'reduced-motion') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  }
})

async function ready(page) {
  await page.goto('/')
  await page.waitForSelector('body.is-ready', { timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    if (document.documentElement.scrollWidth <= vw + 1) return null
    let worst = null
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      const over = Math.round(r.right - vw)
      if (over > 1 && (!worst || over > worst.over)) {
        worst = { over, tag: el.tagName, cls: el.className?.toString().slice(0, 60) }
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, worst }
  })
}

// wait until scrolling has fully stopped. the hide-on-scroll handler re-hides
// the bar on any trailing scroll event, so we must reveal it only once idle.
async function waitScrollIdle(page) {
  let prev = -1
  for (let i = 0; i < 50; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY))
    if (y === prev) return
    prev = y
    await page.waitForTimeout(150)
  }
}

// reveal the hide-on-scroll bar (tucked away after a jump) once scrolling has
// settled, so the removal sticks.
async function revealNav(page) {
  await waitScrollIdle(page)
  await page.evaluate(() => document.body.classList.remove('nav-hidden'))
  await page.waitForTimeout(350)
}

// Open the enquiry dialog. The CTA button starts at visibility:hidden (the
// motion layer's staggered reveal owns it) and Playwright waits for visibility
// BEFORE it scrolls — so bring the contact section into view and let the reveal
// play first, or the click deadlocks on an element that will never appear.
async function openEnquiry(page) {
  await page.locator('#contact').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  await page.locator('[data-form-open]').click()
  await page.waitForTimeout(450)
}

/* Serve a stand-in for Turnstile's api.js.
 *
 * WHY: the production sitekey is domain-locked to semplodesign.com, so on
 * localhost the real widget renders its "failed to connect" state and never
 * issues a token — every test that needs one would hang. Cloudflare also
 * deliberately challenges headless browsers, so even an allowed domain could not
 * be relied on to self-solve in CI.
 *
 * WHAT IS STILL REAL: the request to challenges.cloudflare.com (so the
 * lazy-load assertion still means something), our loader, the explicit-render
 * handshake via the ?onload= callback, the hidden cf-turnstile-response input
 * that FormData reads, and every branch of our own gate and error handling. The
 * appearance of Cloudflare's own widget is the one thing this cannot cover — it
 * is checked by eye against a deployed build. */
async function fakeTurnstile(page) {
  await page.route('**/turnstile/v0/api.js*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      body: `(() => {
  let n = 0
  const widgets = new Map()
  const issue = (w) => {
    w.input.value = 'FAKE.TOKEN.' + (++n)
    if (w.opts.callback) w.opts.callback(w.input.value)
  }
  window.turnstile = {
    render(el, opts) {
      const host = typeof el === 'string' ? document.querySelector(el) : el
      const wrap = document.createElement('div')
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = 'cf-turnstile-response'
      wrap.appendChild(input)
      host.appendChild(wrap)
      const id = 'fake-' + (widgets.size + 1)
      const w = { host, wrap, input, opts }
      widgets.set(id, w)
      setTimeout(() => issue(w), 30)   // tokens arrive asynchronously, as real ones do
      return id
    },
    getResponse(id) { return (widgets.get(id) || {}).input?.value || '' },
    reset(id) {
      const w = widgets.get(id)
      if (!w) return
      w.input.value = ''               // single-use: cleared, then re-issued
      setTimeout(() => issue(w), 30)
    },
    remove(id) {
      const w = widgets.get(id)
      if (!w) return
      w.wrap.remove()
      widgets.delete(id)
    },
  }
  const src = (document.currentScript && document.currentScript.src) || ''
  const cb = src ? new URL(src, location.href).searchParams.get('onload') : null
  if (cb && typeof window[cb] === 'function') window[cb]()
})()`,
    })
  )
}

// Wait for a token to land in the hidden field the form actually submits.
async function waitCaptcha(page) {
  await page.waitForFunction(
    () => {
      const el = document.querySelector('[data-turnstile] input[name="cf-turnstile-response"]')
      return !!(el && el.value)
    },
    null,
    { timeout: 25_000 }
  )
}

// the compact mobile nav hides links behind a burger — open it before clicking.
async function openMobileNav(page) {
  const burger = page.locator('[data-burger]')
  if (!(await burger.count())) return
  await revealNav(page)
  if (await burger.isVisible()) {
    await burger.click()
    await page.waitForTimeout(350)
  }
}

// anchor scrolls can CREEP through pinned sections (~3s) — poll for the target
async function waitAnchorSettled(page, href) {
  await page
    .waitForFunction(
      (h) => {
        const el = document.getElementById(h.slice(1))
        return el && Math.abs(el.getBoundingClientRect().top - 75) < 140
      },
      href,
      { timeout: 7000 }
    )
    .catch(() => {})
}

// walk the whole page so every once-only GSAP reveal has fired, then come to
// rest at the bottom. Needed before any "is this actually legible" audit.
//
// NB: html has `scroll-behavior: smooth`, so a scripted scrollTo ANIMATES —
// a stepping loop then chases a target it never reaches and the page barely
// moves. Every scripted traversal here has to opt out of that first.
async function scrollWholePage(page) {
  await page.evaluate(async () => {
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    const step = Math.round(window.innerHeight * 0.6)
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 140))
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
    document.documentElement.style.scrollBehavior = prev
  })
  await page.waitForTimeout(700)
}

/* WCAG 2.1 contrast audit, run in-page against COMPUTED styles, so it measures
 * what the browser actually paints for the active [data-theme] — tokens,
 * translucency and all. Returns one row per failure.
 *
 * Deliberately scoped to text on THEMED SURFACES. Text over video/photography
 * (hero copy, ambient captions, the 360° chrome) has no static background to
 * measure — its legibility comes from the scrims, it is identical in both
 * themes, and this change does not touch it. The nav is audited only in its
 * frosted "past the hero" state, for the same reason. */
async function contrastFailures(page) {
  return page.evaluate(() => {
    const SEL = [
      '.nav__logo', '.nav__tag', '.nav__links a', '.lang__btn',
      '.interlude__eyebrow', '.interlude__title', '.interlude__body',
      '.studio__num', '.studio__stat-label',
      '.projects__eyebrow', '.projects__title', '.projects__more-link',
      '.catcard__cat', '.catcard__title', '.catcard__dl', '.catcard__size', '.catcard__doc',
      '.cta__eyebrow', '.cta__title', '.cta__text', '.cta__btn', '.cta__contacts',
      '.cta__contacts a', '.cta__maplink', '.foot__brand', '.foot__center span',
      '.foot__contact span', '.foot__contact a', '.foot__credit',
      // reviews section
      '.reviews__eyebrow', '.reviews__title', '.reviews__aggtext', '.reviews__link',
      '.review__text', '.review__author', '.review__date', '.review__todo',
      // enquiry form overlay (only audited while it is open — see the test)
      '.cform__eyebrow', '.cform__title', '.cform__intro', '.cform__field label',
      '.cform__opt', '.cform__req', '.cform__submit', '.cform__err', '.cform__err a',
      '.cform__captcha-label', '.cform__captcha-note', '.cform__captcha-test',
    ].join(',')

    const px = (c) => {
      const n = (String(c).match(/[-\d.]+/g) || ['0', '0', '0']).map(Number)
      return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n.length > 3 ? n[3] : 1 }
    }
    const lin = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    const flat = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    })
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (hi + 0.05) / (lo + 0.05)
    }
    const show = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`

    const pageBg = px(getComputedStyle(document.body).backgroundColor)
    // the nav bar is a ::before pseudo-element — invisible to a parent walk, so
    // resolve it from the token and composite it over the page ground
    const navBg = flat(
      px(getComputedStyle(document.documentElement).getPropertyValue('--nav-bar-bg')),
      pageBg
    )

    // effective background behind el: composite every painted layer up the tree
    const bgBehind = (el) => {
      const layers = []
      for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
        const c = px(getComputedStyle(n).backgroundColor)
        if (c.a > 0) {
          layers.push(c)
          if (c.a > 0.995) break
        }
      }
      let base = layers.length && layers[layers.length - 1].a > 0.995 ? layers.pop() : pageBg
      while (layers.length) base = flat(layers.pop(), base)
      return base
    }
    const cumOpacity = (el) => {
      let o = 1
      for (let n = el; n && n !== document.documentElement; n = n.parentElement)
        o *= parseFloat(getComputedStyle(n).opacity)
      return o
    }

    const out = []
    let audited = 0
    for (const el of document.querySelectorAll(SEL)) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const text = (el.textContent || '').trim()
      if (!text || r.width < 2 || r.height < 2 || cs.visibility === 'hidden') continue
      const o = cumOpacity(el)
      if (o < 0.5) continue // not currently shown (closed panel / mid-reveal)
      const inNav = !!el.closest('.nav')
      if (inNav && !document.body.classList.contains('nav-ink')) continue // over footage
      audited++
      const bg = inNav ? navBg : bgBehind(el)
      const raw = px(cs.color)
      const fg = flat({ ...raw, a: raw.a * o }, bg)
      const size = parseFloat(cs.fontSize)
      const weight = parseInt(cs.fontWeight, 10) || 400
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5
      const got = ratio(fg, bg)
      if (got + 0.005 < need) {
        out.push({
          sel: (el.className || el.tagName).toString().slice(0, 40),
          text: text.slice(0, 24),
          size: Math.round(size),
          got: +got.toFixed(2),
          need,
          fg: show(fg),
          bg: show(bg),
        })
      }
    }
    return { audited, failures: out }
  })
}

/* ── 1. LOAD: no console errors, no horizontal overflow ───────────────────── */
test('loads clean: no console errors, no horizontal scroll', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)
  const overflow = await horizontalOverflow(page)
  expect(overflow, `horizontal overflow at load: ${JSON.stringify(overflow)}`).toBeNull()
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 2. NAV anchors land on the right section, both languages ──────────────── */
test('nav anchors scroll to their section (BG + EN)', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)
  const targets = ['#work', '#catalogs', '#studio', '#contact']
  for (const lang of ['bg', 'en']) {
    if (lang === 'en') {
      await page.locator('.lang__btn[data-lang="en"]').click()
      await page.waitForTimeout(300)
    }
    for (const href of targets) {
      await openMobileNav(page)
      const link = page.locator(`.nav__links a[href="${href}"]`)
      await link.click()
      await waitAnchorSettled(page, href)
      const top = await page.locator(href).evaluate((el) => Math.round(el.getBoundingClientRect().top))
      expect(Math.abs(top - 75), `${href} landed at top=${top} (${lang})`).toBeLessThan(140)
    }
    // reveal the hide-on-scroll bar before reaching for the brand link
    await revealNav(page)
    await page.locator('.nav__brand').click()
    await page.waitForFunction(() => window.scrollY < 30, null, { timeout: 7000 }).catch(() => {})
    expect(await page.evaluate(() => window.scrollY), 'brand → top').toBeLessThan(60)
  }
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 3. LANGUAGE toggle swaps content both ways ───────────────────────────── */
test('BG ↔ EN toggle swaps nav + section titles', async ({ page }) => {
  await ready(page)
  const heroTitle = page.locator('.hero__title')
  const bg = await heroTitle.textContent()
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
  expect(await heroTitle.textContent()).not.toBe(bg)
  await page.locator('.lang__btn[data-lang="bg"]').click()
  await page.waitForTimeout(300)
  expect(await heroTitle.textContent()).toBe(bg)
})

/* ── 4. SELECTED PROJECTS: three featured scrubbed-video sections → pages ──
 * The card film strips + the detail overlay were retired 2026-09-16: each
 * project has its own page now, and the homepage shows THREE featured clips
 * (the distinctive scroll-scrub presentation the client asked to keep). */
test('selected projects: three featured video sections link to the portfolio', async ({ page }, info) => {
  const errors = collectErrors(page)
  await ready(page)

  // the renamed section
  await expect(page.locator('#work .projects__title')).toHaveText(ui.projects.title[0])
  expect(ui.projects.title[0]).toBe('Избрани проекти')
  expect(ui.projects.title[1]).toBe('Selected projects')

  const feats = page.locator('[data-featured]')
  await expect(feats).toHaveCount(featured.length)
  expect(featured.length, 'exactly three featured projects').toBe(3)
  const shape = await feats.evaluateAll((els) =>
    els.map((el) => ({
      id: el.dataset.id,
      video: !!el.querySelector('[data-ambient-video]'),
      poster: el.querySelector('.ambient__poster')?.getAttribute('src'),
      title: el.querySelector('.featured__title')?.textContent.trim(),
      link: el.querySelector('.featured__link')?.getAttribute('href'),
      hit: el.querySelector('.featured__hit')?.getAttribute('href'),
      dark: el.hasAttribute('data-dark'),
      lazy: el.querySelector('video')?.getAttribute('preload'),
    }))
  )
  shape.forEach((s, i) => {
    const f = featured[i]
    const p = projects.find((x) => x.id === f.project)
    expect(p, `featured slot ${f.id} names a configured project`).toBeTruthy()
    expect(s.id).toBe(f.id)
    expect(s.video, 'each is a video section').toBe(true)
    expect(s.poster).toMatch(new RegExp(`^/videos/${f.id}-poster`))
    expect(s.title, 'the project title is overlaid').toBe(p.titleBg)
    expect(s.link, 'links to the project page').toBe(`${portfolio.path}${p.id}/`)
    expect(s.hit, 'the whole section is clickable').toBe(s.link)
    expect(s.dark, 'nav goes over-media on it').toBe(true)
    // markup ships preload="none"; desktop-motion eager-loads SCRUB clips on
    // purpose (motion.js eagerLoad), everywhere else they stay lazy
    expect(s.lazy, 'clip is lazy unless the desktop scrub eager-loads it').toBe(
      info.project.name === 'desktop' ? 'auto' : 'none'
    )
  })
  // the old cards + overlay are gone for good
  expect(await page.locator('.project, .pdetail, [data-project], [data-strip], .gallery').count()).toBe(0)
  // "view all" → the portfolio page
  const more = page.locator('.projects__more-link')
  expect(await more.getAttribute('href')).toBe(portfolio.path)
  await expect(more).toHaveText(ui.projects.more[0])

  // desktop: each featured clip is pinned + scrubbed exactly like the ambients
  if (info.project.name === 'desktop') {
    expect(await page.locator('.pin-spacer [data-featured]').count(), 'featured clips pin').toBe(featured.length)
  } else {
    expect(await page.locator('.pin-spacer').count(), 'no pins off desktop-motion').toBe(0)
  }

  // bilingual
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  await expect(page.locator('#work .projects__title')).toHaveText(ui.projects.title[1])
  await expect(feats.first().locator('.featured__title')).toHaveText(
    projects.find((x) => x.id === featured[0].project).titleEn
  )
  await expect(more).toHaveText(ui.projects.more[1])
  await page.locator('.lang__btn[data-lang="bg"]').click()
  await page.waitForTimeout(300)

  // the featured link really goes to the project's page. Its caption reveals
  // when the section ENTERS — on desktop that is the pin point (section top at
  // the viewport top, like the ambient captions), so scroll it exactly there
  // and let the rise-in play before clicking
  await feats.first().evaluate((el) => {
    document.documentElement.style.scrollBehavior = 'auto'
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + 2)
  })
  await page.waitForTimeout(1800)
  await expect(feats.first().locator('.featured__link')).toBeVisible({ timeout: 5000 })
  await feats.first().locator('.featured__link').click()
  await page.waitForSelector('body.is-ready', { timeout: 15_000 })
  expect(new URL(page.url()).pathname).toBe(`${portfolio.path}${featured[0].project}/`)
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 4d. CONTRACT: config ↔ folders ↔ deploy ────────────────────────────────
 * The optimizer already fails the BUILD when config references missing files;
 * this is the same contract proven against the actual deploy: every asset the
 * manifest says a project has must be served, in every emitted size. */
test('every project asset in the manifest is deployed in all its sizes', async ({ request }) => {
  const VARIANTS = { gallery: [1600, 900], sketches: [3000, 1000], panoramas: [4096, 2048] }
  expect(projects.length, 'at least one project configured').toBeGreaterThan(0)
  for (const p of projects) {
    const m = pmanifest[p.id]
    expect(m, `"${p.id}" missing from src/projects.manifest.json — run npm run optimize:projects`).toBeTruthy()
    expect(m.gallery.length, `${p.id}: gallery/ is empty`).toBeGreaterThan(0)
    for (const room of p.panoramas || []) {
      expect(
        m.panoramas,
        `${p.id}: config labels panorama "${room.file}" but panoramas/${room.file}.* does not exist`
      ).toContain(room.file)
      expect(room.bg && room.en, `${p.id}: panorama "${room.file}" needs bg + en labels`).toBeTruthy()
    }
    for (const [type, widths] of Object.entries(VARIANTS)) {
      for (const n of m[type]) {
        for (const w of widths) {
          const url = `/projects/${p.id}/${type}/${n}-${w}.webp`
          const res = await request.get(url)
          expect(res.status(), `${url} missing — run npm run optimize:projects`).toBe(200)
          expect(res.headers()['content-type']).toContain('image/webp')
        }
      }
    }
  }
  // the portfolio strip's hand-picked frames must exist too
  for (const src of strips.portfolio) {
    expect((await request.get(src)).status(), `${src} (strips.portfolio) missing`).toBe(200)
  }
})

/* ── 5. CATALOGUES: 5 cards, all downloads internal (no old-site links) ────── */
test('catalogues grid renders, all downloads internal', async ({ page }) => {
  await ready(page)
  const cards = page.locator('.catcard')
  await expect(cards).toHaveCount(5)
  const hrefs = await cards.evaluateAll((els) => els.map((a) => a.getAttribute('href')))
  for (const h of hrefs) expect(h).toMatch(/^\/catalogs\/.+\.pdf$/)

  // This site now TAKES OVER semplodesign.com from the retired WordPress
  // install, so the guard is no longer "any link to that host" — the host is
  // ours. What must never appear is a link to a LEGACY PATH on it: those pages
  // are gone, their content was migrated into this single page, and a visitor
  // sent there would land on a 404 on the live site.
  const legacy = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')]
      .map((a) => a.href)
      .filter((h) => /semplodesign\.com\/(projects|about-us|catalogs|contact|shop|blog)/i.test(h))
  )
  expect(legacy, `links to retired WordPress paths:\n${legacy.join('\n')}`).toHaveLength(0)
})

/* ── 6. FULL SCROLL: no overflow at any step, nothing stuck hidden ─────────── */
test('full scroll: no horizontal overflow, nothing left hidden', async ({ page }, info) => {
  const errors = collectErrors(page)
  await ready(page)

  const worstOver = await page.evaluate(async () => {
    // html has `scroll-behavior: smooth`, so every scrollTo here ANIMATES.
    // At this step size (0.6vh) and dwell (220ms) the animation does keep up —
    // measured: it reaches the true bottom either way — so this opt-out is
    // robustness, not a fix. It makes the traversal exact and immune to the
    // trap a tighter loop falls into: with small steps and short dwells each
    // scrollTo retargets the in-flight animation and the page crawls, leaving
    // the sweep and the stuck-content check below auditing a page they never
    // covered. Keep it, and keep it in mind if these numbers are ever tuned.
    const prev = document.documentElement.style.scrollBehavior
    document.documentElement.style.scrollBehavior = 'auto'
    const vw = document.documentElement.clientWidth
    const step = Math.round(window.innerHeight * 0.6)
    const max = document.documentElement.scrollHeight
    let worst = 0
    for (let y = 0; y <= max; y += step) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 220))
      worst = Math.max(worst, document.documentElement.scrollWidth - vw)
    }
    window.scrollTo(0, max)
    await new Promise((r) => setTimeout(r, 400))
    document.documentElement.style.scrollBehavior = prev
    return worst
  })
  expect(worstOver, `worst horizontal overflow during scroll = ${worstOver}px`).toBeLessThanOrEqual(1)

  if (info.project.name === 'mobile') {
    fs.mkdirSync('e2e/screens', { recursive: true })
    for (const [name, frac] of [['top', 0], ['mid', 0.45], ['bottom', 1]]) {
      await page.evaluate((f) => window.scrollTo(0, document.documentElement.scrollHeight * f), frac)
      await page.waitForTimeout(500)
      await page.screenshot({ path: `e2e/screens/mobile-${name}.png` })
    }
  }

  // key content (excluding the hero copy, which fades out by design) must not be
  // stuck at opacity 0 after the whole page has scrolled past.
  const stuck = await page.evaluate(() => {
    const sel =
      '.interlude__title, .interlude__body, .projects__title, .cta__title, .cta__contacts,' +
      '.catcard, .foot, .studio__stat, .studio__media, .projects__more-link,' +
      '.reviews__title, .reviews__agg, .review, .review__text'
    const out = []
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0 && (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden')) {
        out.push((el.className || el.tagName).toString().slice(0, 50))
      }
    }
    return out
  })
  expect(stuck, `stuck-hidden: ${stuck.join(', ')}`).toHaveLength(0)
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 7. VIDEO sections behave per mode ────────────────────────────────────── */
test('hero + ambient video sections load and behave', async ({ page }, info) => {
  await ready(page)
  await expect(page.locator('[data-hero-video]')).toHaveCount(1)
  if (info.project.name === 'mobile' || info.project.name === 'reduced-motion') {
    // no scroll-jacking off desktop-motion: no pin-spacers
    expect(await page.locator('.pin-spacer').count()).toBe(0)
  }
  if (info.project.name === 'reduced-motion') {
    expect(
      await page.locator('.hero__title').evaluate((el) => parseFloat(getComputedStyle(el).opacity))
    ).toBeGreaterThan(0.5)
  }
  if (info.project.name === 'desktop') {
    expect(await page.locator('.pin-spacer').count(), 'desktop pins hero + 2 ambients').toBeGreaterThan(0)
  }
})

/* ── 8. MOBILE ergonomics: burger, lang reachable, footer stacks, targets ──── */
test('mobile: hamburger works, lang reachable, footer stacks', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile-only')
  await ready(page)

  // the language toggle is in the BAR and fully on-screen (the earlier bug)
  const en = page.locator('.lang__btn[data-lang="en"]')
  await expect(en).toBeVisible()
  const enBox = await en.boundingBox()
  expect(enBox.x + enBox.width, 'EN button within viewport').toBeLessThanOrEqual(page.viewportSize().width)

  // burger opens the links panel; a link is then clickable and closes it
  const burger = page.locator('[data-burger]')
  await expect(burger).toBeVisible()
  await burger.click()
  await page.waitForTimeout(350)
  await expect(page.locator('.nav__links a[href="#catalogs"]')).toBeVisible()
  await page.locator('.nav__links a[href="#catalogs"]').click()
  await page.waitForTimeout(400)
  expect(await page.evaluate(() => document.body.classList.contains('nav-open'))).toBe(false)

  // shop link stays external
  expect(await page.locator('.nav__ext').getAttribute('href')).toContain('semplohome.com')

  // footer columns stack vertically (each below the previous)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.waitForTimeout(400)
  const boxes = await page.locator('.foot__col').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
    })
  )
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i].top, `footer col ${i} stacked below col ${i - 1}`).toBeGreaterThanOrEqual(
      boxes[i - 1].bottom - 4
    )
  }
})

/* ── 9. THEME: switch flips the whole site, persists, honours the OS ───────── */
test('theme: toggle flips light ⇄ dark, persists, honours prefers-color-scheme', async ({
  page,
}, info) => {
  const errors = collectErrors(page)
  await ready(page)

  const themeOf = () => page.evaluate(() => document.documentElement.dataset.theme)
  // sample surfaces from every region the client asked to follow the theme
  const surfaces = () =>
    page.evaluate(() => {
      const bg = (sel) => {
        const el = document.querySelector(sel)
        return el ? getComputedStyle(el).backgroundColor : null
      }
      const lum = (c) => {
        const n = (String(c).match(/[-\d.]+/g) || [0, 0, 0]).map(Number)
        return Math.round(0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2])
      }
      return {
        body: bg('body'),
        bodyLum: lum(bg('body')),
        projects: bg('.projects'),
        catalogs: bg('.interlude.catalogs'),
        catcard: bg('.catcard'),
        foot: bg('.foot'),
        cta: bg('.cta'),
        navBar: getComputedStyle(document.documentElement).getPropertyValue('--nav-bar-bg').trim(),
        mapFilter: getComputedStyle(document.querySelector('.cta__map iframe')).filter,
        titleColor: getComputedStyle(document.querySelector('.interlude__title')).color,
      }
    })

  expect(await themeOf(), 'default under colorScheme:light is the light theme').toBe('light')
  const light = await surfaces()

  // exactly ONE glyph paints per theme (a `.themetog svg` display rule once
  // out-ranked the per-icon classes and showed the moon AND the sun at once)
  const litIcons = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-theme-toggle] svg')]
        .filter((s) => getComputedStyle(s).display !== 'none')
        .map((s) => s.getAttribute('class'))
    )

  const tog = page.locator('[data-theme-toggle]')
  await revealNav(page)
  await expect(tog).toBeVisible()
  expect(await litIcons(), 'light mode offers the moon, alone').toEqual(['themetog__moon'])
  expect(await tog.getAttribute('aria-pressed')).toBe('false')
  // the switch is labelled in Bulgarian while BG is active…
  expect(await tog.getAttribute('aria-label')).toBe('Тъмен режим')

  if (info.project.name === 'mobile') {
    const b = await tog.boundingBox()
    expect(b.x + b.width, 'theme switch within the 390px bar').toBeLessThanOrEqual(
      page.viewportSize().width
    )
    expect(b.width, 'tap target').toBeGreaterThanOrEqual(28)
  }

  await tog.click()
  await page.waitForTimeout(600)
  expect(await themeOf()).toBe('dark')
  expect(await tog.getAttribute('aria-pressed')).toBe('true')
  expect(await tog.getAttribute('aria-label')).toBe('Светъл режим')
  expect(await litIcons(), 'dark mode offers the sun, alone').toEqual(['themetog__sun'])
  const dark = await surfaces()

  // every themed region actually changed, and the ground really went dark
  for (const k of ['body', 'projects', 'catalogs', 'catcard', 'foot', 'cta', 'navBar',
    'mapFilter', 'titleColor']) {
    expect(dark[k], `${k} should differ between themes`).not.toBe(light[k])
  }
  expect(light.bodyLum, 'light ground is light').toBeGreaterThan(200)
  expect(dark.bodyLum, 'dark ground is near-black').toBeLessThan(40)

  // …and in English after a language switch
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  expect(await tog.getAttribute('aria-label')).toBe('Light mode')

  // the choice survives a reload
  await page.reload()
  await page.waitForSelector('body.is-ready', { timeout: 15_000 })
  expect(await themeOf(), 'stored choice reapplied before paint').toBe('dark')
  expect(await page.evaluate(() => localStorage.getItem('semplo:theme'))).toBe('dark')

  // with NO stored choice, the OS preference decides on first visit
  for (const scheme of ['dark', 'light']) {
    await page.evaluate(() => localStorage.removeItem('semplo:theme'))
    await page.emulateMedia({ colorScheme: scheme })
    await page.reload()
    await page.waitForSelector('body.is-ready', { timeout: 15_000 })
    expect(await themeOf(), `first visit follows prefers-color-scheme: ${scheme}`).toBe(scheme)
  }
  await page.emulateMedia({ colorScheme: 'light' })

  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 10. CONTRAST: WCAG AA on themed surfaces, in BOTH themes ─────────────── */
test('contrast: all section + nav text passes AA in light AND dark', async ({ page }) => {
  await fakeTurnstile(page) // the dialog is audited open; keep it off the network
  await ready(page)
  await scrollWholePage(page)
  await page.evaluate(() => document.body.classList.remove('nav-hidden'))
  await page.waitForTimeout(300)

  // the enquiry form only exists as painted pixels while it is open, and its
  // labels/hints are the smallest type on the site — audit it in both themes too.
  // The error panel is forced visible so its copy is measured as well.
  await page.locator('[data-form-open]').click()
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    document.querySelector('[data-form-err]').hidden = false
  })
  await page.waitForTimeout(200)

  // the click that opened the dialog left the pointer over the CTA button, so
  // it sits in :hover with its own 0.4s background/colour transition — park the
  // mouse first, and give a theme flip clearly more than that to settle
  await page.mouse.move(2, 2)
  await page.waitForTimeout(500)
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t
    }, theme)
    await page.waitForTimeout(900) // let every colour transition land
    const { audited, failures } = await contrastFailures(page)
    // guard against a vacuous pass: if the reveals had not fired, everything
    // would be skipped as "not shown" and the audit would trivially succeed
    expect(audited, `${theme}: only ${audited} elements audited — audit is not covering the page`)
      .toBeGreaterThan(24)
    const detail = failures
      .map((f) => `  ${f.sel} "${f.text}" ${f.size}px → ${f.got}:1 (need ${f.need}) ${f.fg} on ${f.bg}`)
      .join('\n')
    expect(
      failures,
      `${theme} theme — ${failures.length}/${audited} AA failure(s):\n${detail}`
    ).toHaveLength(0)
  }
})

/* ── 12. WORDMARK: "SEMPLO DESIGN" everywhere, and it still fits the bar ──── */
test('wordmark reads "SEMPLO DESIGN" everywhere and fits the nav', async ({ page }, info) => {
  await ready(page)

  await expect(page.locator('.nav__logo')).toHaveText(WORDMARK)
  await expect(page.locator('.foot__brand')).toHaveText(WORDMARK)
  await expect(page.locator('.loader__mark')).toHaveText(WORDMARK)
  expect(await page.title()).toContain(WORDMARK)

  // meta / OG / JSON-LD all carry the new name, and none still says bare "Semplo"
  const meta = await page.evaluate(() => ({
    desc: document.querySelector('meta[name="description"]')?.content || '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.content || '',
    ogSite: document.querySelector('meta[property="og:site_name"]')?.content || '',
    rights: document.querySelector('[data-i18n="foot.rights"]')?.textContent || '',
  }))
  for (const [k, v] of Object.entries(meta)) expect(v, `${k} carries the wordmark`).toContain(WORDMARK)

  const ld = await page.evaluate(() => JSON.parse(document.querySelector('[data-ld-business]').textContent))
  expect(ld.name).toBe(WORDMARK)

  // "Semplo" must never appear WITHOUT "Design" following it in visible chrome
  // (any casing — catches a stale "Semplo Concept" as well as a bare "Semplo")
  const bare = await page.evaluate(() =>
    ['.nav__logo', '.foot__brand', '.loader__mark', '[data-i18n="foot.rights"]']
      .map((s) => document.querySelector(s)?.textContent || '')
      .filter((t) => /semplo(?!\s*design)/i.test(t))
  )
  expect(bare, `bare "Semplo" left in: ${bare.join(' | ')}`).toHaveLength(0)

  // …in English too
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  await expect(page.locator('.nav__logo')).toHaveText(WORDMARK)
  await expect(page.locator('.foot__brand')).toHaveText(WORDMARK)

  if (info.project.name === 'mobile') {
    // the longer mark must not crowd the language toggle at 390px
    await revealNav(page)
    const logo = await page.locator('.nav__logo').boundingBox()
    const langBox = await page.locator('.lang').boundingBox()
    const burger = await page.locator('[data-burger]').boundingBox()
    expect(logo.x, 'wordmark starts inside the bar').toBeGreaterThanOrEqual(0)
    expect(logo.x + logo.width, `wordmark right=${Math.round(logo.x + logo.width)} vs lang left=${Math.round(langBox.x)}`)
      .toBeLessThan(langBox.x - 8)
    expect(burger.x + burger.width, 'burger still inside the viewport').toBeLessThanOrEqual(
      page.viewportSize().width
    )
    // and it is not wrapped onto two lines
    const lines = await page.locator('.nav__logo').evaluate((el) => el.getClientRects().length)
    expect(lines, 'wordmark stays on one line').toBe(1)
  }
})

/* ── 12b. FOOTER CREDIT: quiet, bilingual, safe external link ──────────────── */
test('footer credit links webservices.agency, bilingual and understated', async ({ page }) => {
  await ready(page)
  const credit = page.locator('.foot__credit')
  await expect(credit).toHaveCount(1)
  expect(await credit.getAttribute('href')).toBe('https://webservices.agency')
  expect(await credit.getAttribute('target')).toBe('_blank')
  expect(await credit.getAttribute('rel')).toContain('noopener')
  await expect(credit).toHaveText(ui.foot.credit[0])

  // understated: strictly smaller type than the rights line beside it
  const sizes = await page.evaluate(() => ({
    credit: parseFloat(getComputedStyle(document.querySelector('.foot__credit')).fontSize),
    rights: parseFloat(getComputedStyle(document.querySelector('[data-i18n="foot.rights"]')).fontSize),
  }))
  expect(sizes.credit, 'credit is quieter than the rights line').toBeLessThan(sizes.rights)

  // bilingual via the same i18n mechanism as the rest of the footer
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  await expect(credit).toHaveText(ui.foot.credit[1])
})

/* ── 13. PHONE: the new number everywhere, the old one nowhere ─────────────── */
test('phone is +359 894 880 088 in every surface', async ({ page }) => {
  await ready(page)

  const tels = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="tel:"]')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent.trim(),
    }))
  )
  expect(tels.length, 'contact + footer both link the phone').toBeGreaterThanOrEqual(2)
  for (const t of tels) {
    expect(t.href).toBe(TEL)
    expect(t.text).toBe(PHONE)
  }

  const ld = await page.evaluate(() => JSON.parse(document.querySelector('[data-ld-business]').textContent))
  expect(ld.telephone).toBe(PHONE)

  // no trace of the previous number anywhere in the rendered page or its schema
  const stale = await page.evaluate(() => {
    const hay = document.documentElement.outerHTML
    return ['889747773', '889 747 773', '877600018', '877 600 018'].filter((n) => hay.includes(n))
  })
  expect(stale, `old phone number still present: ${stale.join(', ')}`).toHaveLength(0)
})

/* ── 14. HERO credibility line names сухо строителство ────────────────────── */
test('hero credibility line says "Сухо строителство" (and its EN equivalent)', async ({ page }) => {
  await ready(page)
  const cred = page.locator('.hero__cred')
  await expect(cred).toContainText('Сухо строителство')
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  await expect(cred).toContainText(/Drywall/i)
})

/* ── 15. MAP: the real Google Business listing, not an address point ───────── */
test('map band embeds the SEMPLO business listing + links to it', async ({ page }) => {
  await ready(page)
  const frame = page.locator('.cta__map iframe')
  await expect(frame).toHaveCount(1)
  const src = await frame.getAttribute('src')
  // cid= addresses the LISTING (business pin); a q=<address> embed would only
  // drop an address marker, which is what the client asked us to move away from
  expect(src, `embed src = ${src}`).toContain(`cid=${business.map.cid}`)
  expect(src).toContain('output=embed')
  expect(src, 'no leftover address-query embed').not.toMatch(/[?&]q=/)

  // the band is still full-bleed and still theme-muted
  const band = await page.evaluate(() => {
    const el = document.querySelector('.cta__map')
    const r = el.getBoundingClientRect()
    return {
      width: Math.round(r.width),
      vw: document.documentElement.clientWidth,
      filter: getComputedStyle(el.querySelector('iframe')).filter,
    }
  })
  expect(Math.abs(band.width - band.vw), 'map band runs edge to edge').toBeLessThanOrEqual(2)
  expect(band.filter, 'muted to the palette').toContain('grayscale')

  // the source link points at their share link and opens safely
  const link = page.locator('.cta__maplink')
  expect(await link.getAttribute('href')).toBe(business.map.link)
  expect(await link.getAttribute('target')).toBe('_blank')
  expect(await link.getAttribute('rel')).toContain('noopener')
})

/* ── 16. REVIEWS: section, cards, aggregate, placement, schema ────────────── */
test('reviews section renders from config, bilingual, and links to Google', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)

  const section = page.locator('#reviews')
  await expect(section).toHaveCount(1)

  // sits immediately before the contact section — social proof next to the ask
  const order = await page.evaluate(() => {
    const r = document.getElementById('reviews')
    const c = document.getElementById('contact')
    return {
      reviewsBeforeContact: !!(r.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING),
      afterProjects: !!(document.getElementById('work').compareDocumentPosition(r) &
        Node.DOCUMENT_POSITION_FOLLOWING),
    }
  })
  expect(order.reviewsBeforeContact, 'reviews come before #contact').toBe(true)
  expect(order.afterProjects, 'and after the projects gallery').toBe(true)

  // one card per config entry, each with a 5-star row and an author
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(700)
  const cards = page.locator('.review')
  await expect(cards).toHaveCount(reviews.items.length)
  const shape = await cards.evaluateAll((els) =>
    els.map((el) => ({
      stars: el.querySelectorAll('.stars i').length,
      lit: el.querySelectorAll('.stars i:not([data-off])').length,
      text: (el.querySelector('.review__text')?.textContent || '').trim().length,
      author: (el.querySelector('.review__author')?.textContent || '').trim(),
      date: (el.querySelector('.review__date')?.textContent || '').trim(),
      label: el.querySelector('.stars')?.getAttribute('aria-label') || '',
      todo: el.classList.contains('is-todo'),
    }))
  )
  shape.forEach((s, i) => {
    expect(s.stars, `card ${i} draws 5 stars`).toBe(5)
    expect(s.lit, `card ${i} lights its rating`).toBe(reviews.items[i].rating)
    expect(s.text, `card ${i} has review text`).toBeGreaterThan(20)
    expect(s.author, `card ${i} has an author`).toBe(reviews.items[i].author)
    expect(s.date, `card ${i} shows a localised date`).toMatch(/\d{4}/)
    expect(s.label, `card ${i} star row is labelled for screen readers`).toContain('5')
    expect(s.todo, `card ${i} placeholder state matches config`).toBe(!!reviews.items[i].todo)
  })
  // placeholders are visibly badged so they can't be mistaken for real reviews
  expect(await page.locator('.review__todo').count()).toBe(
    reviews.items.filter((r) => r.todo).length
  )

  // aggregate line + Google listing link
  await expect(page.locator('[data-reviews-stars] i')).toHaveCount(5)
  await expect(page.locator('[data-reviews-aggtext]')).toContainText(String(reviews.count))
  await expect(page.locator('[data-reviews-aggtext]')).toContainText('Google')
  const gl = page.locator('[data-reviews-link]')
  expect(await gl.getAttribute('href')).toBe(reviews.url)
  expect(await gl.getAttribute('target')).toBe('_blank')

  // language toggle swaps quote text, date and the aggregate line
  const before = await page.evaluate(() => ({
    quote: document.querySelector('.review__text').textContent.trim(),
    date: document.querySelector('.review__date').textContent.trim(),
    agg: document.querySelector('[data-reviews-aggtext]').textContent.trim(),
  }))
  await revealNav(page) // we scrolled down — the bar is tucked away
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(350)
  const after = await page.evaluate(() => ({
    quote: document.querySelector('.review__text').textContent.trim(),
    date: document.querySelector('.review__date').textContent.trim(),
    agg: document.querySelector('[data-reviews-aggtext]').textContent.trim(),
  }))
  expect(after.quote, 'quote translated').not.toBe(before.quote)
  expect(after.date, 'date localised').not.toBe(before.date)
  expect(after.agg, 'aggregate line translated').not.toBe(before.agg)
  await expect(page.locator('.reviews__title')).toHaveText(/What our clients say/i)

  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 17. REVIEW SCHEMA: tied to the LocalBusiness, placeholder-gated ───────── */
test('review schema hangs off the LocalBusiness entity', async ({ page }) => {
  await ready(page)
  const ld = await page.evaluate(() => JSON.parse(document.querySelector('[data-ld-business]').textContent))

  expect(ld['@type']).toBe('HomeAndConstructionBusiness')
  // absolute on the canonical domain, so the same entity is identified however
  // the page is reached (live domain, www before the 301, local preview)
  expect(ld['@id'], 'one stable entity id the reviews attach to').toBe(`${SITE}#business`)
  expect(ld.geo).toMatchObject({ latitude: business.geo.lat, longitude: business.geo.lng })
  expect(ld.hasMap).toBe(business.map.link)

  const real = publishable(reviews)
  if (real.length === 0) {
    // every entry is still a TODO placeholder → publishing invented reviews as
    // structured data is a spam-policy risk, so nothing rating-shaped is emitted
    expect(ld.review, 'no review schema while all entries are placeholders').toBeUndefined()
    expect(ld.aggregateRating, 'and no aggregate either').toBeUndefined()
  } else {
    expect(ld.review.length).toBe(real.length)
    expect(ld.aggregateRating).toMatchObject({ '@type': 'AggregateRating', bestRating: '5' })
  }

  // and prove the builder produces valid, attached schema once real reviews land
  const filled = {
    ...reviews,
    rating: 4.9,
    count: 31,
    items: reviews.items.map(({ todo, ...r }) => r),
  }
  const withReviews = businessLd(business, filled, 'bg')
  expect(withReviews['@id'], 'reviews attach to the same entity').toBe(`${SITE}#business`)
  expect(withReviews.aggregateRating).toEqual({
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    reviewCount: '31',
    bestRating: '5',
    worstRating: '1',
  })
  expect(withReviews.review).toHaveLength(reviews.items.length)
  for (const r of withReviews.review) {
    expect(r['@type']).toBe('Review')
    expect(r.author['@type']).toBe('Person')
    expect(r.author.name).toBeTruthy()
    expect(r.reviewRating).toMatchObject({ '@type': 'Rating', bestRating: '5' })
    expect(r.reviewBody.length).toBeGreaterThan(20)
    expect(r.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(r.url).toBe(reviews.url)
  }
  // one placeholder left in → it alone is dropped, the real ones still publish
  const mixed = businessLd(business, {
    ...filled,
    items: [{ ...filled.items[0], todo: true }, ...filled.items.slice(1)],
  })
  expect(mixed.review).toHaveLength(filled.items.length - 1)
})

/* ── 18. CONTACT FORM: opens, validates, submits, closes ──────────────────── */
test('enquiry form: email wiring, validation, AJAX success + error', async ({ page }) => {
  const errors = collectErrors(page)
  await fakeTurnstile(page)
  // watch every request to Cloudflare so we can prove the CAPTCHA is lazy
  const capReqs = []
  page.on('request', (r) => {
    if (r.url().includes('challenges.cloudflare.com')) capReqs.push(r.url())
  })
  await ready(page)

  // LAZY LOAD: not one byte of third-party CAPTCHA for a visitor who never
  // opens the form — the script is fetched only when the dialog opens.
  expect(capReqs, `CAPTCHA requested on page load:\n${capReqs.join('\n')}`).toHaveLength(0)

  const modal = page.locator('[data-form-modal]')
  const opener = page.locator('[data-form-open]')

  // the CTA is a real button now, not a mailto: dead end
  await expect(opener).toHaveCount(1)
  expect(await opener.evaluate((el) => el.tagName)).toBe('BUTTON')
  // (the email address in .cta__contacts stays a mailto — it's the BUTTON that
  // must no longer be one)
  expect(await page.locator('a.cta__btn').count(), 'the CTA is no longer a mailto link').toBe(0)
  await expect(modal).toBeHidden()

  /* ── wiring contract: the form posts to the verifying + emailing endpoint
        (api/enquiry.js, the Vercel function), carries the honeypot, and has
        NO hosted-form registration — the hosted form service we once relied
        on silently dropped submissions past 100/month, so nothing may ever
        re-register the form with a third-party form service (the legacy
        data-netlify / netlify-honeypot attributes are exactly that) ── */
  const wiring = await page.evaluate(() => {
    const f = document.querySelector('[data-form]')
    return {
      name: f.getAttribute('name'),
      method: (f.getAttribute('method') || '').toUpperCase(),
      dataNetlify: f.getAttribute('data-netlify'),
      honeypotAttr: f.getAttribute('netlify-honeypot'),
      formName: f.querySelector('input[name="form-name"]'),
      hasPot: !!f.querySelector('input[name="bot-field"]'),
      potVisible: (() => {
        const el = f.querySelector('input[name="bot-field"]')
        const r = el.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })(),
      potTabbable: f.querySelector('input[name="bot-field"]').tabIndex >= 0,
      action: f.getAttribute('action'),
      fields: [...f.elements]
        .filter((e) => e.name && !['bot-field', 'cf-turnstile-response'].includes(e.name))
        .map((e) => e.name),
    }
  })
  expect(wiring.name).toBe('contact')
  expect(wiring.method).toBe('POST')
  // posts to the endpoint that verifies Turnstile and emails the studio
  expect(wiring.action, 'form posts to the verifying + emailing endpoint').toBe(captcha.endpoint)
  expect(wiring.dataNetlify, 'no hosted-form registration (data-netlify)').toBeNull()
  expect(wiring.honeypotAttr, 'no netlify-honeypot attribute either').toBeNull()
  expect(wiring.formName, 'no hidden form-name — nothing for a form service to store').toBeNull()
  expect(wiring.hasPot, 'the honeypot itself stays — the endpoint checks it').toBe(true)
  expect(wiring.potVisible, 'honeypot must be invisible to humans').toBe(false)
  expect(wiring.potTabbable, 'honeypot must be out of the tab order').toBe(false)
  // the qualifying fields a studio actually needs
  expect(wiring.fields).toEqual([
    'name', 'email', 'phone', 'size-m2', 'project-type', 'project-stage', 'timeline',
    'budget', 'message',
  ])

  /* ── opens on the button, focus lands in the form ── */
  await openEnquiry(page)
  await expect(modal).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.id), 'focus moves into the form').toBe('cf-name')
  expect(await page.evaluate(() => document.body.classList.contains('is-locked'))).toBe(true)
  expect(await modal.getAttribute('aria-modal')).toBe('true')
  expect(await modal.getAttribute('role')).toBe('dialog')

  // …and NOW the CAPTCHA loads, on open, and mounts a real widget
  await waitCaptcha(page)
  expect(
    capReqs.some((u) => u.includes('/turnstile/v0/api.js')),
    'CAPTCHA script fetched when the dialog opened'
  ).toBe(true)
  // Asserted via the response input and data-rendered, NOT by counting iframes:
  // Cloudflare's dummy sitekeys (which is what ships until the real one is
  // pasted in) hand back a token WITHOUT drawing a widget, so an iframe count
  // would be 0 here and 1 in production. The response input and the render
  // record exist under both.
  expect(
    await page.locator('[data-turnstile] input[name="cf-turnstile-response"]').count(),
    'exactly one Turnstile response field is mounted in the form'
  ).toBe(1)
  expect(
    await page.locator('[data-turnstile]').getAttribute('data-rendered'),
    'widget built for the active theme and language'
  ).toBe('light|bg')
  // A real sitekey is configured, so the "not protected" badge must be gone.
  // (If someone reverts to a dummy key it has to come back — asserted both ways
  // so neither state can regress silently.)
  if (USING_TEST_KEY) {
    await expect(page.locator('[data-captcha-test]')).toBeVisible()
  } else {
    await expect(page.locator('[data-captcha-test]')).toBeHidden()
  }

  // no horizontal overflow with the dialog open (checked at every viewport)
  expect(await horizontalOverflow(page), 'dialog opened a horizontal scrollbar').toBeNull()

  /* ── native validation blocks an empty submit ──
     Scope the interception to OUR origin: the Google Maps iframe in this very
     section fires its own POSTs (telemetry/batch), and a catch-all route counts
     those as form submissions. */
  const origin = new URL(page.url()).origin
  const ours = (url) => url.origin === origin
  const ourPost = (req) => req.method() === 'POST' && ours(new URL(req.url()))
  let posts = 0
  await page.route(ours, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    posts++
    return route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' })
  })
  await page.locator('[data-form-submit]').click()
  await page.waitForTimeout(400)
  expect(posts, 'empty form must not POST').toBe(0)
  await expect(modal).toBeVisible()
  expect(
    await page.evaluate(() => document.querySelector('#cf-name').matches(':invalid')),
    'required field reports invalid'
  ).toBe(true)
  expect(
    await page.evaluate(() => document.querySelector('[data-form]').classList.contains('was-submitted')),
    'invalid styling armed after a submit attempt'
  ).toBe(true)

  /* ── ESC closes and hands focus back to the opener ── */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(modal).toBeHidden()
  expect(await page.evaluate(() => document.body.classList.contains('is-locked'))).toBe(false)
  expect(
    await page.evaluate(() => document.activeElement?.hasAttribute('data-form-open')),
    'focus returned to the opener'
  ).toBe(true)

  /* ── backdrop click closes too ── */
  await opener.click()
  await expect(modal).toBeVisible()
  await page.waitForTimeout(400)
  await page.locator('[data-form-backdrop]').click({ position: { x: 4, y: 4 } })
  await page.waitForTimeout(600)
  await expect(modal).toBeHidden()

  /* ── fill + submit → AJAX success panel, page never navigates ── */
  const url0 = page.url()
  await opener.click()
  await page.waitForTimeout(400)
  await page.fill('#cf-name', 'Иван Тестов')
  await page.fill('#cf-email', 'ivan@example.com')
  await page.fill('#cf-phone', '+359 888 123 456')
  await page.fill('#cf-size', '95')
  await page.selectOption('#cf-type', 'Апартамент')
  await page.selectOption('#cf-stage', 'Идея')
  await page.selectOption('#cf-when', '1–3 месеца')
  await page.fill('#cf-msg', 'Търсим цялостен проект за двустаен апартамент.')

  /* ── no CAPTCHA token → the client refuses to POST at all ──
     A filled, natively-valid form still must not go anywhere without a token.
     Stubbing getResponse() exercises the real gate rather than racing the
     widget. (The binding enforcement is server-side in the function; this is
     the courtesy message so the visitor isn't left guessing.) */
  await waitCaptcha(page)
  await page.evaluate(() => {
    window.__realGetResponse = window.turnstile.getResponse
    window.turnstile.getResponse = () => ''
  })
  await page.locator('[data-form-submit]').click()
  await page.waitForTimeout(500)
  expect(posts, 'no CAPTCHA token → must not POST').toBe(0)
  await expect(page.locator('[data-form-err]')).toBeVisible()
  await expect(page.locator('[data-form-done]')).toBeHidden()
  // the message is the CAPTCHA one, not the generic failure…
  await expect(page.locator('[data-form-err-title]')).toHaveText(ui.form.captchaPendingTitle[0])
  // …and "still verifying" offers no mailto escape hatch — it is not a failure
  await expect(page.locator('[data-form-err-mail]')).toBeHidden()
  // the key (not just the text) is swapped, which is what keeps the message
  // correct if the visitor switches language while it is on screen
  expect(await page.locator('[data-form-err-title]').getAttribute('data-i18n')).toBe(
    'form.captchaPendingTitle'
  )
  await page.evaluate(() => {
    window.turnstile.getResponse = window.__realGetResponse
  })

  /* ── with a token, it submits ── */
  await waitCaptcha(page)
  const post = page.waitForRequest(ourPost)
  await page.locator('[data-form-submit]').click()
  const req = await post
  // the payload the function turns into the enquiry email: url-encoded, all
  // fields present, honeypot empty. Parse it rather than string-matching —
  // `+` is an encoded space here, which decodeURIComponent would leave as a
  // literal plus.
  expect(req.headers()['content-type']).toContain('application/x-www-form-urlencoded')
  const sent = new URLSearchParams(req.postData() || '')
  expect(sent.get('name')).toBe('Иван Тестов')
  expect(sent.get('email')).toBe('ivan@example.com')
  expect(sent.get('phone')).toBe('+359 888 123 456')
  expect(sent.get('size-m2')).toBe('95')
  // the qualifiers arrive in Bulgarian whatever the UI language was
  expect(sent.get('project-type')).toBe('Апартамент')
  expect(sent.get('project-stage')).toBe('Идея')
  expect(sent.get('timeline')).toBe('1–3 месеца')
  expect(sent.get('message')).toContain('двустаен апартамент')
  expect(sent.get('bot-field'), 'honeypot posts empty for a human').toBe('')
  // the token rides along in the body — the function verifies it before storing
  expect(sent.get('cf-turnstile-response'), 'CAPTCHA token is in the payload').toBeTruthy()

  await expect(page.locator('[data-form-done]')).toBeVisible()
  await expect(page.locator('[data-form-body]')).toBeHidden()
  expect(page.url(), 'AJAX submit — no navigation').toBe(url0)
  await page.locator('[data-form-done] [data-form-close]').click()
  await page.waitForTimeout(600)
  await expect(modal).toBeHidden()

  /* ── the ENDPOINT rejecting the token (403) gets the CAPTCHA message ──
     This is the real-world case: the token was spent, expired, or forged, so
     api/enquiry.js answers 403 { error: 'captcha' }. It must not read as a
     generic "something went wrong". */
  await page.unrouteAll()
  await page.route(ours, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'captcha', reason: ['timeout-or-duplicate'] }),
    })
  })
  await opener.click()
  await page.waitForTimeout(400)
  // reopening returns to the form, not the success panel
  await expect(page.locator('[data-form-body]')).toBeVisible()
  await expect(page.locator('[data-form-done]')).toBeHidden()
  await page.fill('#cf-name', 'Втори опит')
  await page.fill('#cf-email', 'two@example.com')
  await page.fill('#cf-phone', '+359 888 000 000')
  await page.selectOption('#cf-type', 'Офис')
  await page.selectOption('#cf-stage', 'Идея')
  await waitCaptcha(page)
  await page.locator('[data-form-submit]').click()
  await expect(page.locator('[data-form-err]')).toBeVisible()
  await expect(page.locator('[data-form-err-title]')).toHaveText(ui.form.captchaFailedTitle[0])
  expect(await page.locator('[data-form-err-title]').getAttribute('data-i18n')).toBe(
    'form.captchaFailedTitle'
  )
  // a rejected attempt still offers the direct-email fallback
  await expect(page.locator('[data-form-err-mail]')).toBeVisible()
  await expect(page.locator('[data-form-done]')).toBeHidden()

  /* ── any OTHER failure keeps the generic message and the answers ── */
  await page.unrouteAll()
  await page.route(ours, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    return route.fulfill({ status: 500, contentType: 'text/html', body: 'nope' })
  })
  // the token was consumed by the rejected attempt, so the widget was reset —
  // wait for the replacement before retrying
  await waitCaptcha(page)
  await page.locator('[data-form-submit]').click()
  await expect(page.locator('[data-form-err-title]')).toHaveText(ui.form.errTitle[0])
  await expect(page.locator('[data-form-done]')).toBeHidden()
  expect(await page.inputValue('#cf-name'), 'answers survive a failure').toBe('Втори опит')
  expect(
    await page.locator('[data-form-submit]').isEnabled(),
    'submit is re-enabled so it can be retried'
  ).toBe(true)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  // the 403 and 500 above are ours on purpose — Chrome logs every failed request
  // as a console error, so exclude those and require silence otherwise
  const unexpected = errors.filter((e) => !/status of (403|500)/.test(e))
  expect(unexpected, unexpected.join('\n')).toHaveLength(0)
})

/* ── 20. CANONICAL DOMAIN: one base URL, mirrored everywhere, no drift ──────
 * The domain lives in `business.url` but four static files have to repeat it
 * (they cannot import config). This test IS that contract: it compares every
 * copy against the config value, so a change made in one place and forgotten in
 * another fails here instead of shipping. It also fetches each URL it finds —
 * with the canonical origin rewritten to the local preview — so a listed file
 * that isn't actually in the deploy is caught too. */
test('canonical domain is applied consistently and every listed URL exists', async ({
  page,
  request,
}) => {
  await ready(page)
  // canonical origin → the local preview, so listed URLs can actually be fetched
  const local = (u) => u.replace(SITE_ORIGIN, new URL(page.url()).origin)

  /* ── <head>: canonical + Open Graph ── */
  const head = await page.evaluate(() => {
    const meta = (p) => document.querySelector(`meta[property="${p}"]`)?.content ?? null
    return {
      // getAttribute, not .href: .href would resolve a relative value and hide
      // exactly the bug this asserts against
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null,
      canonicalCount: document.querySelectorAll('link[rel="canonical"]').length,
      ogUrl: meta('og:url'),
      ogImage: meta('og:image'),
      ogType: meta('og:image:type'),
      ogW: meta('og:image:width'),
      ogH: meta('og:image:height'),
      ogAlt: meta('og:image:alt'),
    }
  })
  expect(head.canonicalCount, 'exactly one canonical').toBe(1)
  expect(head.canonical, 'canonical matches business.url').toBe(SITE)
  expect(head.ogUrl, 'og:url matches business.url').toBe(SITE)
  // an off-site scraper cannot resolve a root-relative image path
  expect(head.ogImage, 'og:image is absolute on the canonical origin').toBe(
    `${SITE}${business.ogImage.path}`
  )
  expect(head.ogAlt, 'og:image:alt is set').toBeTruthy()
  expect(head.ogType).toBe(business.ogImage.type)
  expect(head.ogW).toBe(String(business.ogImage.width))
  expect(head.ogH).toBe(String(business.ogImage.height))

  /* ── the social card is a REAL 1200×630 JPEG that is actually deployed ──
     Not just "the tag is right": the whole point of this asset is that Facebook
     and LinkedIn refuse WebP, so the bytes on the wire have to be JPEG at the
     1.91:1 the networks crop large cards to. Probing the fetched image also
     ties the declared og:image:width/height to reality. */
  const card = await request.get(local(head.ogImage))
  expect(card.status(), 'og:image is in the deploy').toBe(200)
  expect(card.headers()['content-type'], 'served as JPEG').toContain('image/jpeg')
  const cardMeta = await sharp(await card.body()).metadata()
  expect(cardMeta.format, 'the bytes really are JPEG, not WebP with a .jpg name').toBe('jpeg')
  expect(
    { width: cardMeta.width, height: cardMeta.height },
    'social cards want 1200×630 (1.91:1)'
  ).toEqual({ width: business.ogImage.width, height: business.ogImage.height })
  expect(+(cardMeta.width / cardMeta.height).toFixed(2), 'aspect 1.91:1').toBe(1.9)
  // Facebook rejects images over 8 MB; anything near that is a mistake here
  const cardBytes = (await card.body()).length
  expect(cardBytes, `card is ${(cardBytes / 1024).toFixed(0)} KB`).toBeLessThan(1_000_000)

  /* ── JSON-LD, both the runtime build and the static no-JS fallback ── */
  const ld = await page.evaluate(() =>
    JSON.parse(document.querySelector('[data-ld-business]').textContent)
  )
  expect(ld.url, 'JSON-LD url').toBe(SITE)
  expect(ld['@id'], 'JSON-LD @id is absolute on the canonical domain').toBe(`${SITE}#business`)
  // structured-data image: same JPEG card — Google's supported formats for
  // structured-data images are jpg/png/gif, not WebP
  expect(ld.image, 'JSON-LD image is the JPEG card').toBe(`${SITE}${business.ogImage.path}`)
  // the canonical domain belongs in `url`; sameAs is for OTHER profiles
  expect(ld.sameAs.some((s) => s.includes('semplodesign.com')), 'own domain not in sameAs').toBe(false)

  // the raw served HTML (what a crawler that runs no JS sees) must agree
  const rawHtml = await (await request.get('/')).text()
  const fallback = JSON.parse(
    rawHtml.match(/<script type="application\/ld\+json" data-ld-business>([\s\S]*?)<\/script>/)[1]
  )
  expect(fallback['@id'], 'no-JS fallback @id').toBe(`${SITE}#business`)
  expect(fallback.url, 'no-JS fallback url').toBe(SITE)
  expect(fallback.image, 'no-JS fallback image').toBe(`${SITE}${business.ogImage.path}`)
  expect(rawHtml, 'og:image is in the served HTML, not injected').toContain(
    `content="${SITE}${business.ogImage.path}"`
  )
  expect(rawHtml, 'canonical is in the served HTML, not injected').toContain(
    `<link rel="canonical" href="${SITE}"`
  )

  /* ── robots.txt ── */
  const robotsRes = await request.get('/robots.txt')
  expect(robotsRes.status(), 'robots.txt is deployed').toBe(200)
  const robots = await robotsRes.text()
  expect(robots).toMatch(/^User-agent:\s*\*/m)
  expect(robots).toMatch(/^Allow:\s*\/$/m)
  expect(robots, 'nothing is blanket-disallowed').not.toMatch(/^Disallow:\s*\/\s*$/m)
  expect(robots, 'Sitemap: line points at the canonical sitemap').toMatch(
    new RegExp(`^Sitemap:\\s*${SITE_ORIGIN}/sitemap\\.xml$`, 'm')
  )

  /* ── sitemap.xml ── */
  const smRes = await request.get('/sitemap.xml')
  expect(smRes.status(), 'sitemap.xml is deployed').toBe(200)
  const sm = await smRes.text()
  expect(sm).toContain('http://www.sitemaps.org/schemas/sitemap/0.9')
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())

  for (const loc of locs) {
    expect(loc.startsWith(`${SITE_ORIGIN}/`), `<loc> off the canonical origin: ${loc}`).toBe(true)
    expect(loc, 'https only').not.toMatch(/^http:/)
  }
  expect(locs, 'the homepage is listed').toContain(SITE)
  // every catalogue PDF is listed — add a catalogue without updating the
  // sitemap and this fails, which is the point of deriving it from config
  for (const c of catalogs) {
    expect(locs, `catalogue ${c.id} is missing from the sitemap`).toContain(
      `${SITE_ORIGIN}/catalogs/${c.id}.pdf`
    )
  }
  // …and the portfolio page + one URL per project page (scripts/build-pages.mjs
  // writes the sitemap from the same config, so this is the same contract)
  expect(locs, 'the portfolio page is listed').toContain(`${SITE_ORIGIN}${portfolio.path}`)
  for (const p of projects)
    expect(locs, `project page ${p.id} is missing from the sitemap`).toContain(
      `${SITE_ORIGIN}${portfolio.path}${p.id}/`
    )
  expect(
    locs.length,
    'homepage + portfolio + one per project + one per catalogue, nothing stale'
  ).toBe(2 + projects.length + catalogs.length)
  // anchors are positions on this page, not URLs — they must not be listed
  expect(locs.filter((l) => l.includes('#')), 'no anchor URLs in the sitemap').toHaveLength(0)
  expect(new Set(locs).size, 'no duplicate <loc>').toBe(locs.length)

  // and each one is genuinely in the deploy
  for (const loc of locs) {
    const res = await request.get(local(loc))
    expect(res.status(), `sitemap lists a URL that 404s: ${loc}`).toBe(200)
  }
})

/* ── 19. FORM is bilingual, keyboard-navigable and theme-aware ─────────────── */
test('enquiry form: bilingual labels, trapped Tab, both themes', async ({ page }) => {
  await fakeTurnstile(page)
  await ready(page)
  await openEnquiry(page)

  // BG labels + placeholders, and BG option VALUES (what lands in the email)
  await expect(page.locator('label[for="cf-type"]')).toHaveText('Тип проект')
  expect(await page.getAttribute('#cf-name', 'placeholder')).toBe('Име и фамилия')
  const values = await page.locator('#cf-type option').evaluateAll((o) =>
    o.map((e) => e.value).filter(Boolean)
  )
  expect(values).toEqual(['Апартамент', 'Къща', 'Офис', 'Ресторант', 'Друго'])
  await expect(page.locator('#cf-stage option[value="Идея"]')).toHaveText('Идея')

  // Switch to EN. The dialog is modal — its backdrop deliberately swallows
  // clicks on the page behind, including the nav — so close it first, which also
  // proves the language applies to markup that was never open when it changed.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  // we are scrolled down at #contact — unhide the bar. (The language toggle
  // lives in the bar itself at every width, never behind the burger.)
  await revealNav(page)
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(350)
  await page.locator('[data-form-open]').click()
  await page.waitForTimeout(450)
  await expect(page.locator('label[for="cf-type"]')).toHaveText('Project type')
  await expect(page.locator('.cform__title').first()).toHaveText('Tell us about your project')
  expect(await page.getAttribute('#cf-name', 'placeholder')).toBe('First and last name')
  await expect(page.locator('#cf-stage option[value="Идея"]')).toHaveText('Just an idea')
  expect(
    await page.locator('#cf-type option').evaluateAll((o) => o.map((e) => e.value).filter(Boolean))
  ).toEqual(values)
  expect(await page.locator('[data-form-close]').first().getAttribute('aria-label')).toBe('Close')

  /* the CAPTCHA block is part of the form's language and layout, and the widget
     itself is asked to render in the active language */
  await expect(page.locator('.cform__captcha-label')).toHaveText(ui.form.captchaLabel[1])
  await expect(page.locator('.cform__captcha-note')).toHaveText(ui.form.captchaNote[1])
  await waitCaptcha(page)
  expect(
    await page.locator('[data-turnstile]').getAttribute('data-rendered'),
    'widget built for the light theme and the active language'
  ).toBe('light|en')
  // it spans the field column rather than sitting as a 300px island
  const capW = (await page.locator('[data-turnstile]').boundingBox()).width
  const formW = (await page.locator('.cform__grid').boundingBox()).width
  expect(Math.abs(capW - formW), 'CAPTCHA spans the form column').toBeLessThan(formW * 0.06)

  /* a CAPTCHA error message is bilingual too. The form must be natively VALID
     first — otherwise the browser blocks the submit before our gate runs and the
     error panel is never touched (it would still hold its default markup). */
  await page.fill('#cf-name', 'Test Person')
  await page.fill('#cf-email', 'test@example.com')
  await page.fill('#cf-phone', '+359 888 111 222')
  await page.selectOption('#cf-type', 'Апартамент')
  await page.selectOption('#cf-stage', 'Идея')
  await page.evaluate(() => {
    window.__realGetResponse = window.turnstile.getResponse
    window.turnstile.getResponse = () => ''
  })
  await page.locator('[data-form-submit]').click()
  await page.waitForTimeout(400)
  await expect(page.locator('[data-form-err]')).toBeVisible()
  await expect(page.locator('[data-form-err-title]')).toHaveText(ui.form.captchaPendingTitle[1])
  await expect(page.locator('[data-form-err-text]')).toHaveText(ui.form.captchaPendingText[1])
  await page.evaluate(() => {
    window.turnstile.getResponse = window.__realGetResponse
  })

  // Tab is trapped: walking forward from the last control comes back inside
  const trapped = await page.evaluate(async () => {
    const panel = document.querySelector('.cform__panel')
    const f = [...panel.querySelectorAll('a[href],button:not(:disabled),input:not([disabled]):not([tabindex="-1"]),select,textarea')]
      .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null)
    return { count: f.length, allInPanel: f.every((el) => panel.contains(el)) }
  })
  expect(trapped.count, 'every field is reachable by keyboard').toBeGreaterThan(9)
  expect(trapped.allInPanel).toBe(true)
  await page.locator('[data-form-submit]').focus()
  await page.keyboard.press('Tab')
  await page.waitForTimeout(150)
  expect(
    await page.evaluate(() => document.querySelector('.cform__panel').contains(document.activeElement)),
    'Tab does not escape the dialog'
  ).toBe(true)

  // the dialog is themed by the same token flip as the page
  const panelBg = () => page.evaluate(() => getComputedStyle(document.querySelector('.cform__panel')).backgroundColor)
  const inputBg = () => page.evaluate(() => getComputedStyle(document.querySelector('#cf-name')).backgroundColor)
  const light = { panel: await panelBg(), input: await inputBg() }
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'))
  await page.waitForTimeout(500)
  const dark = { panel: await panelBg(), input: await inputBg() }
  expect(dark.panel, 'panel follows the theme').not.toBe(light.panel)
  expect(dark.input, 'inputs follow the theme').not.toBe(light.input)

  /* the CAPTCHA follows it too. Turnstile cannot restyle a live widget, so the
     dialog tears it down and rebuilds it on the next open — verify that, since a
     light Cloudflare box on the dark panel would be the one glaring seam. */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await page.locator('[data-form-open]').click()
  await page.waitForTimeout(500)
  await waitCaptcha(page)
  expect(
    await page.locator('[data-turnstile]').getAttribute('data-rendered'),
    'widget rebuilt for the dark theme'
  ).toBe('dark|en')
  // one widget, not two: the light one must have been REMOVED, not stacked under
  // the dark one (turnstile.remove() before the re-render, not just a render)
  expect(
    await page.locator('[data-turnstile] input[name="cf-turnstile-response"]').count(),
    'the previous widget was removed, not stacked'
  ).toBe(1)
})

/* ── 21. VERCEL DEPLOY ARTEFACTS: function + config carry the contract ──────
 * The deploy is "Vercel builds dist/ and mounts api/", so the serverless
 * function the form posts to and the vercel.json that owns redirects,
 * security headers and caching must actually exist and keep their promises —
 * otherwise a deploy silently loses its form backend or its headers. This
 * pins the contract. */
test('Vercel artefacts: api/enquiry.js + vercel.json carry the deploy contract', async () => {
  // the endpoint the form posts to is the serverless function's route
  expect(captcha.endpoint, 'endpoint is the Vercel function, site-relative').toBe('/api/enquiry')
  expect(fs.existsSync('api/enquiry.js'), 'api/enquiry.js exists at the repo root').toBe(true)
  const fn = fs.readFileSync('api/enquiry.js', 'utf8')
  expect(fn, 'endpoint verifies Turnstile server-side').toContain('turnstile/v0/siteverify')
  expect(fn, 'endpoint checks the honeypot').toContain('bot-field')
  expect(fn, 'endpoint emails over SMTP').toContain('nodemailer')
  expect(fn, 'secrets come from the environment, never inline').toContain('TURNSTILE_SECRET_KEY')
  for (const secretish of ['0x4AAAAAAEE', 'SECRET-KEY-HERE']) {
    expect(fn.includes(secretish), `no key material in the function (${secretish})`).toBe(false)
  }

  const vc = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  expect(vc.outputDirectory, 'static build output is dist/').toBe('dist')
  /* CRITICAL: the media optimizers are LOCAL-ONLY — optimized output is
   * committed. The build command must never grow an optimizer pass. */
  expect(vc.buildCommand, 'build is vite build only, never the optimizers').toBe('npm run build')
  for (const banned of ['optimize', 'assets', 'ffmpeg', 'sharp']) {
    expect(
      (vc.buildCommand || '').includes(banned),
      `no media-optimizer pass in the Vercel build (${banned})`
    ).toBe(false)
  }
  // canonical host: www → apex, permanent (Vercel upgrades http → https itself)
  const wwwRule = (vc.redirects || []).find((r) =>
    (r.has || []).some((h) => h.type === 'host' && h.value === 'www.semplodesign.com')
  )
  expect(wwwRule, 'www→apex redirect rule exists').toBeTruthy()
  expect(wwwRule.destination, 'redirect lands on the apex origin').toContain('https://semplodesign.com')
  expect(wwwRule.permanent, 'redirect is permanent').toBe(true)
  // the security headers the .htaccess used to be responsible for
  const allHeaders = (vc.headers || []).flatMap((h) => h.headers.map((x) => x.key))
  for (const h of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    expect(allHeaders, `${h} header is set`).toContain(h)
  }
  // cache policy covers the committed media and Vite's hashed bundles
  const headerSources = (vc.headers || []).map((h) => h.source).join('\n')
  expect(headerSources, 'media caching rule').toContain('videos|projects|panoramas')
  const cacheValues = (vc.headers || []).flatMap((h) => h.headers.map((x) => x.value)).join('\n')
  expect(cacheValues, 'hashed-bundle caching rule').toContain('immutable')
})

/* ── 22. cPANEL FALLBACK ARTEFACTS: dist/ stays upload-ready for public_html ─
 * SuperHosting/cPanel is the tested fallback deploy ("copy dist/ into
 * public_html"), so the Apache config and the PHP enquiry endpoint must keep
 * shipping inside dist/. Vite copies public/ verbatim — dotfiles included —
 * but if that ever changes (or the files are moved out of public/), the
 * fallback silently loses its redirects and its form backend. */
test('dist carries the cPanel fallback: .htaccess + the PHP enquiry endpoint', async () => {
  expect(fs.existsSync('dist/api/enquiry.php'), 'dist/api/enquiry.php is in the build').toBe(true)
  const php = fs.readFileSync('dist/api/enquiry.php', 'utf8')
  expect(php, 'fallback verifies Turnstile server-side').toContain('turnstile/v0/siteverify')
  expect(php, 'fallback checks the honeypot').toContain('bot-field')
  expect(php, 'secrets load from OUTSIDE public_html, never inline').toContain('semplo-private')
  for (const secretish of ['0x4AAAAAAEE', 'SECRET-KEY-HERE']) {
    expect(php.includes(secretish), `no key material in the deployed PHP (${secretish})`).toBe(false)
  }

  expect(fs.existsSync('dist/.htaccess'), 'dist/.htaccess is in the build').toBe(true)
  const ht = fs.readFileSync('dist/.htaccess', 'utf8')
  // canonical host: www → apex, http → https (mirrors business.url = apex)
  expect(ht, 'www→apex redirect').toContain('^www\\.')
  expect(ht, 'https enforcement').toContain('%{HTTPS}')
  for (const h of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    expect(ht, `${h} header is set`).toContain(h)
  }
  expect(ht, 'media caching rule').toContain('videos|projects|panoramas')
  expect(ht, 'hashed-bundle caching rule').toContain('immutable')
})

/* ── mobile video tier: a phone gets the PORTRAIT encodes ────────────────────
 * 390x844 at DPR 2.75 (the mobile project) is taller than 8:5 and DPR >= 2, so
 * src/video-tier.js must pick `portrait-hd`: the hero rests on its portrait
 * poster and every slot's <video> loads the 9:16 centre-crop file (the hd one
 * where the source is 4K, else the single portrait file). Without this a phone
 * paints a ~190 px strip of the 720 landscape clip six times up. */
test('mobile video tier: 390x844 loads the portrait encodes, never the landscape 720', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'phone tier choice — mobile project only')
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/videos.manifest.json', import.meta.url), 'utf8'))
  await ready(page)
  expect(await page.evaluate(() => document.documentElement.dataset.videoTier)).toBe('portrait-hd')
  const want = (m) => `/videos/${m.portraitHd || m.portrait}`
  const wantPoster = (m) => `/videos/${m.posterPortraitHd || m.posterPortrait}`
  expect(manifest.hero.portrait, 'hero has a portrait encode').toBeTruthy()
  expect(await page.locator('.hero__poster').getAttribute('src'), 'hero poster is the portrait crop').toBe(wantPoster(manifest.hero))
  // every slot: poster is the portrait crop, and once the lazy loader fires the
  // clip is the portrait file (scroll each into view — mobile loads on intersect)
  for (const sec of await page.locator('[data-hero],[data-ambient]').all()) {
    const id = await sec.getAttribute('data-id')
    const m = manifest[id]
    expect(m?.portrait, `${id} has a portrait encode`).toBeTruthy()
    expect(await sec.locator('img').first().getAttribute('src'), `${id} poster`).toBe(wantPoster(m))
    await sec.scrollIntoViewIfNeeded()
    await expect
      .poll(() => sec.locator('video').getAttribute('src'), { message: `${id} clip`, timeout: 10_000 })
      .toBe(want(m))
    expect(await sec.locator('video').getAttribute('src'), `${id} never the 720 landscape file`).not.toContain('-720.mp4')
  }
  // and the decoded hero frame really is portrait (taller than wide)
  await expect
    .poll(() => page.evaluate(() => { const v = document.querySelector('[data-hero-video]'); return v.videoHeight > v.videoWidth }), { timeout: 15_000 })
    .toBe(true)
})

/* ── video tiers (src/video-tier.js) ─────────────────────────────────────────
 * Wide desktops get the 1920 encodes + posters, ordinary desktops the 1280
 * ones; the tier is chosen once at boot from matchMedia. Checked on the first
 * featured slot (eager-loaded on desktop-motion → its src is on the element)
 * and on the hero's first-frame underlay. */
test('video tiers: a 1920 viewport gets the HD encode, 1440 the standard one', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'tier choice is a desktop-motion concern')
  const manifest = JSON.parse(fs.readFileSync(new URL('../src/videos.manifest.json', import.meta.url), 'utf8'))
  const f = featured[0]
  const fm = manifest[f.id]
  const hm = manifest.hero
  for (const [width, tier, clip, poster, heroFirst] of [
    [1920, 'hd', fm.desktopHd, fm.posterHd, hm.posterFirstHd],
    [1440, 'sd', fm.desktop, fm.poster, hm.posterFirst],
  ]) {
    expect(clip, `${tier} clip is in the manifest`).toBeTruthy()
    expect(poster, `${tier} poster is in the manifest`).toBeTruthy()
    await page.setViewportSize({ width, height: width >= 1920 ? 1080 : 900 })
    await ready(page)
    expect(await page.evaluate(() => document.documentElement.dataset.videoTier), `tier at ${width}px`).toBe(tier)
    const sec = page.locator(`[data-featured][data-id="${f.id}"]`)
    expect(await sec.locator('.ambient__poster').getAttribute('src'), `poster at ${width}px`).toBe(`/videos/${poster}`)
    await expect
      .poll(() => sec.locator('video').evaluate((v) => v.getAttribute('src')), { message: `clip at ${width}px`, timeout: 10_000 })
      .toBe(`/videos/${clip}`)
    expect(await page.locator('.hero__poster').getAttribute('src'), `hero underlay at ${width}px`).toBe(`/videos/${heroFirst}`)
  }
})
