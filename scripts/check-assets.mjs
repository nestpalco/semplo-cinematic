/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — config ↔ committed-assets contract check (the build gate).
 * ─────────────────────────────────────────────────────────────────────────
 *  The optimized media in public/ is COMMITTED (not rebuilt on deploy — the
 *  ffmpeg/sharp passes are far too heavy to run per-deploy), so the deploy
 *  build is `vite build` alone. This script is what still fails the build LOUDLY
 *  when the committed output has drifted from the config or the manifests:
 *
 *    • every video slot (hero + ambients) has a manifest entry, and every
 *      file that entry names exists in public/videos/;
 *    • every configured project is in src/projects.manifest.json, its
 *      gallery is non-empty, every labelled panorama room has its file, and
 *      every manifest-listed image exists in public/projects/ in EVERY
 *      emitted size variant;
 *    • every catalogue PDF, every hand-picked strip frame, and the social
 *      card are in place.
 *
 *  It runs as the `prebuild`/`predev` hook, needs nothing beyond node (no
 *  ffmpeg, no sharp), and finishes in milliseconds. What it CANNOT see is a
 *  re-exported source whose old outputs are still present — catching that is
 *  the pre-deploy checklist in the README: if anything under assets/ changed,
 *  run `npm run assets` locally and commit the regenerated public/ output.
 *
 *  Run: node scripts/check-assets.mjs
 * ─────────────────────────────────────────────────────────────────────────
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  hero,
  ambients,
  featured,
  projects,
  portfolio,
  catalogs,
  strips,
} from '../src/sections.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const PUB = resolve(ROOT, 'public')

// must mirror scripts/optimize-projects.mjs TYPES widths
const PROJECT_VARIANTS = {
  gallery: [1600, 900],
  sketches: [3000, 1000],
  panoramas: [4096, 2048],
}

// the portfolio schema (mirrors the PORTFOLIO PAGE FIELDS note in config)
const PORTFOLIO_CATS = new Set(['apartment', 'house', 'commercial'])
const PORTFOLIO_TEXT = [
  'titleBg', 'titleEn', 'locationBg', 'locationEn', 'cardBg', 'cardEn',
  'conceptTitleBg', 'conceptTitleEn', 'conceptBg', 'conceptEn',
  'realizationBg', 'realizationEn',
]
const PORTFOLIO_TODO = new Set(['card', 'concept', 'realization', 'area'])

const problems = []
const miss = (rel, why) => problems.push(`${rel}  (${why})`)

/* ── videos ── */
let vmanifest = {}
try {
  vmanifest = JSON.parse(readFileSync(resolve(ROOT, 'src/videos.manifest.json'), 'utf8'))
} catch {
  problems.push('src/videos.manifest.json missing/unreadable (run npm run optimize:videos)')
}
for (const slot of [hero, ...(ambients || []), ...(featured || [])].filter(Boolean)) {
  const m = vmanifest[slot.id]
  if (!m) {
    problems.push(`video slot "${slot.id}" has no entry in src/videos.manifest.json`)
    continue
  }
  // a featured slot must point at a configured project (its title + link)
  if (slot.project && !projects.some((p) => p.id === slot.project))
    problems.push(`featured slot "${slot.id}" names project "${slot.project}", which is not in \`projects\``)
  for (const key of [
    'desktop', 'desktopHd', 'mobile', 'mobileHd', 'portrait', 'portraitHd',
    'poster', 'posterHd', 'posterMobile', 'posterMobileHd', 'posterPortrait', 'posterPortraitHd',
    'posterFirst', 'posterFirstHd',
  ]) {
    if (!m[key]) continue
    const rel = `public/videos/${m[key]}`
    if (!existsSync(resolve(PUB, 'videos', m[key]))) miss(rel, `video slot "${slot.id}" ${key}`)
  }
  for (const key of ['mobileHd', 'portrait', 'posterMobileHd', 'posterPortrait']) {
    if (!m[key]) problems.push(`video slot "${slot.id}" has no "${key}" in the manifest (run npm run optimize:videos)`)
  }
}

/* ── projects ── */
let pmanifest = {}
try {
  pmanifest = JSON.parse(readFileSync(resolve(ROOT, 'src/projects.manifest.json'), 'utf8'))
} catch {
  problems.push('src/projects.manifest.json missing/unreadable (run npm run optimize:projects)')
}
for (const p of projects) {
  const m = pmanifest[p.id]
  if (!m) {
    problems.push(`config project "${p.id}" is not in src/projects.manifest.json`)
    continue
  }
  if (!m.gallery?.length) problems.push(`project "${p.id}" has an empty gallery in the manifest`)
  for (const room of p.panoramas || []) {
    if (!m.panoramas?.includes(room.file))
      problems.push(`project "${p.id}" labels panorama "${room.file}" but the manifest has no such file`)
  }
  for (const [type, widths] of Object.entries(PROJECT_VARIANTS)) {
    for (const name of m[type] || []) {
      for (const w of widths) {
        const rel = `public/projects/${p.id}/${type}/${name}-${w}.webp`
        if (!existsSync(resolve(ROOT, rel))) miss(rel, `${p.id} ${type}`)
      }
      // the generator needs every image's size to reserve its box (no CLS)
      const d = m.dims?.[`${type}/${name}`]
      if (!(Array.isArray(d) && d[0] > 0 && d[1] > 0))
        problems.push(`project "${p.id}": no dims recorded for ${type}/${name} (run npm run optimize:projects)`)
    }
  }

  /* ── portfolio page fields (see the PORTFOLIO PAGE FIELDS note in config) ──
   * The generated /portfolio/<id>/ page bakes these into static HTML, so a
   * missing one is a blank heading or an empty <title> on the live site. */
  if (!PORTFOLIO_CATS.has(p.category))
    problems.push(
      `project "${p.id}": category "${p.category}" is not one of ${[...PORTFOLIO_CATS].join(' | ')}`
    )
  for (const k of PORTFOLIO_TEXT)
    if (!String(p[k] ?? '').trim()) problems.push(`project "${p.id}": portfolio field "${k}" is missing`)
  if (p.area != null && !(Number(p.area) > 0))
    problems.push(`project "${p.id}": area must be a positive number of square metres (or omitted)`)
  if (p.cover && !(m.gallery || []).includes(p.cover))
    problems.push(`project "${p.id}": cover "${p.cover}" is not in its gallery`)
  for (const k of p.todo || [])
    if (!PORTFOLIO_TODO.has(k))
      problems.push(`project "${p.id}": unknown todo group "${k}" (${[...PORTFOLIO_TODO].join(' | ')})`)
  const og = `public/projects/${p.id}/og.jpg`
  if (!existsSync(resolve(ROOT, og))) miss(og, `${p.id} social card for /portfolio/${p.id}/`)
}
for (const c of portfolio.categories)
  if (!PORTFOLIO_CATS.has(c)) problems.push(`portfolio.categories: unknown category "${c}"`)

/* ── catalogues, strip frames, social card ── */
for (const c of catalogs) {
  const rel = `public/catalogs/${c.id}.pdf`
  if (!existsSync(resolve(ROOT, rel))) miss(rel, 'catalogue')
}
for (const src of strips.portfolio) {
  if (!existsSync(resolve(PUB, '.' + src))) miss(`public${src}`, 'strips.portfolio frame')
}
if (!existsSync(resolve(PUB, 'social/og-card.jpg'))) miss('public/social/og-card.jpg', 'og:image')

if (problems.length) {
  console.error(
    `\n✗ config ↔ assets contract violated — ${problems.length} problem(s):\n` +
      problems.map((p) => `   ${p}`).join('\n') +
      `\n\n  Optimized media is COMMITTED; the deploy build does not regenerate it.` +
      `\n  Fix: run \`npm run assets\` locally (ffmpeg + sharp), then commit the` +
      `\n  changes under public/ and src/*.manifest.json.\n`
  )
  process.exit(1)
}
console.log(
  '✓ config ↔ assets contract holds (videos, projects + portfolio fields, catalogues, strips, social cards)'
)
