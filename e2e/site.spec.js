import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import sharp from 'sharp'
import { businessLd, publishable } from '../src/schema.js'
import { business, reviews, catalogs, captcha, ui, projects } from '../src/sections.config.js'

const SITE = business.url // 'https://semplodesign.com/'
const SITE_ORIGIN = new URL(SITE).origin
// Cloudflare's dummy sitekeys issue a token but draw NO widget, so a few
// CAPTCHA assertions have to branch on which kind of key is configured. Both
// branches are asserted, so the suite keeps passing — and starts checking the
// real widget — as soon as the production key replaces the placeholder.
const USING_TEST_KEY = captcha.testKeys.includes(captcha.sitekey)

const PHONE = '+359 894 880 088'
const TEL = 'tel:+359894880088'
const WORDMARK = 'Semplo Concept'

/* ── shared helpers ───────────────────────────────────────────────────────── */

function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    // failed-resource messages carry no URL in text() — pull it from location()
    const url = m.location()?.url || ''
    // Resource failures on THIRD-PARTY hosts are outside the deploy and flake
    // the suite (observed: fonts.gstatic.com intermittently 404s two Inter
    // woff2 subsets — Google's CDN, correct <link>, fallback fonts cover it).
    // Same-origin resource failures and every non-resource error still count.
    if (m.text().startsWith('Failed to load resource') && url && !url.includes('localhost')) return
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
      '.projects__eyebrow', '.projects__title', '.project__title', '.project__sub',
      '.catcard__cat', '.catcard__title', '.catcard__dl', '.catcard__size', '.catcard__doc',
      '.cta__eyebrow', '.cta__title', '.cta__text', '.cta__btn', '.cta__contacts',
      '.cta__contacts a', '.cta__maplink', '.foot__brand', '.foot__center span',
      '.foot__contact span', '.foot__contact a',
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

/* ── 4. PROJECT overlay opens + closes ────────────────────────────────────── */
test('project overlay opens (360° block present) and closes', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)
  await page.locator('.project').first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await page.locator('.project').first().click()
  const overlay = page.locator('.pdetail')
  await expect(overlay).toBeVisible()
  await expect(page.locator('.pdetail__title')).not.toBeEmpty()
  expect(await page.locator('[data-pano-stage]').count()).toBeGreaterThan(0)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(overlay).toBeHidden()
  expect(await page.evaluate(() => document.body.classList.contains('is-locked'))).toBe(false)
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 4b. PROJECT TABS: Проект ⇄ Галерия, gallery default, keyboard, zoom ──── */
test('project tabs: gallery opens selected, sketches switchable, zoom works', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)

  const iSk = projects.findIndex((p) => p.sketches?.length)
  expect(iSk, 'at least one project has sketches configured').toBeGreaterThan(-1)
  const card = page.locator('.project').nth(iSk)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await card.click()
  await expect(page.locator('.pdetail')).toBeVisible()

  /* proper tab semantics, GALLERY selected by default (the finished work is
     the payoff; Проект is the deeper dive) */
  const tabs = page.locator('.pdetail__tabs')
  await expect(tabs).toBeVisible()
  expect(await tabs.getAttribute('role')).toBe('tablist')
  expect(await tabs.getAttribute('aria-label')).toBeTruthy()
  const tabP = page.locator('#pdetail-tab-project')
  const tabG = page.locator('#pdetail-tab-gallery')
  await expect(tabP).toHaveText('Проект')
  await expect(tabG).toHaveText('Галерия')
  for (const [t, sel] of [[tabP, false], [tabG, true]]) {
    expect(await t.getAttribute('role')).toBe('tab')
    expect(await t.getAttribute('aria-selected')).toBe(String(sel))
    // roving tabindex: only the selected tab is in the page tab order
    expect(await t.getAttribute('tabindex')).toBe(sel ? '0' : '-1')
  }
  expect(await tabG.getAttribute('aria-controls')).toBe('pdetail-panel-gallery')
  const panelG = page.locator('#pdetail-panel-gallery')
  const panelP = page.locator('#pdetail-panel-project')
  await expect(panelG).toBeVisible()
  await expect(panelP).toBeHidden()
  expect(await panelG.getAttribute('role')).toBe('tabpanel')
  expect(await panelG.getAttribute('aria-labelledby')).toBe('pdetail-tab-gallery')
  expect(
    await panelG.locator('.pdetail__frame').count(),
    'gallery panel holds the full photo sequence'
  ).toBe(projects[iSk].frames.length)

  /* the 360° block is SHARED chrome above the switchable panels — visible when
     the project opens, never hidden behind a tab */
  const panoAboveTabsContent = await page.evaluate(() => {
    const pano = document.querySelector('.pdetail__pano')
    const panel = document.querySelector('.pdetail__panel')
    return pano && panel
      ? !!(pano.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING)
      : null
  })
  expect(panoAboveTabsContent, '360° sits above the tab panels, not inside one').toBe(true)

  /* switch to Проект: sketches appear, gallery hides, aria follows */
  await tabP.click()
  await page.waitForTimeout(450)
  await expect(panelP).toBeVisible()
  await expect(panelG).toBeHidden()
  // the switch glides the fresh panel up under the sticky bar — and LANDS
  // there (a native smooth scroll gets cancelled by the ScrollTrigger
  // refreshes that still-loading gallery images fire; the gsap glide doesn't)
  await page.waitForFunction(
    () => {
      const s = document.querySelector('[data-pdetail-scroll]')
      const panel = document.querySelector('#pdetail-panel-project')
      const tabs = document.querySelector('.pdetail__tabs')
      // a panel shorter than the viewport clamps the scroll — allow that
      const want = Math.min(
        panel.offsetTop - tabs.offsetHeight,
        s.scrollHeight - s.clientHeight
      )
      return Math.abs(s.scrollTop - want) < 4
    },
    null,
    { timeout: 5000 }
  )
  expect(await tabP.getAttribute('aria-selected')).toBe('true')
  expect(await tabG.getAttribute('aria-selected')).toBe('false')
  const sk = panelP.locator('.pdetail__sketch img')
  await expect(sk).toHaveCount(projects[iSk].sketches.length)
  expect(await sk.first().getAttribute('loading'), 'sketches lazy-load').toBe('lazy')
  expect(await sk.first().getAttribute('src')).toMatch(/^\/sketches\/.+-1000\.webp$/)
  // drawings are contained, not cropped: the img keeps its own aspect ratio
  await sk.first().evaluate((img) =>
    img.complete && img.naturalWidth
      ? null
      : new Promise((r) => { img.onload = r; img.onerror = r })
  )
  const fit = await sk.first().evaluate((img) => {
    const r = img.getBoundingClientRect()
    return { drawn: +(r.width / r.height).toFixed(2), natural: +(img.naturalWidth / img.naturalHeight).toFixed(2) }
  })
  expect(Math.abs(fit.drawn - fit.natural), 'sketch aspect ratio preserved').toBeLessThan(0.05)

  /* click-to-zoom: swaps in the 2000px variant; ESC leaves the zoom first,
     the overlay only on a second press */
  const zoomBtn = panelP.locator('[data-sketch-zoom]').first()
  const fig = panelP.locator('.pdetail__sketch').first()
  await zoomBtn.click()
  await expect(fig).toHaveClass(/is-zoomed/)
  expect(await zoomBtn.getAttribute('aria-pressed')).toBe('true')
  expect(await sk.first().getAttribute('src')).toMatch(/-2000\.webp$/)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await expect(fig).not.toHaveClass(/is-zoomed/)
  await expect(page.locator('.pdetail'), 'first ESC only leaves the zoom').toBeVisible()

  /* arrow keys move selection (automatic activation) */
  await tabP.focus()
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(450)
  expect(await tabG.getAttribute('aria-selected')).toBe('true')
  await expect(panelG).toBeVisible()
  await expect(panelP).toBeHidden()
  expect(
    await page.evaluate(() => document.activeElement?.id),
    'focus follows the arrow'
  ).toBe('pdetail-tab-gallery')

  /* bilingual labels */
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(page.locator('.pdetail')).toBeHidden()
  await revealNav(page)
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(300)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await card.click()
  await expect(page.locator('.pdetail')).toBeVisible()
  await expect(tabP).toHaveText('Project')
  await expect(tabG).toHaveText('Gallery')
  expect(
    await panelP.locator('[data-sketch-zoom]').first().getAttribute('aria-label')
  ).toBe(ui.projects.zoomIn[1])
  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)

  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 4c. EMPTY SKETCHES: no tab, no panel chrome — the overlay as before ───── */
test('project without sketches shows no tab bar, just the sequence', async ({ page }) => {
  const errors = collectErrors(page)
  await ready(page)

  const iBare = projects.findIndex((p) => !p.sketches || p.sketches.length === 0)
  expect(iBare, 'at least one project has no sketches (graceful degradation)').toBeGreaterThan(-1)
  const card = page.locator('.project').nth(iBare)
  await card.scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await card.click()
  await expect(page.locator('.pdetail')).toBeVisible()

  await expect(page.locator('.pdetail__tabs')).toBeHidden()
  expect(await page.locator('.pdetail__panel').count(), 'no tabpanel semantics either').toBe(0)
  expect(await page.locator('.pdetail__sketch').count()).toBe(0)
  expect(await page.locator('.pdetail__frame').count()).toBe(projects[iBare].frames.length)
  // the 360° block still leads the sequence
  expect(await page.locator('[data-pano-stage]').count()).toBe(1)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(600)
  await expect(page.locator('.pdetail')).toBeHidden()
  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 4d. SKETCH PIPELINE contract: config ↔ files ↔ deploy ─────────────────── */
test('every configured sketch is named for its project and deployed in both sizes', async ({
  request,
}) => {
  for (const p of projects) {
    for (const n of p.sketches || []) {
      // naming convention: <projectId>-NN keeps the folder self-explanatory
      expect(n, `sketch "${n}" should be named ${p.id}-NN`).toMatch(new RegExp(`^${p.id}-`))
      for (const w of [1000, 2000]) {
        const res = await request.get(`/sketches/${n}-${w}.webp`)
        expect(
          res.status(),
          `/sketches/${n}-${w}.webp missing — drop ${n}.jpg in assets/sketches/ and run npm run optimize:sketches`
        ).toBe(200)
        expect(res.headers()['content-type']).toContain('image/webp')
      }
    }
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
  // sent there would land on a 404 once DNS switches to Netlify.
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
      '.catcard, .foot, .studio__stat, .studio__media, .project__title,' +
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

  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t
    }, theme)
    await page.waitForTimeout(500) // let the cross-fade land
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

/* ── 11. MOBILE film strips: scroll-linked, stepped, reversible ───────────── */
test('mobile: project film strips advance with scroll', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile-only')
  await ready(page)

  await expect(page.locator('.project').first()).toHaveClass(/is-stepped/)

  const trace = await page.evaluate(async () => {
    document.documentElement.style.scrollBehavior = 'auto' // see scrollWholePage
    const card = document.querySelector('.project')
    const strip = card.querySelector('[data-strip]')
    const n = strip.children.length
    const top = card.getBoundingClientRect().top + window.scrollY
    const read = () => Number(getComputedStyle(strip).getPropertyValue('--frame')) || 0
    const shift = () =>
      Math.round(new DOMMatrixReadOnly(getComputedStyle(strip).transform).m41)

    const frames = []
    for (
      let y = Math.max(0, top - window.innerHeight);
      y <= top + card.offsetHeight + 80;
      y += 40
    ) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 60))
      frames.push(read())
    }
    const atEnd = read()
    await new Promise((r) => setTimeout(r, 800)) // let the CSS glide settle
    const endShift = shift()

    // scroll back well above the card — it must step back to frame 1
    window.scrollTo(0, Math.max(0, top - window.innerHeight - 400))
    await new Promise((r) => setTimeout(r, 600))
    return { n, frames, atEnd, endShift, back: read(), backShift: shift() }
  })

  expect(trace.n, 'strip has multiple frames').toBeGreaterThan(1)
  const distinct = [...new Set(trace.frames)]
  expect(
    distinct.length,
    `advanced through ${distinct.length} frame(s): ${trace.frames.join(',')}`
  ).toBeGreaterThanOrEqual(3)
  // scroll-linked and ordered: never jumps backwards while scrolling down
  for (let i = 1; i < trace.frames.length; i++) {
    expect(trace.frames[i], `frame regressed at step ${i}: ${trace.frames.join(',')}`)
      .toBeGreaterThanOrEqual(trace.frames[i - 1])
  }
  expect(trace.atEnd, 'rests on the last frame past the card').toBe(trace.n - 1)
  expect(trace.endShift, 'strip really translated').toBeLessThan(-50)
  expect(trace.back, 'steps back when scrolled back up').toBe(0)
  expect(Math.abs(trace.backShift), 'and returns to frame 1').toBeLessThan(5)
})

/* ── 12. WORDMARK: "Semplo Concept" everywhere, and it still fits the bar ──── */
test('wordmark reads "Semplo Concept" everywhere and fits the nav', async ({ page }, info) => {
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

  // "Semplo" must never appear WITHOUT "Concept" following it in visible chrome
  const bare = await page.evaluate(() =>
    ['.nav__logo', '.foot__brand', '.loader__mark', '[data-i18n="foot.rights"]']
      .map((s) => document.querySelector(s)?.textContent || '')
      .filter((t) => /Semplo(?!\s+Concept)/.test(t))
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
  // the page is reached (custom domain, *.netlify.app, deploy preview)
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
test('enquiry form: Netlify wiring, validation, AJAX success + error', async ({ page }) => {
  const errors = collectErrors(page)
  await fakeTurnstile(page)
  // watch every request to Cloudflare so we can prove the CAPTCHA is lazy
  const capReqs = []
  page.on('request', (r) => {
    if (r.url().includes('challenges.cloudflare.com')) capReqs.push(r.url())
  })
  await ready(page)

  // LAZY LOAD: not one byte of third-party CAPTCHA for a visitor who never
  // opens the form. This is the whole reason we did not use Netlify's built-in
  // reCAPTCHA, which injects its script into the published HTML.
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

  /* ── Netlify Forms contract: all three parts must be in the DEPLOYED HTML,
        because form detection happens at build time by parsing it ── */
  const netlify = await page.evaluate(() => {
    const f = document.querySelector('[data-form]')
    return {
      name: f.getAttribute('name'),
      method: (f.getAttribute('method') || '').toUpperCase(),
      dataNetlify: f.getAttribute('data-netlify'),
      honeypotAttr: f.getAttribute('netlify-honeypot'),
      formName: f.querySelector('input[name="form-name"]')?.value,
      hasPot: !!f.querySelector('input[name="bot-field"]'),
      potVisible: (() => {
        const el = f.querySelector('input[name="bot-field"]')
        const r = el.getBoundingClientRect()
        return r.width > 2 && r.height > 2
      })(),
      potTabbable: f.querySelector('input[name="bot-field"]').tabIndex >= 0,
      action: f.getAttribute('action'),
      fields: [...f.elements]
        .filter(
          (e) =>
            e.name &&
            !['form-name', 'bot-field', 'cf-turnstile-response'].includes(e.name)
        )
        .map((e) => e.name),
    }
  })
  expect(netlify.name).toBe('contact')
  expect(netlify.method).toBe('POST')
  // posts to the VERIFYING FUNCTION, not straight at Netlify's form endpoint —
  // Netlify Forms cannot validate a Turnstile token
  expect(netlify.action, 'form posts to the Turnstile-verifying function').toBe(captcha.endpoint)
  expect(netlify.dataNetlify).toBe('true')
  expect(netlify.honeypotAttr).toBe('bot-field')
  expect(netlify.formName, 'hidden form-name is required for AJAX POSTs').toBe('contact')
  expect(netlify.hasPot).toBe(true)
  expect(netlify.potVisible, 'honeypot must be invisible to humans').toBe(false)
  expect(netlify.potTabbable, 'honeypot must be out of the tab order').toBe(false)
  // the qualifying fields a studio actually needs
  expect(netlify.fields).toEqual([
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
  // the payload Netlify needs: url-encoded, form-name included, honeypot empty.
  // Parse it rather than string-matching — `+` is an encoded space here, which
  // decodeURIComponent would leave as a literal plus.
  expect(req.headers()['content-type']).toContain('application/x-www-form-urlencoded')
  const sent = new URLSearchParams(req.postData() || '')
  expect(sent.get('form-name'), 'Netlify needs form-name in an AJAX POST').toBe('contact')
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

  /* ── the FUNCTION rejecting the token (403) gets the CAPTCHA message ──
     This is the real-world case: the token was spent, expired, or forged, so
     netlify/functions/enquiry.mjs answers 403 { error: 'captcha' }. It must not
     read as a generic "something went wrong". */
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
 * that isn't actually in the deploy is caught too.
 *
 * The URLs do not resolve on the public internet yet (DNS still points at the
 * old WordPress install); that is orthogonal to whether they are correct. */
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
  expect(locs.length, 'homepage + one entry per catalogue, nothing stale').toBe(1 + catalogs.length)
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

  // BG labels + placeholders, and BG option VALUES (what lands in Netlify)
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
