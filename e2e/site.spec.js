import { test, expect } from '@playwright/test'
import fs from 'node:fs'

/* ── shared helpers ───────────────────────────────────────────────────────── */

function collectErrors(page) {
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
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
      '.cta__contacts a', '.foot__brand', '.foot__center span', '.foot__contact span',
      '.foot__contact a',
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

/* ── 5. CATALOGUES: 5 cards, all downloads internal (no old-site links) ────── */
test('catalogues grid renders, all downloads internal', async ({ page }) => {
  await ready(page)
  const cards = page.locator('.catcard')
  await expect(cards).toHaveCount(5)
  const hrefs = await cards.evaluateAll((els) => els.map((a) => a.getAttribute('href')))
  for (const h of hrefs) expect(h).toMatch(/^\/catalogs\/.+\.pdf$/)
  const oldLinks = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="semplodesign.com"]')].map((a) => a.href)
  )
  expect(oldLinks, oldLinks.join('\n')).toHaveLength(0)
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
      '.catcard, .foot, .studio__stat, .studio__media, .project__title'
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
  await ready(page)
  await scrollWholePage(page)
  await page.evaluate(() => document.body.classList.remove('nav-hidden'))
  await page.waitForTimeout(300)

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
