/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — project photo optimization (real portfolio imagery).
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /assets/projects/<name>.jpg   (downloaded from semplodesign.com —
 *        assets/projects/source-manifest.json maps each file → source URL)
 *   out: /public/projects/<name>-1600.webp   gallery covers + overlay frames
 *        /public/projects/<name>-900.webp    mobile covers
 *
 *  Never upscales; skips files whose outputs are newer than the source.
 *  Run: npm run optimize:projects   (also part of `npm run assets`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'assets/projects')
const OUT = resolve(ROOT, 'public/projects')

const WIDTHS = [1600, 900]
const QUALITY = 80

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
  await mkdir(OUT, { recursive: true })
  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))

  let rawTotal = 0
  let outTotal = 0
  console.log(`\n🖼  Optimizing ${files.length} project photo(s)…\n`)

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
    console.log(`✓ ${name.padEnd(8)} raw ${KB(srcStat.size).padStart(8)}  →  ${sizes.join('   ')}`)
  }

  console.log(`\n📦 Project photos: raw ${MB(rawTotal)} → optimized ${MB(outTotal)} total (all variants).`)
  console.log(`   Source mapping: assets/projects/source-manifest.json (ours → semplodesign.com)\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
