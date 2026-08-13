/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — project asset optimization (gallery + sketches + panoramas).
 * ─────────────────────────────────────────────────────────────────────────
 *  A project is a PROPERTY (a whole apartment/house/office), one folder per
 *  project, walked by this script — no filename prefixes, no per-file config:
 *
 *   in : assets/projects/<project-id>/
 *            gallery/    01.jpg 02.jpg …          finished photos, in order
 *            sketches/   01.jpg 02.jpg …          plans / drawings (optional)
 *            panoramas/  <room-name>.jpg …        360° equirects (optional)
 *
 *   out: public/projects/<project-id>/
 *            gallery/<name>-{1600,900}.webp       q80 — photos
 *            sketches/<name>-{3000,1000}.webp     q85 — drawings carry fine
 *                                                 linework (3000 keeps an A2
 *                                                 plan sheet's dimension text
 *                                                 readable in the zoom view);
 *                                                 near-white plans compress
 *                                                 well anyway
 *            panoramas/<name>-{4096,2048}.webp    q78 — 4096 is a safe max
 *                                                 GPU texture size (2048 mobile)
 *
 *  Also emits src/projects.manifest.json — { [id]: {gallery, sketches,
 *  panoramas} } (sorted base names) — which main.js imports to build the
 *  cards, the overlay sequence, the Проект tab and the 360° room switcher.
 *  The manifest is COMMITTED (like videos.manifest.json) so a bare
 *  `vite build` never lacks it.
 *
 *  CONFIG ↔ ASSETS CONTRACT (this is the build gate — it exits 1):
 *    • every project in src/sections.config.js must have a folder with a
 *      non-empty gallery/;
 *    • every room listed in a project's `panoramas` config (the bilingual
 *      labels) must have its file in panoramas/.
 *  A folder with no config entry, or a panorama file with no label, is only
 *  WARNED about (it simply won't show).
 *
 *  Never upscales; skips files whose outputs are newer than the source.
 *  Run: npm run optimize:projects   (also part of `npm run assets`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve, parse } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { projects as configProjects } from '../src/sections.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'assets/projects')
const OUT = resolve(ROOT, 'public/projects')
const MANIFEST = resolve(ROOT, 'src/projects.manifest.json')

const TYPES = {
  gallery: { widths: [1600, 900], quality: 80 },
  sketches: { widths: [3000, 1000], quality: 85 },
  panoramas: { widths: [4096, 2048], quality: 78, equirect: true },
}

const KB = (b) => (b / 1024).toFixed(0) + ' KB'
const MB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB'
const IMG = /\.(jpe?g|png|webp|tiff?|avif)$/i

async function fresh(outFile, srcMtime) {
  try {
    return (await stat(outFile)).mtimeMs > srcMtime
  } catch {
    return false
  }
}

async function listDir(dir, { dirsOnly = false } = {}) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => (dirsOnly ? e.isDirectory() : e.isFile() && IMG.test(e.name)))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}

async function main() {
  const ids = await listDir(SRC, { dirsOnly: true })
  const manifest = {}
  let rawTotal = 0
  let outTotal = 0

  for (const id of ids) {
    manifest[id] = { gallery: [], sketches: [], panoramas: [] }
    console.log(`\n🏠 ${id}`)

    for (const [type, prof] of Object.entries(TYPES)) {
      const files = await listDir(resolve(SRC, id, type))
      if (!files.length) continue
      const outDir = resolve(OUT, id, type)
      await mkdir(outDir, { recursive: true })

      for (const f of files) {
        const name = parse(f).name
        manifest[id][type].push(name)
        const input = resolve(SRC, id, type, f)
        const srcStat = await stat(input)
        rawTotal += srcStat.size

        const meta = prof.equirect ? await sharp(input).metadata() : null
        if (meta && Math.abs(meta.width / meta.height - 2) > 0.05) {
          console.warn(
            `   ⚠ ${type}/${f}: ${meta.width}×${meta.height} is not ~2:1 equirectangular — will look stretched`
          )
        }

        const sizes = []
        for (const w of prof.widths) {
          const outFile = resolve(outDir, `${name}-${w}.webp`)
          if (!(await fresh(outFile, srcStat.mtimeMs))) {
            await sharp(input)
              .resize({ width: w, withoutEnlargement: true })
              .webp({ quality: prof.quality })
              .toFile(outFile)
          }
          const bytes = (await stat(outFile)).size
          outTotal += bytes
          sizes.push(`${w}: ${KB(bytes)}`)
        }
        console.log(
          `   ✓ ${type.padEnd(9)} ${name.padEnd(8)} raw ${KB(srcStat.size).padStart(8)}  →  ${sizes.join('   ')}`
        )
      }
    }
  }

  /* ── config ↔ assets contract ── */
  const problems = []
  for (const p of configProjects) {
    const m = manifest[p.id]
    if (!m) {
      problems.push(`config project "${p.id}" has no folder assets/projects/${p.id}/`)
      continue
    }
    if (!m.gallery.length)
      problems.push(`config project "${p.id}" has an empty assets/projects/${p.id}/gallery/`)
    for (const room of p.panoramas || []) {
      if (!m.panoramas.includes(room.file))
        problems.push(
          `config project "${p.id}" labels panorama "${room.file}" but assets/projects/${p.id}/panoramas/${room.file}.* does not exist`
        )
    }
    const labelled = new Set((p.panoramas || []).map((r) => r.file))
    for (const file of m.panoramas)
      if (!labelled.has(file))
        console.warn(
          `⚠ ${p.id}: panoramas/${file} has no label in the config's \`panoramas\` list — it will not be shown`
        )
  }
  const configured = new Set(configProjects.map((p) => p.id))
  for (const id of ids)
    if (!configured.has(id))
      console.warn(`⚠ assets/projects/${id}/ has no entry in src/sections.config.js — it will not be shown`)

  if (problems.length) {
    console.error(`\n✗ config ↔ assets contract violated:\n   ${problems.join('\n   ')}\n`)
    process.exit(1)
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
  console.log(
    `\n📦 Projects: raw ${MB(rawTotal)} → optimized ${MB(outTotal)} total (all variants).` +
      `\n   Manifest: src/projects.manifest.json (${ids.length} project(s)). A visitor loads ONE` +
      `\n   panorama texture at a time (4096 desktop / 2048 mobile), only inside an open overlay.\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
