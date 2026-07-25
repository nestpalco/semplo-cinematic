/*
 * Flat-photo optimization pipeline (the Vellora-style forward-glide hero).
 *   in : /assets/scenes/<id>.{jpg,png,webp,tiff}   (your flat interior stills)
 *   out: /public/scenes/<id>-<width>.webp           (sized WebP variants)
 *        /src/scenes.manifest.json                   (sizes + LQIP + base colour)
 *
 * These are FLAT photographs (any aspect) used as full-bleed hero layers that we
 * dolly INTO. We resize + re-encode to WebP at two widths and never upscale:
 *   • 1600 — desktop hero layer (covers a full viewport; the dolly zooms within it)
 *   • 900  — mobile / low-power layer (~⅓ the pixels)
 * Plus a tiny blurred LQIP (data URI) and a dominant colour, so a scene is never
 * a blank flash before its WebP decodes.
 *
 * Run: npm run optimize:scenes  (also runs before `npm run dev` / `npm run build`)
 */
import sharp from 'sharp'
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve, extname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../assets/scenes')
const OUT = resolve(__dirname, '../public/scenes')
const MANIFEST = resolve(__dirname, '../src/scenes.manifest.json')

const EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif'])
const WIDTHS = [900, 1600] // [mobile, desktop]
const QUALITY = 80 // flat photos read closer than a sphere → a touch higher quality

function pickWidths(originalWidth) {
  const fit = WIDTHS.filter((w) => w <= originalWidth)
  // always include the original width too (capped at the largest target) so we
  // ship the sharpest layer we can without upscaling.
  if (!fit.includes(originalWidth) && originalWidth < WIDTHS[WIDTHS.length - 1]) fit.push(originalWidth)
  return fit.length ? [...new Set(fit)].sort((a, b) => a - b) : [originalWidth]
}

async function main() {
  await mkdir(OUT, { recursive: true })
  if (!existsSync(SRC)) await mkdir(SRC, { recursive: true })

  // Read the scene order/ids from the single config so reporting matches the site.
  let order = []
  try {
    const cfgUrl = pathToFileURL(resolve(__dirname, '../src/scenes.config.js')).href
    const { scenes } = await import(cfgUrl)
    order = scenes.map((s) => s.id)
  } catch {
    /* config not present yet — just process whatever is in the folder */
  }

  const files = (await readdir(SRC)).filter((f) => EXT.has(extname(f).toLowerCase()))
  const manifest = {}
  let grand = 0

  if (!files.length) {
    console.log('ℹ  No scenes in assets/scenes/ yet. Add <scene-id>.jpg files.')
  }

  for (const f of files) {
    const base = basename(f, extname(f))
    const input = resolve(SRC, f)
    const meta = await sharp(input).metadata()

    const variants = []
    let sceneBytes = 0
    for (const w of pickWidths(meta.width)) {
      const file = `${base}-${w}.webp`
      await sharp(input).resize({ width: w }).webp({ quality: QUALITY, effort: 5 }).toFile(resolve(OUT, file))
      const bytes = (await stat(resolve(OUT, file))).size
      sceneBytes += bytes
      variants.push({ w, file, bytes })
    }

    // Tiny blurred LQIP (data URI) + a flat dominant colour shown under the layer
    // before the WebP decodes (so a scene change is never a blank flash).
    const lqipBuf = await sharp(input).resize({ width: 24 }).webp({ quality: 40 }).toBuffer()
    const lqip = `data:image/webp;base64,${lqipBuf.toString('base64')}`
    const { dominant } = await sharp(input).resize({ width: 64 }).stats()
    const hex = '#' + [dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, '0')).join('')

    manifest[base] = {
      width: meta.width,
      height: meta.height,
      aspect: +(meta.width / meta.height).toFixed(4),
      variants, // [{w,file,bytes}] sorted small→large
      lqip,
      color: hex,
    }
    grand += sceneBytes
    const sizes = variants.map((v) => `${v.w}(${(v.bytes / 1024).toFixed(0)}K)`).join(' ')
    console.log(`✓ ${base.padEnd(10)} ${meta.width}×${meta.height}  →  ${sizes}  =  ${(sceneBytes / 1024).toFixed(0)} KB`)
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')

  if (files.length) {
    const ids = order.length ? order.filter((id) => manifest[id]) : Object.keys(manifest)
    const sumAt = (i) => ids.reduce((t, id) => t + (manifest[id].variants[i]?.bytes ?? manifest[id].variants.at(-1).bytes), 0)
    console.log(`\n📦 ${ids.length} scene(s).`)
    console.log(`   Desktop: ${(sumAt(1) / 1024 / 1024).toFixed(2)} MB total  ·  Mobile: ${(sumAt(0) / 1024 / 1024).toFixed(2)} MB total`)
    console.log('   Manifest →', MANIFEST.replace(resolve(__dirname, '..') + '\\', '').replace(/\\/g, '/'))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
