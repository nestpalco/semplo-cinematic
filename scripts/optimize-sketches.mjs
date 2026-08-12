/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — project SKETCH optimization (drawings, plans, visualizations
 *  shown in the Проект/Project tab of a project's detail overlay).
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /assets/sketches/<projectId>-NN.jpg|png|webp
 *        (e.g. living-01.jpg — the id must match the project's `id` in
 *        src/sections.config.js, NN keeps them ordered)
 *   out: /public/sketches/<name>-2000.webp   zoomed-in view (fine linework)
 *        /public/sketches/<name>-1000.webp   in-flow view
 *
 *  Drawings are not photographs: linework smears at photo-grade compression
 *  and detail is the whole point, so these encode LARGER (2000px for the
 *  zoom view) and at a HIGHER quality (85 vs the photos' 80) — a near-white
 *  plan compresses so well that the files stay small anyway.
 *
 *  A missing or empty assets/sketches/ is fine (not every project has
 *  drawings); the script simply reports nothing to do. Never upscales;
 *  skips files whose outputs are newer than the source.
 *  Run: npm run optimize:sketches   (also part of `npm run assets`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'assets/sketches')
const OUT = resolve(ROOT, 'public/sketches')

const WIDTHS = [2000, 1000]
const QUALITY = 85

const KB = (b) => (b / 1024).toFixed(0) + ' KB'
const MB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB'

async function fresh(outFile, srcMtime) {
  try {
    return (await stat(outFile)).mtimeMs > srcMtime
  } catch {
    return false
  }
}

async function main() {
  let files = []
  try {
    files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  } catch {
    // no assets/sketches directory at all — nothing to do, and that is fine
  }
  if (files.length === 0) {
    console.log('\n✏️  No project sketches in assets/sketches/ — skipping.\n')
    return
  }

  await mkdir(OUT, { recursive: true })
  let rawTotal = 0
  let outTotal = 0
  console.log(`\n✏️  Optimizing ${files.length} project sketch(es)…\n`)

  for (const f of files.sort()) {
    const name = parse(f).name
    const input = resolve(SRC, f)
    const srcStat = await stat(input)
    rawTotal += srcStat.size

    const sizes = []
    for (const w of WIDTHS) {
      const outFile = resolve(OUT, `${name}-${w}.webp`)
      if (!(await fresh(outFile, srcStat.mtimeMs))) {
        await sharp(input)
          .resize({ width: w, withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toFile(outFile)
      }
      const bytes = (await stat(outFile)).size
      outTotal += bytes
      sizes.push(`${w}: ${KB(bytes)}`)
    }
    console.log(`✓ ${name.padEnd(10)} raw ${KB(srcStat.size).padStart(8)}  →  ${sizes.join('   ')}`)
  }

  console.log(`\n📐 Sketches: raw ${MB(rawTotal)} → optimized ${MB(outTotal)} total (all variants).\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
