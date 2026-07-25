/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — video optimization pipeline (calm, forward-playback page).
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /assets/videos/<raw kling clip>.mp4   (named in src/sections.config.js)
 *   out: /public/videos/<id>-{1600|1280}.mp4    desktop clip
 *        /public/videos/<id>-720.mp4            mobile clip
 *        /public/videos/<id>-poster.webp        poster (first OR last frame)
 *        /public/videos/<id>-poster-720.webp    poster (mobile / no-JS)
 *        /src/videos.manifest.json              sizes, dims, duration, fps
 *
 *  Two encode families:
 *   • scrubVideo slots (PATTERN B — scroll drives video.currentTime on desktop)
 *     need FREQUENT KEYFRAMES for smooth seeking: sparse keyframes mean every
 *     seek decodes forward from the last keyframe = visible stutter. Their
 *     DESKTOP variant uses gop 3 (keyframe ~every 0.12s) — bigger, worth it.
 *     Their MOBILE variant still autoplays forward → long GOP, small.
 *   • plain slots autoplay forward everywhere → long GOP throughout.
 *  We crop the source watermark and strip audio. The hero is encoded a touch
 *  larger + higher quality (it is THE moment).
 *
 *  posterFrame: 'last' grabs the FINAL frame for the poster (the hero's payoff —
 *  the finished room). Default 'first'.
 *
 *  Run: npm run optimize:videos  (also runs before `npm run dev` / `build`).
 * ─────────────────────────────────────────────────────────────────────────
 */
import { spawnSync } from 'node:child_process'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import ffprobeInstaller from '@ffprobe-installer/ffprobe'

const FFMPEG = ffmpegInstaller.path
const FFPROBE = ffprobeInstaller.path

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SRC = resolve(ROOT, 'assets/videos')
const OUT = resolve(ROOT, 'public/videos')
const MANIFEST = resolve(ROOT, 'src/videos.manifest.json')

// Encode profiles per role. All long-GOP (forward playback), audio stripped.
//   hero    — the signature clip: larger, higher quality.
//   ambient — quiet background loops: smaller, compress harder.
const PROFILES = {
  hero:    { desktop: { maxSide: 1600, gop: 48, crf: 22 }, mobile: { maxSide: 720, gop: 48, crf: 27 } },
  ambient: { desktop: { maxSide: 1280, gop: 48, crf: 25 }, mobile: { maxSide: 720, gop: 48, crf: 29 } },
}
const POSTER_Q = 80

const KB = (b) => (b / 1024).toFixed(0) + ' KB'
const MB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB'

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (r.status !== 0) {
    throw new Error(`${bin} failed (${r.status})\n${r.stderr || r.stdout || ''}`)
  }
  return r.stdout
}

function probe(file) {
  const out = run(FFPROBE, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-show_entries', 'format=duration',
    '-of', 'json',
    file,
  ])
  const j = JSON.parse(out)
  const s = j.streams[0]
  const [n, d] = s.r_frame_rate.split('/').map(Number)
  return {
    width: s.width,
    height: s.height,
    fps: +(n / (d || 1)).toFixed(3),
    duration: +(s.duration || j.format.duration),
  }
}

// crop = fraction of HEIGHT trimmed off the bottom (watermark), then scale the
// long side to maxSide. Both crop + scale keep dimensions even (yuv420p needs it).
function vf(maxSide, crop) {
  const chain = []
  if (crop > 0) chain.push(`crop=iw:trunc(ih*${(1 - crop).toFixed(4)}/2)*2:0:0`)
  chain.push(
    `scale='if(gt(iw,ih),${maxSide},-2)':'if(gt(iw,ih),-2,${maxSide})':flags=lanczos`
  )
  return chain.join(',')
}

async function encode(input, output, { maxSide, gop, crf }, crop) {
  run(FFMPEG, [
    '-y', '-i', input,
    '-an', // drop audio — clips are muted
    '-vf', vf(maxSide, crop),
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-pix_fmt', 'yuv420p',
    '-g', String(gop),
    '-keyint_min', String(gop),
    '-sc_threshold', '0', // honour the fixed GOP (no surprise scene-cut keyframes)
    '-crf', String(crf),
    '-preset', 'slow', // short clips → afford the better compression
    '-movflags', '+faststart', // moov atom up front → plays while loading
    output,
  ])
  return (await stat(output)).size
}

// frame: 'first' (default) or 'last'. 'last' seeks to just before the end so the
// poster is the final, settled frame (the furnished room for the hero).
async function poster(input, output, maxSide, crop, frame, duration) {
  const seek = frame === 'last' ? ['-ss', String(Math.max(0, duration - 0.1))] : []
  run(FFMPEG, [
    '-y', ...seek, '-i', input,
    '-frames:v', '1',
    '-vf', vf(maxSide, crop),
    '-c:v', 'libwebp', '-quality', String(POSTER_Q),
    output,
  ])
  return (await stat(output)).size
}

async function main() {
  await mkdir(OUT, { recursive: true })

  let slots = []
  try {
    const cfg = await import(pathToFileURL(resolve(ROOT, 'src/sections.config.js')).href)
    // ONE list of every video slot on the page: the hero, then the ambient loops.
    slots = [cfg.hero, ...(cfg.ambients || [])].filter(Boolean)
  } catch (e) {
    console.error('Could not read src/sections.config.js —', e.message)
    process.exit(1)
  }

  const manifest = {}
  let rawTotal = 0
  let deskTotal = 0
  let mobTotal = 0
  let postTotal = 0

  console.log(`\n🎬 Optimizing ${slots.length} video slot(s)…\n`)

  for (const v of slots) {
    const input = resolve(SRC, v.src)
    if (!existsSync(input)) {
      console.error(`✗ ${String(v.id).padEnd(9)} missing source: assets/videos/${v.src}`)
      continue
    }
    const role = v.role === 'hero' ? 'hero' : 'ambient'
    const prof = structuredClone(PROFILES[role])
    // PATTERN B slots: desktop variant re-encoded with frequent keyframes so
    // scroll-driven seeking is smooth (gop 3 ≈ a keyframe every 0.12s @24fps).
    // Frequent keyframes cost bitrate, so cap the scrub variant at 1440 wide —
    // at 1600 the hero landed at 4.2 MB; 1440 keeps it nearer 3.
    if (v.scrubVideo) {
      prof.desktop = { ...prof.desktop, gop: 3, maxSide: Math.min(prof.desktop.maxSide, 1440) }
    }
    // optional per-slot quality override (higher crf = smaller). Useful for clean
    // high-res sources that stay crisp at a higher crf (e.g. a 4K master).
    if (v.crf) prof.desktop = { ...prof.desktop, crf: v.crf }
    const crop = v.cropWatermark ?? 0
    const meta = probe(input)
    const rawBytes = (await stat(input)).size

    const dside = prof.desktop.maxSide
    const deskFile = `${v.id}-${dside}.mp4`
    const mobFile = `${v.id}-720.mp4`
    const postFile = `${v.id}-poster.webp`
    const postMobFile = `${v.id}-poster-720.webp`

    const deskBytes = await encode(input, resolve(OUT, deskFile), prof.desktop, crop)
    const mobBytes = await encode(input, resolve(OUT, mobFile), prof.mobile, crop)
    const pf = v.posterFrame === 'last' ? 'last' : 'first'
    const postBytes = await poster(input, resolve(OUT, postFile), prof.desktop.maxSide, crop, pf, meta.duration)
    const postMobBytes = await poster(input, resolve(OUT, postMobFile), prof.mobile.maxSide, crop, pf, meta.duration)
    // scrub slots whose poster is the LAST frame also get a FIRST-frame poster —
    // scrub mode starts at frame 0, so its underlay must match frame 0.
    let postFirstFile = null
    if (v.scrubVideo && pf === 'last') {
      postFirstFile = `${v.id}-poster-first.webp`
      await poster(input, resolve(OUT, postFirstFile), prof.desktop.maxSide, crop, 'first', meta.duration)
    }

    const outMeta = probe(resolve(OUT, deskFile))

    manifest[v.id] = {
      role,
      scrub: !!v.scrubVideo, // desktop variant is frequent-keyframe (seekable)
      desktop: deskFile,
      mobile: mobFile,
      poster: postFile,
      posterMobile: postMobFile,
      ...(postFirstFile ? { posterFirst: postFirstFile } : {}),
      posterFrame: pf,
      width: outMeta.width,
      height: outMeta.height,
      aspect: +(outMeta.width / outMeta.height).toFixed(4),
      duration: +meta.duration.toFixed(3),
      fps: meta.fps,
      bytes: { desktop: deskBytes, mobile: mobBytes, poster: postBytes, posterMobile: postMobBytes },
    }

    rawTotal += rawBytes
    deskTotal += deskBytes
    mobTotal += mobBytes
    postTotal += postBytes + postMobBytes

    const pct = ((deskBytes / rawBytes) * 100).toFixed(0)
    console.log(
      `✓ ${String(v.id).padEnd(9)} ${role.padEnd(7)} ${meta.width}×${meta.height} ${meta.duration.toFixed(1)}s` +
        `  raw ${KB(rawBytes).padStart(8)} → desktop ${KB(deskBytes).padStart(8)} (${pct}%)` +
        `  mobile ${KB(mobBytes).padStart(7)}  poster ${KB(postBytes).padStart(7)} [${pf}]` +
        (crop ? `  wm-crop ${Math.round(crop * 100)}%` : '')
    )
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')

  console.log(
    `\n📦 ${Object.keys(manifest).length} slot(s) optimized.\n` +
      `   Raw sources : ${MB(rawTotal)}\n` +
      `   Desktop set : ${MB(deskTotal)}  (lazy-loaded — never all at once)\n` +
      `   Mobile set  : ${MB(mobTotal)}\n` +
      `   Posters     : ${MB(postTotal)}\n` +
      `   Manifest → src/videos.manifest.json\n`
  )
  console.log(
    `   Initial paint loads: HTML + CSS + JS + the hero poster only.\n` +
      `   The hero clip streams next; ambient clips load lazily as you reach them.\n`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
