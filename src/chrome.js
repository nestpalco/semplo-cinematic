import { ui, business } from './sections.config.js'

/* ──────────────────────────────────────────────────────────────────────────
 * SEMPLO — shared page chrome: language, theme, compact nav, contact links.
 *
 *   Extracted from main.js when the site grew a second kind of page
 *   (/portfolio/ and /portfolio/<id>/, driven by src/page.js). Both entries
 *   import THIS, so the BG/EN toggle, the light/dark switch and the burger
 *   behave identically everywhere — and a change lands on every page at once.
 *
 *   State lives on the exported `chrome` object (`chrome.lang`, `chrome.theme`).
 *   Consumers that keep a local copy listen for the `semplo:lang` event.
 *
 *   PERSISTENCE: the language is remembered in localStorage (`semplo:lang`)
 *   because the site is now several pages — a visitor who chose EN on the
 *   portfolio must land on a project page in EN, not be reset to BG. The
 *   theme was already persisted (`semplo:theme`, resolved BEFORE first paint
 *   by the inline boot script every page carries).
 * ────────────────────────────────────────────────────────────────────────── */

export const chrome = { lang: 'bg', theme: 'light' }

const LANG_KEY = 'semplo:lang'
const THEME_KEY = 'semplo:theme'

/** `ui` lookup by dotted path — 'form.errTitle' → ['…', '…'] */
export const dig = (p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), ui)

/* ── 1. Bilingual UI ──────────────────────────────────────────────────────── */
export function storedLang() {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return v === 'bg' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export function applyLang(next) {
  const lang = next === 'en' ? 'en' : 'bg'
  chrome.lang = lang
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
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {}
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
 * each page's <head> already resolved that before first paint (no flash); this
 * block owns the toggle, persistence, and — while the visitor has made no
 * explicit choice — keeps following later OS changes. */
const darkMQ = matchMedia('(prefers-color-scheme: dark)')
const themeBtn = document.querySelector('[data-theme-toggle]')
const themeMeta = document.querySelector('meta[name="theme-color"]')
let themeAnimT = 0
let reduced = false
chrome.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

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
  const idx = chrome.lang === 'bg' ? 0 : 1
  const label = chrome.theme === 'dark' ? ui.theme.toLight[idx] : ui.theme.toDark[idx]
  themeBtn.setAttribute('aria-label', label)
  themeBtn.title = label
  themeBtn.setAttribute('aria-pressed', String(chrome.theme === 'dark'))
}

export function applyTheme(next, { persist = true } = {}) {
  chrome.theme = next === 'dark' ? 'dark' : 'light'
  const root = document.documentElement
  // brief colour-only cross-fade so surfaces glide rather than snap
  if (!reduced) {
    root.classList.add('theme-anim')
    clearTimeout(themeAnimT)
    themeAnimT = setTimeout(() => root.classList.remove('theme-anim'), 420)
  }
  root.dataset.theme = chrome.theme
  if (themeMeta) themeMeta.content = chrome.theme === 'dark' ? '#121110' : '#f3f1ec'
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, chrome.theme)
    } catch {}
  }
  syncThemeBtn()
}

/** Wire the toggle. `prefersReduced` disables the cross-fade. */
export function initTheme({ prefersReduced = false } = {}) {
  reduced = prefersReduced
  themeBtn?.addEventListener('click', () => applyTheme(chrome.theme === 'dark' ? 'light' : 'dark'))
  darkMQ.addEventListener('change', (e) => {
    if (!storedTheme()) applyTheme(e.matches ? 'dark' : 'light', { persist: false })
  })
  syncThemeBtn()
}

/* ── Compact-nav hamburger (mobile, ≤620px) — opens the links as a dropdown.
 * The language toggle stays in the bar (always reachable); this panel just
 * holds the nav links. Closes on link choice, ESC, or scroll. ── */
export function initBurger() {
  const burger = document.querySelector('[data-burger]')
  if (!burger) return
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

/* ── Contact details: one source of truth ─────────────────────────────────
 * The visible strings already come from `ui.contact` (which mirrors `business`)
 * via data-i18n, but hrefs can't. Rewrite every tel:/mailto: from `business` so
 * a changed number can never leave a stale link behind. */
export function initContactLinks() {
  document.querySelectorAll('a[href^="tel:"]').forEach((a) => (a.href = `tel:${business.tel}`))
  document
    .querySelectorAll('a[href^="mailto:"]')
    .forEach((a) => (a.href = `mailto:${business.email}`))
}
