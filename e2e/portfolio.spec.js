import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import sharp from 'sharp'
import { business, projects, portfolio, ui, catalogs } from '../src/sections.config.js'

/* ── PORTFOLIO PAGES: /portfolio/ + /portfolio/<id>/ ────────────────────────
 * Runs in the same three profiles as site.spec.js (desktop / mobile /
 * reduced-motion). The pages are static HTML generated from config by
 * scripts/build-pages.mjs and enhanced by src/page.js — so most assertions
 * are made twice: against the SERVED HTML (what a crawler sees) and against
 * the LIVE page (what a visitor gets after the runtime has run). */

const pmanifest = JSON.parse(fs.readFileSync('src/projects.manifest.json', 'utf8'))
const SITE = business.url
const ORIGIN = new URL(SITE).origin
const P = portfolio.path // '/portfolio/'
const pageOf = (p) => `${P}${p.id}/`
const bg = (pair) => pair[0]
const en = (pair) => pair[1]
// how the generator writes text into markup ("Gravity Homes & Living" → &amp;)
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/* ── helpers (mirrors of site.spec.js — kept local so the two suites stay independent) ── */
function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location()?.url || ''
    if (url && !url.includes('localhost')) return // third-party script noise (see site.spec.js)
    errors.push(`console.error: ${m.text()} [${url || 'no url'}]`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  return errors
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
      if (over > 1 && (!worst || over > worst.over))
        worst = { over, tag: el.tagName, cls: el.className?.toString().slice(0, 60) }
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, worst }
  })
}
async function open(page, path) {
  await page.goto(path)
  await page.waitForSelector('body.is-ready', { timeout: 15_000 })
  await page.waitForTimeout(500)
}
async function revealNav(page) {
  await page.waitForTimeout(300)
  await page.evaluate(() => document.body.classList.remove('nav-hidden'))
  await page.waitForTimeout(350)
}
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
  await page.waitForTimeout(800)
}
/* WCAG AA audit of text on themed surfaces (same method as site.spec.js) */
async function contrastFailures(page, SEL) {
  return page.evaluate((SEL) => {
    const px = (c) => {
      const n = (String(c).match(/[-\d.]+/g) || ['0', '0', '0']).map(Number)
      return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n.length > 3 ? n[3] : 1 }
    }
    const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    const flat = (fg, bgc) => ({
      r: fg.r * fg.a + bgc.r * (1 - fg.a),
      g: fg.g * fg.a + bgc.g * (1 - fg.a),
      b: fg.b * fg.a + bgc.b * (1 - fg.a),
      a: 1,
    })
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (hi + 0.05) / (lo + 0.05)
    }
    const pageBg = px(getComputedStyle(document.body).backgroundColor)
    const navBg = flat(
      px(getComputedStyle(document.documentElement).getPropertyValue('--nav-bar-bg')),
      pageBg
    )
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
      if (o < 0.5) continue
      const inNav = !!el.closest('.nav')
      if (inNav && !document.body.classList.contains('nav-ink')) continue
      audited++
      const bgc = inNav ? navBg : bgBehind(el)
      const raw = px(cs.color)
      const fg = flat({ ...raw, a: raw.a * o }, bgc)
      const size = parseFloat(cs.fontSize)
      const weight = parseInt(cs.fontWeight, 10) || 400
      const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5
      const got = ratio(fg, bgc)
      if (got + 0.005 < need)
        out.push({ sel: (el.className || el.tagName).toString().slice(0, 40), text: text.slice(0, 24), got: +got.toFixed(2), need })
    }
    return { audited, failures: out }
  }, SEL)
}

test.beforeEach(async ({ page }, info) => {
  if (info.project.name === 'reduced-motion') await page.emulateMedia({ reducedMotion: 'reduce' })
})

/* ── 1. LISTING: header, filter row, one card per project, bilingual ─────── */
test('portfolio: header, filters, cards from config, bilingual, clean', async ({ page }) => {
  const errors = collectErrors(page)
  await open(page, P)

  // header — the client's agreed title for the full portfolio
  await expect(page.locator('h1.pf-head__title')).toHaveText(bg(ui.portfolio.title))
  await expect(page.locator('.pf-head__eyebrow')).toHaveText(bg(ui.portfolio.eyebrow))
  await expect(page.locator('.pf-head__intro')).toHaveText(bg(ui.portfolio.intro))
  expect(await page.title()).toContain(bg(ui.portfolio.title))

  // nav: "Проекти" is the current page and points at the listing; the rest go home
  const work = page.locator('.nav__links a[data-i18n="nav.work"]')
  expect(await work.getAttribute('href')).toBe(P)
  expect(await work.getAttribute('aria-current')).toBe('page')
  for (const key of ['catalogs', 'studio', 'contact'])
    expect(await page.locator(`.nav__links a[data-i18n="nav.${key}"]`).getAttribute('href')).toBe(`/#${key}`)
  expect(await page.locator('.nav__brand').getAttribute('href')).toBe('/')

  // filter row: Всички + one chip per category, "all" pressed
  const chips = page.locator('[data-filter]')
  await expect(chips).toHaveCount(1 + portfolio.categories.length)
  expect((await chips.allTextContents()).map((s) => s.trim())).toEqual([
    bg(ui.portfolio.all),
    ...portfolio.categories.map((c) => bg(ui.portfolio.cats[c])),
  ])
  expect(await chips.first().getAttribute('aria-pressed')).toBe('true')
  expect(await page.locator('[data-filters]').getAttribute('aria-label')).toBe(bg(ui.portfolio.filter))

  // one card per configured project, in config order, linking to its page
  const cards = page.locator('.pcard')
  await expect(cards).toHaveCount(projects.length)
  const shape = await cards.evaluateAll((els) =>
    els.map((a) => ({
      href: a.getAttribute('href'),
      cat: a.dataset.cat,
      title: a.querySelector('.pcard__title')?.textContent.trim(),
      blurb: a.querySelector('.pcard__blurb')?.textContent.trim(),
      img: a.querySelector('img')?.getAttribute('src'),
      srcset: a.querySelector('img')?.getAttribute('srcset'),
      alt: a.querySelector('img')?.getAttribute('alt'),
      meta: a.querySelector('.pcard__meta')?.textContent.replace(/\s+/g, ' ').trim(),
    }))
  )
  shape.forEach((s, i) => {
    const p = projects[i]
    const cover = p.cover || pmanifest[p.id].gallery[0]
    expect(s.href, `card ${i} links to its page`).toBe(pageOf(p))
    expect(s.cat).toBe(p.category)
    expect(s.title).toBe(p.titleBg)
    expect(s.blurb).toBe(p.cardBg)
    expect(s.img).toBe(`/projects/${p.id}/gallery/${cover}-1600.webp`)
    expect(s.srcset, 'responsive cover').toContain(`${cover}-900.webp 900w`)
    expect(s.alt, 'cover has alt text').toBeTruthy()
    expect(s.meta).toContain(p.locationBg)
    expect(s.meta, 'no year on the portfolio card').not.toMatch(/\b20\d\d\b/)
  })
  // placeholder copy is badged, exactly where config says so
  expect(await page.locator('.pcard .pj-todo').count()).toBe(
    projects.filter((p) => (p.todo || []).includes('card')).length
  )

  // EN: title, chips, cards and the document title all swap
  await page.locator('.lang__btn[data-lang="en"]').click()
  await page.waitForTimeout(350)
  await expect(page.locator('h1.pf-head__title')).toHaveText(en(ui.portfolio.title))
  expect((await chips.allTextContents()).map((s) => s.trim())[1]).toBe(
    en(ui.portfolio.cats[portfolio.categories[0]])
  )
  await expect(cards.first().locator('.pcard__title')).toHaveText(projects[0].titleEn)
  expect(await page.title()).toContain(en(ui.portfolio.title))
  await expect(page.locator('[data-empty]')).toHaveText(en(ui.portfolio.empty)) // hidden, but translated
  await page.locator('.lang__btn[data-lang="bg"]').click()
  await page.waitForTimeout(300)

  expect(await horizontalOverflow(page), 'no horizontal overflow').toBeNull()

  // once the page has been scrolled through, every reveal has fired — nothing
  // in the header, the filter row, the grid or the footer is left transparent
  await scrollWholePage(page)
  const stuck = await page.evaluate(() =>
    [...document.querySelectorAll('.pf-head__eyebrow, .pf-head__title, .pf-head__intro, .pf-filter, .pcard, .foot')]
      .filter((el) => {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden')
      })
      .map((el) => (el.className || el.tagName).toString().slice(0, 40))
  )
  expect(stuck, `stuck-hidden: ${stuck.join(', ')}`).toHaveLength(0)
  expect(errors, errors.join('\n')).toHaveLength(0)

  // the SERVED HTML already carries the cards (crawlers, no-JS) — nothing injected
  const raw = await (await page.request.get(P)).text()
  for (const p of projects) {
    expect(raw, `${p.id} card is static`).toContain(`href="${pageOf(p)}"`)
    expect(raw).toContain(esc(p.titleBg))
  }
  expect(raw).toContain(`<link rel="canonical" href="${SITE}portfolio/"`)
})

/* ── 2. LISTING: the filter hides/shows, mirrors the hash, deep-links ─────── */
test('portfolio: category filter works and deep-links via #hash', async ({ page }) => {
  const errors = collectErrors(page)
  await open(page, P)
  const cards = page.locator('.pcard')
  const shownIds = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.pcard')].filter((c) => !c.hidden).map((c) => c.getAttribute('href'))
    )

  for (const cat of portfolio.categories) {
    await page.locator(`[data-filter="${cat}"]`).click()
    await page.waitForTimeout(250)
    const want = projects.filter((p) => p.category === cat).map(pageOf)
    expect(await shownIds(), `filter "${cat}" shows exactly its projects`).toEqual(want)
    expect(await page.locator(`[data-filter="${cat}"]`).getAttribute('aria-pressed')).toBe('true')
    expect(await page.locator('[data-filter="all"]').getAttribute('aria-pressed')).toBe('false')
    expect(new URL(page.url()).hash, 'filter mirrored into the hash').toBe(`#${cat}`)
    // an empty category says so instead of showing a blank grid
    const empty = page.locator('[data-empty]')
    if (want.length) await expect(empty).toBeHidden()
    else {
      await expect(empty).toBeVisible()
      await expect(empty).toHaveText(bg(ui.portfolio.empty))
    }
    // nothing IN VIEW is left stuck transparent by the reveal layer — a card
    // pulled into the viewport by the re-flow plays its rise-in, so wait for it
    // to land (cards still below the fold reveal on scroll, as designed)
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.pcard')]
            .filter((c) => !c.hidden && c.getBoundingClientRect().top < window.innerHeight * 0.92)
            .every(
              (c) => parseFloat(getComputedStyle(c).opacity) > 0.95 && getComputedStyle(c).visibility !== 'hidden'
            ),
        null,
        { timeout: 4000 }
      )
      .catch(() => {
        throw new Error(`filter "${cat}": a visible card never finished revealing`)
      })
  }
  await page.locator('[data-filter="all"]').click()
  await page.waitForTimeout(250)
  expect((await shownIds()).length).toBe(projects.length)
  expect(new URL(page.url()).hash, 'all → clean URL').toBe('')

  // deep link: /portfolio/#<cat> opens pre-filtered
  const cat = projects[0].category
  await open(page, `${P}#${cat}`)
  expect(await page.locator(`[data-filter="${cat}"]`).getAttribute('aria-pressed')).toBe('true')
  expect(await shownIds()).toEqual(projects.filter((p) => p.category === cat).map(pageOf))
  await expect(cards.first()).toBeVisible()

  expect(errors, errors.join('\n')).toHaveLength(0)
})

/* ── 3. PROJECT PAGE: every configured project, end to end ────────────────── */
for (const [i, p] of projects.entries()) {
  test(`project page ${p.id}: hero slider, meta, text, gallery, 360°, prev/next, SEO`, async ({
    page,
    request,
  }, info) => {
    const errors = collectErrors(page)
    const gallery = pmanifest[p.id].gallery
    const heroN = Math.min(portfolio.heroFrames, gallery.length)
    const rooms = p.panoramas || []
    const typeBg = p.typeBg || bg(ui.portfolio.types[p.category])
    const typeEn = p.typeEn || en(ui.portfolio.types[p.category])

    /* ── served HTML: static, crawlable, complete <head> ── */
    const res = await request.get(pageOf(p))
    expect(res.status(), 'page is deployed').toBe(200)
    const raw = await res.text()
    expect(raw).toContain('data-page="project"')
    expect(raw, 'title is static').toContain(`<h1 class="pj-hero__title"`)
    expect(raw).toContain(esc(p.titleBg))
    expect(raw, 'photos are in the HTML, not injected').toContain(
      `/projects/${p.id}/gallery/${gallery[0]}-1600.webp`
    )
    expect(raw).toContain(`<link rel="canonical" href="${SITE}portfolio/${p.id}/"`)
    expect(raw).toContain(`<meta property="og:url" content="${SITE}portfolio/${p.id}/"`)
    expect(raw).toContain(`<meta property="og:image" content="${SITE}projects/${p.id}/og.jpg"`)
    expect(raw).toMatch(/<meta name="description" content="[^"]{40,}"/)
    // the meta row itself (location · type [· area]) carries no year
    const metaHtml = raw.match(/<p class="pj-meta"[^>]*>([\s\S]*?)<\/p>/)?.[1] || ''
    expect(metaHtml, 'meta row is in the served HTML').not.toBe('')
    expect(metaHtml, 'no year in the served meta row').not.toMatch(/\b20\d\d\b/)

    // the project's social card is a real 1200×630 JPEG in the deploy
    const card = await request.get(`/projects/${p.id}/og.jpg`)
    expect(card.status()).toBe(200)
    expect(card.headers()['content-type']).toContain('image/jpeg')
    const meta = await sharp(await card.body()).metadata()
    expect({ w: meta.width, h: meta.height, f: meta.format }).toEqual({ w: 1200, h: 630, f: 'jpeg' })

    /* ── live page ── */
    await open(page, pageOf(p))
    expect(await page.title()).toContain(p.titleBg)
    expect(await page.title()).toContain('SEMPLO DESIGN')
    await expect(page.locator('h1.pj-hero__title')).toHaveText(p.titleBg)
    await expect(page.locator('.pj-hero__eyebrow')).toHaveText(typeBg)

    // hero slider: first `heroFrames` photos, first eager, counter at 1
    const slides = page.locator('.pj-hero__slide')
    await expect(slides).toHaveCount(heroN)
    expect(await slides.first().locator('img').getAttribute('loading')).toBe('eager')
    expect(await slides.first().locator('img').getAttribute('src')).toBe(
      `/projects/${p.id}/gallery/${gallery[0]}-1600.webp`
    )
    const counter = page.locator('[data-slider-i]')
    await expect(counter).toHaveText('1')
    const track = page.locator('[data-slider-track]')
    expect(await track.getAttribute('aria-label')).toBe(bg(ui.portfolio.slider))
    if (heroN > 1) {
      const w = await track.evaluate((el) => el.clientWidth)
      await page.locator('[data-slider-next]').click()
      await expect(counter).toHaveText('2', { timeout: 4000 })
      // the glide is a smooth scroll — wait for it to settle ON the slide
      await page.waitForFunction(
        (want) => Math.abs(document.querySelector('[data-slider-track]').scrollLeft - want) < 4,
        w,
        { timeout: 4000 }
      )
      await page.locator('[data-slider-prev]').click()
      await expect(counter).toHaveText('1', { timeout: 4000 })
      // keyboard: arrows move the slider when it has focus
      await track.focus()
      await page.keyboard.press('ArrowRight')
      await expect(counter).toHaveText('2', { timeout: 4000 })
      await page.keyboard.press('ArrowLeft')
      await expect(counter).toHaveText('1', { timeout: 4000 })
      // wraps: prev from the first slide lands on the last
      await page.locator('[data-slider-prev]').click()
      await expect(counter).toHaveText(String(heroN), { timeout: 4000 })
      await page.locator('[data-slider-next]').click()
      await expect(counter).toHaveText('1', { timeout: 4000 })
      // the controls sit inside the viewport and clear the title (390px included)
      const ctrl = await page.locator('.pj-hero__ctrl').boundingBox()
      const title = await page.locator('.pj-hero__title').boundingBox()
      expect(ctrl.x + ctrl.width).toBeLessThanOrEqual(page.viewportSize().width)
      expect(ctrl.y + ctrl.height, 'controls clear the title').toBeLessThan(title.y)
    } else {
      await expect(page.locator('.pj-hero__ctrl')).toBeHidden()
    }

    // meta row: location · type [· area] — area only when configured, never a year
    const metaItems = (await page.locator('.pj-meta__item').allTextContents()).map((s) => s.trim())
    const want = [p.locationBg, typeBg]
    if (p.area != null) want.push(bg(ui.portfolio.area).replace('{n}', String(p.area)))
    expect(metaItems, 'meta row = location · type [· area]').toEqual(want)
    const metaText = await page.locator('.pj-meta').textContent()
    expect(metaText, 'no year in the meta row').not.toMatch(/\b20\d\d\b/)
    // an area flagged `todo` is badged whether it is a placeholder figure or missing
    expect(await page.locator('.pj-meta .pj-todo').count(), 'area todo badge').toBe(
      (p.todo || []).includes('area') ? 1 : 0
    )
    if ((p.todo || []).includes('area'))
      await expect(page.locator('.pj-meta .pj-todo')).toHaveText(
        p.area != null ? bg(ui.portfolio.todoArea) : bg(ui.portfolio.todoAreaMissing)
      )

    // two-column text block from config
    const cols = page.locator('.pj-text__col')
    await expect(cols).toHaveCount(2)
    await expect(cols.nth(0).locator('.pj-text__title')).toHaveText(p.conceptTitleBg)
    await expect(cols.nth(0).locator('.pj-text__body')).toHaveText(p.conceptBg)
    await expect(cols.nth(1).locator('.pj-text__title')).toHaveText(
      p.realizationTitleBg || bg(ui.portfolio.realization)
    )
    await expect(cols.nth(1).locator('.pj-text__body')).toHaveText(p.realizationBg)
    expect(await page.locator('.pj-text .pj-todo').count()).toBe(
      ['concept', 'realization'].filter((k) => (p.todo || []).includes(k)).length
    )
    // the columns sit side by side on desktop, stack on the phone
    const c0 = await cols.nth(0).boundingBox()
    const c1 = await cols.nth(1).boundingBox()
    if (info.project.name === 'mobile') expect(c1.y, 'columns stack at 390px').toBeGreaterThanOrEqual(c0.y + c0.height - 2)
    else expect(Math.abs(c1.y - c0.y), 'columns share a row on desktop').toBeLessThan(4)

    // full gallery: every photo, lazy, responsive
    const frames = page.locator('.pj-frame img')
    await expect(frames).toHaveCount(gallery.length)
    expect(await frames.first().getAttribute('loading')).toBe('lazy')
    expect(await frames.last().getAttribute('src')).toBe(
      `/projects/${p.id}/gallery/${gallery[gallery.length - 1]}-1600.webp`
    )

    // 360° block ONLY for projects with rooms; the retired tabs are gone
    expect(await page.locator('[data-pano-stage]').count()).toBe(rooms.length ? 1 : 0)
    if (!rooms.length)
      expect(
        await page.evaluate(() => document.querySelector('.pj-intro').nextElementSibling?.className),
        'without rooms the gallery follows the text block directly'
      ).toBe('pj-gallery')
    expect(await page.locator('.pdetail__tabs, [role="tablist"], .pdetail__sketch').count(), 'no tabs / sketches').toBe(0)
    if (rooms.length) {
      // placement: straight after the text block, BEFORE the full gallery
      const order = await page.evaluate(() => {
        const pano = document.querySelector('.pj-pano')
        const intro = document.querySelector('.pj-intro')
        const gallery = document.querySelector('.pj-gallery')
        const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
        return {
          afterText: after(intro, pano),
          beforeGallery: after(pano, gallery),
          adjacent: intro.nextElementSibling === pano && pano.nextElementSibling === gallery,
        }
      })
      expect(order.afterText, '360° block follows the text block').toBe(true)
      expect(order.beforeGallery, '360° block precedes the gallery').toBe(true)
      expect(order.adjacent, 'nothing sits between text → 360° → gallery').toBe(true)
      await expect(page.locator('.pj-pano .pj-h2')).toHaveText(bg(ui.portfolio.pano))
      await expect(page.locator('[data-pano-room]')).toHaveText(rooms[0].bg)
      const chips = page.locator('[data-pano-jump]')
      await expect(chips).toHaveCount(rooms.length > 1 ? rooms.length : 0)
      // the viewer mounts lazily as the block approaches, Three.js and all
      await page.locator('.pj-pano').scrollIntoViewIfNeeded()
      const stage = page.locator('[data-pano-stage]')
      await expect(page.locator('.pano-canvas')).toHaveCount(1, { timeout: 20_000 })
      await expect(stage).toHaveAttribute(
        'data-src',
        new RegExp(`/projects/${p.id}/panoramas/${rooms[0].file}-(4096|2048)\\.webp$`),
        { timeout: 20_000 }
      )
      if (rooms.length > 1) {
        await chips.nth(1).click()
        expect(await chips.nth(1).getAttribute('aria-pressed')).toBe('true')
        await expect(page.locator('[data-pano-room]')).toHaveText(rooms[1].bg)
        await expect(stage).toHaveAttribute(
          'data-src',
          new RegExp(`/panoramas/${rooms[1].file}-(4096|2048)\\.webp$`),
          { timeout: 20_000 }
        )
      }
    }

    // prev / next wrap around the config order — but never the SAME project on
    // both sides (two projects → only "next"; one → neither); "all" → listing
    const N = projects.length
    const prevP = N >= 3 ? projects[(i - 1 + N) % N] : null
    const nextP = N >= 2 ? projects[(i + 1) % N] : null
    expect(await page.locator('.pj-nav__link--prev').count()).toBe(prevP ? 1 : 0)
    expect(await page.locator('.pj-nav__link--next').count()).toBe(nextP ? 1 : 0)
    if (prevP) {
      expect(await page.locator('.pj-nav__link--prev').getAttribute('href')).toBe(pageOf(prevP))
      await expect(page.locator('.pj-nav__link--prev .pj-nav__title')).toHaveText(prevP.titleBg)
    }
    if (nextP) {
      expect(await page.locator('.pj-nav__link--next').getAttribute('href')).toBe(pageOf(nextP))
      await expect(page.locator('.pj-nav__link--next .pj-nav__title')).toHaveText(nextP.titleBg)
      expect(nextP.id, 'next is never this project').not.toBe(p.id)
      if (prevP) expect(prevP.id, 'prev and next differ').not.toBe(nextP.id)
    }
    expect(await page.locator('.pj-nav__all').getAttribute('href')).toBe(P)
    // the CTA leads to the homepage contact block (the form lives there)
    expect(await page.locator('.pj-cta .cta__btn').getAttribute('href')).toBe('/#contact')

    // nothing left hidden once the page has been scrolled through. The gallery
    // frames lazy-load and grow the page as they arrive, so wait for every
    // image before measuring, then rest at the true bottom
    await scrollWholePage(page)
    // (only the gallery frames: the hero slider's off-screen slides are lazy
    // and never load until swiped to, so waiting on those would never resolve)
    await page.evaluate(() =>
      Promise.race([
        Promise.all(
          [...document.querySelectorAll('.pj-frame img')].map((img) =>
            img.complete ? null : new Promise((r) => { img.onload = img.onerror = r })
          )
        ),
        new Promise((r) => setTimeout(r, 8000)),
      ])
    )
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto'
      window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await page.waitForTimeout(1200)
    const stuck = await page.evaluate(() => {
      const sel =
        '.pj-hero__title, .pj-hero__eyebrow, .pj-meta, .pj-text__title, .pj-text__body, .pj-h2,' +
        '.pj-nav__link, .pj-nav__all, .pj-cta__title, .pj-cta__text, .pj-cta .cta__btn, .foot'
      return [...document.querySelectorAll(sel)]
        .filter((el) => {
          const cs = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && (parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden')
        })
        .map((el) => (el.className || el.tagName).toString().slice(0, 40))
    })
    expect(stuck, `stuck-hidden: ${stuck.join(', ')}`).toHaveLength(0)
    expect(await horizontalOverflow(page), 'no horizontal overflow').toBeNull()
    if (info.project.name !== 'desktop')
      expect(await page.locator('.pin-spacer').count(), 'never pinned').toBe(0)
    else expect(await page.locator('.pin-spacer').count(), 'no scroll-jacking on project pages').toBe(0)

    /* ── EN: everything swaps, and the choice survives navigating away ── */
    await revealNav(page)
    await page.locator('.lang__btn[data-lang="en"]').click()
    await page.waitForTimeout(350)
    await expect(page.locator('h1.pj-hero__title')).toHaveText(p.titleEn)
    await expect(page.locator('.pj-hero__eyebrow')).toHaveText(typeEn)
    expect((await page.locator('.pj-meta__item').allTextContents()).map((s) => s.trim())[0]).toBe(p.locationEn)
    await expect(cols.nth(0).locator('.pj-text__title')).toHaveText(p.conceptTitleEn)
    await expect(cols.nth(1).locator('.pj-text__title')).toHaveText(
      p.realizationTitleEn || en(ui.portfolio.realization)
    )
    expect(await page.title()).toContain(p.titleEn)
    expect(await track.getAttribute('aria-label')).toBe(en(ui.portfolio.slider))
    if (nextP)
      await expect(page.locator('.pj-nav__link--next .pj-nav__dir')).toHaveText(en(ui.portfolio.nextProject))
    // follow "next" — the new page must load in EN, not reset to BG
    if (nextP) {
      await page.locator('.pj-nav__link--next').click()
      await page.waitForSelector('body.is-ready', { timeout: 15_000 })
      expect(new URL(page.url()).pathname).toBe(pageOf(nextP))
      await expect(page.locator('h1.pj-hero__title')).toHaveText(nextP.titleEn)
      expect(await page.evaluate(() => document.documentElement.lang)).toBe('en')
    }
    await page.evaluate(() => localStorage.removeItem('semplo:lang'))

    expect(errors, errors.join('\n')).toHaveLength(0)
  })
}

/* ── 4. THEME + CONTRAST on both page kinds, both themes ──────────────────── */
test('portfolio pages: theme flips every surface, text passes AA in light and dark', async ({ page }) => {
  const SEL = [
    '.nav__logo', '.nav__links a', '.lang__btn',
    '.pf-head__eyebrow', '.pf-head__title', '.pf-head__intro', '.pf-filter__btn',
    '.pcard__cat', '.pcard__title', '.pcard__blurb', '.pcard__meta', '.pj-todo',
    '.pj-meta', '.pj-text__title', '.pj-text__body', '.pj-h2',
    '.pj-nav__dir', '.pj-nav__title', '.pj-nav__all',
    '.pj-cta__eyebrow', '.pj-cta__title', '.pj-cta__text', '.pj-cta .cta__btn',
    '.foot__brand', '.foot__center span', '.foot__contact span', '.foot__contact a', '.foot__credit',
  ].join(',')

  for (const path of [P, pageOf(projects[0])]) {
    await open(page, path)
    await scrollWholePage(page)
    await page.evaluate(() => document.body.classList.remove('nav-hidden'))
    await page.waitForTimeout(300)
    const surf = () =>
      page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        band: getComputedStyle(document.querySelector('.pf, .pj-intro')).backgroundColor,
        foot: getComputedStyle(document.querySelector('.foot')).backgroundColor,
        title: getComputedStyle(document.querySelector('.pf-head__title, .pj-text__title')).color,
      }))
    const light = await surf()
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme)
      await page.waitForTimeout(500)
      const { audited, failures } = await contrastFailures(page, SEL)
      expect(audited, `${path} ${theme}: audit covers the page`).toBeGreaterThan(12)
      expect(
        failures,
        `${path} ${theme} — AA failures:\n${failures.map((f) => `  ${f.sel} "${f.text}" ${f.got}:1 (need ${f.need})`).join('\n')}`
      ).toHaveLength(0)
    }
    const dark = await surf()
    for (const k of Object.keys(light)) expect(dark[k], `${path}: ${k} follows the theme`).not.toBe(light[k])
    await page.evaluate(() => (document.documentElement.dataset.theme = 'light'))
  }
})

/* ── 5. MOBILE ergonomics at 390px ────────────────────────────────────────── */
test('portfolio pages at 390px: single column, burger nav, everything inside the viewport', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'mobile-only')
  await open(page, P)
  const vw = page.viewportSize().width
  // one column of cards
  const boxes = await page.locator('.pcard').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect()
      return { x: Math.round(r.x), w: Math.round(r.width), top: Math.round(r.top) }
    })
  )
  for (let k = 1; k < boxes.length; k++) {
    expect(boxes[k].top, `card ${k} stacks below card ${k - 1}`).toBeGreaterThan(boxes[k - 1].top)
    expect(boxes[k].x, 'same left edge').toBe(boxes[0].x)
  }
  // filter chips wrap inside the viewport
  for (const b of await page.locator('[data-filter]').all()) {
    const r = await b.boundingBox()
    expect(r.x + r.width).toBeLessThanOrEqual(vw)
  }
  // burger opens the links, "Проекти" leads here, "Каталози" leads home
  const burger = page.locator('[data-burger]')
  await expect(burger).toBeVisible()
  await burger.click()
  await page.waitForTimeout(350)
  await expect(page.locator('.nav__links a[data-i18n="nav.catalogs"]')).toBeVisible()
  expect(await page.locator('.nav__links a[data-i18n="nav.catalogs"]').getAttribute('href')).toBe('/#catalogs')
  await page.keyboard.press('Escape')

  await open(page, pageOf(projects[0]))
  expect(await horizontalOverflow(page)).toBeNull()
  const title = await page.locator('.pj-hero__title').boundingBox()
  expect(title.x + title.width, 'hero title inside the viewport').toBeLessThanOrEqual(vw)
  const meta = await page.locator('.pj-meta').boundingBox()
  expect(meta.x + meta.width).toBeLessThanOrEqual(vw)
})

/* ── 6. SITEMAP + reachability: every page is listed, every listing resolves ─ */
test('sitemap lists the portfolio and every project page', async ({ request }) => {
  const sm = await (await request.get('/sitemap.xml')).text()
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
  expect(locs).toContain(`${ORIGIN}${P}`)
  for (const p of projects) expect(locs, `${p.id} listed`).toContain(`${ORIGIN}${pageOf(p)}`)
  expect(locs.length, 'home + portfolio + projects + catalogues, nothing stale').toBe(
    2 + projects.length + catalogs.length
  )
  for (const loc of locs) {
    const res = await request.get(loc.replace(ORIGIN, ''))
    expect(res.status(), `${loc} resolves`).toBe(200)
  }
  // an unknown project path is a real 404, not the homepage in disguise
  const missing = await request.get(`${P}no-such-project/`)
  expect(missing.status()).toBe(404)
})
