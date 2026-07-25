/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — 360° panorama optimization (for the project-detail viewer).
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /assets/panoramas/<id>.jpg   (equirectangular 2:1, e.g. 8000×4000)
 *   out: /public/panoramas/<id>-4096.webp   desktop texture
 *        /public/panoramas/<id>-2048.webp   mobile / low-power texture
 *
 *  The viewer (src/pano.js, lazy-loaded with Three.js when a project overlay
 *  opens) maps these onto an inverted sphere. 4096 is a safe max texture size
 *  for desktop GPUs; 2048 for mobile. Never upscales. Skips files whose
 *  outputs are already newer than the source.
 *
 *  Run: npm run optimize:panoramas   (also part of `npm run assets`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdir, readdir, stat } from 'node:fs/promises'
import { dirname, resolve, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'assets/panoramas')
const OUT = resolve(ROOT, 'public/panoramas')

const WIDTHS = [4096, 2048]
const QUALITY = 78

const MB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB'
const KB = (b) => (b / 1024).toFixed(0) + ' KB'

async function fresh(outFile, srcMtime) {
  try {
    return (await stat(outFile)).mtimeMs > srcMtime
  } catch {
    return false
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png|webp|tiff?|avif)$/i.test(f))

  let rawTotal = 0
  let outTotal = 0
  console.log(`\n🌐 Optimizing ${files.length} panorama(s)…\n`)

  for (const f of files) {
    const id = parse(f).name
    const input = resolve(SRC, f)
    const srcStat = await stat(input)
    rawTotal += srcStat.size

    const meta = await sharp(input).metadata()
    const ratio = meta.width / meta.height
    if (Math.abs(ratio - 2) > 0.05) {
      console.warn(`⚠ ${id}: ${meta.width}×${meta.height} is not ~2:1 equirectangular — will look stretched`)
    }

    const sizes = []
    for (const w of WIDTHS) {
      const outFile = resolve(OUT, `${id}-${w}.webp`)
      if (!(await fresh(outFile, srcStat.mtimeMs))) {
        await sharp(input)
          .resize({ width: Math.min(w, meta.width), withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toFile(outFile)
      }
      const bytes = (await stat(outFile)).size
      outTotal += bytes
      sizes.push(`${w}: ${KB(bytes)}`)
    }
    console.log(`✓ ${id.padEnd(9)} ${meta.width}×${meta.height}  raw ${MB(srcStat.size).padStart(9)}  →  ${sizes.join('   ')}`)
  }

  console.log(
    `\n📦 Panoramas: raw ${MB(rawTotal)} → optimized ${MB(outTotal)} total.\n` +
      `   A visitor loads ONE texture per opened project (4096 desktop / 2048 mobile),\n` +
      `   and only when they open a project that has a panorama.\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
