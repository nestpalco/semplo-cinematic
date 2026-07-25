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
