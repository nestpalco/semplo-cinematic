/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — social link-preview card.
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /public/videos/hero-poster.webp   (written by optimize-videos.mjs —
 *                                           the hero's LAST frame, i.e. the
 *                                           finished, furnished room)
 *   out: /public/social/og-card.jpg        1200×630 JPEG
 *
 *  ── WHY A JPEG, when the whole site is WebP ──────────────────────────────
 *  Every image the PAGE loads stays WebP — smaller, and every browser that
 *  matters supports it. Link-preview scrapers are not browsers: Facebook and
 *  LinkedIn do not render WebP og:image, so the card comes up blank in exactly
 *  the two places a studio's work gets shared. This one asset is therefore a
 *  JPEG. Nothing else changes format.
 *
 *  ── WHY 1200×630 ────────────────────────────────────────────────────────
 *  1.91:1 is the aspect Facebook, LinkedIn and X all crop their large cards to,
 *  and 1200×630 is the smallest size that stays sharp on a 2× display without
 *  being needlessly heavy. The hero poster is 1440×810 (16:9 = 1.78), so it is
 *  center-cropped, not squeezed — `fit: cover` trims ~22px off the top and
 *  bottom of a 1200-wide frame. 1440 ≥ 1200 means it never upscales.
 *
 *  ── WHY IT IS COMMITTED (unlike public/videos/) ─────────────────────────
 *  public/social/ is NOT gitignored, on purpose, and for the same reason
 *  src/videos.manifest.json isn't: a build that skips the asset step (`vite
 *  build` on its own, as `npm run test:e2e` does) must still produce a deploy
 *  with a working og:image. Regenerated on every real deploy by `npm run
 *  assets`, so it cannot go stale against the hero clip.
 *
 *  Run: npm run optimize:social  (also runs as part of `npm run assets`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'public/videos/hero-poster.webp')
const OUT_DIR = resolve(ROOT, 'public/social')
const OUT = resolve(OUT_DIR, 'og-card.jpg')

const CARD = { width: 1200, height: 630 }
const QUALITY = 82 // mozjpeg at 82 keeps the card well under 200 KB

const KB = (b) => (b / 1024).toFixed(0) + ' KB'

async function main() {
  if (!existsSync(SRC)) {
    console.error(
      `✗ missing ${SRC.replace(ROOT + '\\', '').replace(ROOT + '/', '')}\n` +
        `  Run \`npm run optimize:videos\` first — the card is cut from the hero poster.`
    )
    process.exit(1)
  }
  await mkdir(OUT_DIR, { recursive: true })

  const src = await sharp(SRC).metadata()
  if (src.width < CARD.width) {
    console.warn(
      `⚠ hero poster is only ${src.width}px wide — the ${CARD.width}px card will be upscaled.`
    )
  }

  await sharp(SRC)
    .resize(CARD.width, CARD.height, { fit: 'cover', position: 'centre' })
    .toColorspace('srgb') // scrapers assume sRGB; don't ship a tagged wide gamut
    .jpeg({ quality: QUALITY, mozjpeg: true, progressive: true, chromaSubsampling: '4:2:0' })
    .toFile(OUT)

  const out = await sharp(OUT).metadata()
  const bytes = (await stat(OUT)).size
  console.log(
    `\n🔗 Social card\n` +
      `   ${src.width}×${src.height} ${src.format} → ${out.width}×${out.height} ${out.format}` +
      `  ${KB(bytes)}  (aspect ${(out.width / out.height).toFixed(3)}, target 1.905)\n` +
      `   → public/social/og-card.jpg\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
