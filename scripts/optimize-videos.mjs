/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — video optimization pipeline (calm, forward-playback page).
 * ─────────────────────────────────────────────────────────────────────────
 *   in : /assets/videos/<raw kling clip>.mp4   (named in src/sections.config.js)
 *   out: /public/videos/<id>-1280.mp4           desktop clip (standard tier)
 *        /public/videos/<id>-1920.mp4           desktop clip (HD tier — hero + featured only)
 *        /public/videos/<id>-720.mp4            mobile clip, landscape, DPR 1
 *        /public/videos/<id>-1080.mp4           mobile clip, landscape, DPR ≥ 2
 *        /public/videos/<id>-portrait.mp4       PHONE clip: 9:16 centre crop, ≤ 720×1280
 *        /public/videos/<id>-portrait-hd.mp4    …at ≤ 1080×1920 (only sources tall enough)
 *        /public/videos/<id>-poster.webp        poster (first OR last frame)
 *        /public/videos/<id>-poster-1920.webp   poster, HD tier
 *        /public/videos/<id>-poster-720.webp    poster (mobile / no-JS)
 *        /public/videos/<id>-poster-1080.webp   poster, mobile landscape DPR ≥ 2
 *        /public/videos/<id>-poster-portrait[-hd].webp   posters of the portrait crops
 *        /src/videos.manifest.json              sizes, dims, duration, fps
 *
 *  Two encode families:
 *   • scrubVideo slots (PATTERN B — scroll drives video.currentTime on desktop)
 *     need FREQUENT KEYFRAMES for smooth seeking: sparse keyframes mean every
 *     seek decodes forward from the last keyframe = visible stutter. Their
 *     DESKTOP variants use SCRUB_GOP (6 → a keyframe every 0.2 s at 30 fps;
 *     measured 2026-09-23: seeks +1–2 ms vs gop 3, a third fewer bytes at the
 *     same crf, see reports/2026-09-23-video-quality-tiers.md). The hero and
 *     the featured clips are full-bleed on desktop, so they get TWO desktop
 *     tiers (SCRUB.desktop 1280 + SCRUB.hd 1920 — src/video-tier.js picks one
 *     per visitor). Their MOBILE variant still autoplays forward → long GOP.
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
// Sources above this frame rate are resampled down to it. The scrub profile
// keys every 3 frames — at 60 fps that is 20 keyframes/s, twice what the
// 0.68 s scrub smoothing can use, and the file doubles for nothing (the HILL
// SIDE delivery came in at 60 fps: 8.8 MB as-is, ~half at 30). Forward
// playback on mobile does not need 60 fps either.
const FPS_CAP = 30
// Scrub (PATTERN B) encodes — the hero + featured clips. Two desktop tiers:
//   desktop  1280 wide, crf 23   → laptops up to 1440 CSS px
//   hd       1920 wide, crf 25   → wider viewports and DPR ≥ 1.5 screens
// A slot's `crf` override applies to BOTH tiers (the hero: 25 in both).
const SCRUB_GOP = 6 // keyframe cadence of every scrub encode (ambients included)
const SCRUB = {
  desktop: { maxSide: 1280, crf: 23 },
  hd: { maxSide: 1920, crf: 25 },
}
// MOBILE encodes (forward autoplay → the role's long GOP + mobile crf). Two
// landscape widths: 720 for DPR 1 phones/tablets, 1080 for DPR ≥ 2. Measured
// 2026-09-24: a 720 landscape clip on a 390×844 DPR-3 phone has 70–75 % of its
// frame cropped away by object-fit: cover and the visible strip (≈190 px wide)
// painted onto 1170 physical px — a 6× upscale, which is the "low quality on
// mobile" the client saw. See reports/2026-09-24-mobile-video-portrait-tiers.md.
const MOBILE = { sd: { maxSide: 720 }, hd: { maxSide: 1080 } }
// PORTRAIT encodes for phones: the 9:16 CENTRE crop of the frame — exactly the
// strip cover shows on a phone today (every full-bleed section is narrower than
// 9:16 there: hero 0.46, featured 0.47, ambient 0.54), so the composition does
// not move; the file simply stops carrying the 70 % nobody sees and spends its
// pixels on the strip. Never upscaled: `sd` is ≤ 720×1280 and `hd` ≤ 1080×1920,
// each capped at the source height — a 1080p delivery yields one 608×1080 (or
// 560×994 after the watermark crop) portrait file and NO hd variant, since the
// source has no more rows to give. crf 25 (a slot may set `portraitCrf`, the
// ambient loops use 27), 30 fps, long GOP like the other mobile files (phones
// play forward, they never scrub).
const PORTRAIT = { aspect: 9 / 16, sd: { height: 1280 }, hd: { height: 1920 }, crf: 25 }

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
// portrait = { height } → after the watermark crop, take the 9:16 CENTRE column
// and scale it to at most that height (never up).
function vf(maxSide, crop, fps = 0, portrait = null) {
  const chain = []
  if (fps > 0) chain.push(`fps=${fps}`) // cap a 60 fps delivery (see FPS_CAP)
  if (crop > 0) chain.push(`crop=iw:trunc(ih*${(1 - crop).toFixed(4)}/2)*2:0:0`)
  if (portrait) {
    chain.push(`crop=trunc(ih*${PORTRAIT.aspect.toFixed(6)}/2)*2:ih:(iw-ow)/2:0`)
    chain.push(`scale=-2:'min(${portrait.height},ih)':flags=lanczos`)
  } else {
    chain.push(
      `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))':flags=lanczos`
    )
  }
  return chain.join(',')
}

// trimStart (seconds) drops the head of the source — for a delivered clip whose
// opening frames are unusable (e.g. the camera still revealing off-frame black).
// Applied as an INPUT seek, so timestamps restart at 0 and the poster / scrub
// duration all refer to the trimmed clip.
async function encode(input, output, { maxSide, gop, crf, portrait = null }, crop, trimStart = 0, fps = 0) {
  run(FFMPEG, [
    '-y', ...(trimStart > 0 ? ['-ss', String(trimStart)] : []), '-i', input,
    '-an', // drop audio — clips are muted
    '-vf', vf(maxSide, crop, fps, portrait),
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
async function poster(input, output, maxSide, crop, frame, duration, trimStart = 0, quality = POSTER_Q, portrait = null) {
  // `duration` is the TRIMMED length; the seek is into the untrimmed source
  const seek = ['-ss', String(frame === 'last' ? Math.max(0, trimStart + duration - 0.1) : trimStart)]
  run(FFMPEG, [
    '-y', ...seek, '-i', input,
    '-frames:v', '1',
    '-vf', vf(maxSide, crop, 0, portrait),
    '-c:v', 'libwebp', '-quality', String(quality),
    output,
  ])
  return (await stat(output)).size
}

async function main() {
  await mkdir(OUT, { recursive: true })

  let slots = []
  try {
    const cfg = await import(pathToFileURL(resolve(ROOT, 'src/sections.config.js')).href)
    // ONE list of every video slot on the page: the hero, the ambient loops,
    // and the three FEATURED project clips (homepage "Избрани проекти").
    slots = [cfg.hero, ...(cfg.ambients || []), ...(cfg.featured || [])].filter(Boolean)
  } catch (e) {
    console.error('Could not read src/sections.config.js —', e.message)
    process.exit(1)
  }

  const manifest = {}
  let rawTotal = 0
  let deskTotal = 0
  let hdTotal = 0
  let mobTotal = 0
  let mobHdTotal = 0
  let portTotal = 0
  let portHdTotal = 0
  let postTotal = 0

  console.log(`\n🎬 Optimizing ${slots.length} video slot(s)…\n`)

  for (const v of slots) {
    let input = resolve(SRC, v.src)
    // FEATURED slots name the clip the client will deliver (`src`) and a
    // `placeholderSrc` to encode until it lands — so dropping the real file
    // into assets/videos/ and re-running this script is the whole swap.
    let placeholder = false
    if (!existsSync(input) && v.placeholderSrc && existsSync(resolve(SRC, v.placeholderSrc))) {
      console.warn(
        `⚠ ${String(v.id).padEnd(9)} assets/videos/${v.src} not delivered yet — encoding the PLACEHOLDER ${v.placeholderSrc}`
      )
      input = resolve(SRC, v.placeholderSrc)
      placeholder = true
    }
    if (!existsSync(input)) {
      console.error(`✗ ${String(v.id).padEnd(9)} missing source: assets/videos/${v.src}`)
      continue
    }
    const role = v.role === 'hero' ? 'hero' : 'ambient' // featured clips use the ambient profile
    const prof = structuredClone(PROFILES[role])
    // PATTERN B slots: desktop variants re-encoded with FREQUENT keyframes so
    // scroll-driven seeking is smooth (SCRUB_GOP). The hero + featured clips are
    // the full-bleed moments and get the two-tier SCRUB profiles (1280 standard
    // + 1920 HD); the ambient loops keep their own single 1280 file, only with
    // the scrub keyframe cadence.
    const tiered = v.scrubVideo && (v.role === 'hero' || v.role === 'featured')
    if (v.scrubVideo) {
      prof.desktop = tiered
        ? { ...prof.desktop, ...SCRUB.desktop, gop: SCRUB_GOP }
        : { ...prof.desktop, gop: SCRUB_GOP, maxSide: Math.min(prof.desktop.maxSide, 1440) }
      if (tiered) prof.hd = { ...prof.desktop, ...SCRUB.hd }
    }
    // optional per-slot quality override (higher crf = smaller), applied to every
    // desktop tier. For a source that does not reward a lower crf (the hero's
    // Kling 4K master looks the same at 25 and 23 — measured).
    if (v.crf) {
      prof.desktop = { ...prof.desktop, crf: v.crf }
      if (prof.hd) prof.hd = { ...prof.hd, crf: v.crf }
    }
    const pq = v.posterQuality || POSTER_Q // WebP quality of this slot's posters (hero: 85, its poster is the LCP image)
    const crop = v.cropWatermark ?? 0
    const trim = placeholder ? 0 : Math.max(0, +v.trimStart || 0) // head trim applies to the real clip only
    const meta = probe(input)
    if (trim) meta.duration = +(meta.duration - trim).toFixed(3)
    const fpsCap = meta.fps > FPS_CAP + 0.5 ? FPS_CAP : 0
    const rawBytes = (await stat(input)).size

    const dside = prof.desktop.maxSide
    const deskFile = `${v.id}-${dside}.mp4`
    const mobFile = `${v.id}-${MOBILE.sd.maxSide}.mp4`
    const mobHdFile = `${v.id}-${MOBILE.hd.maxSide}.mp4`
    const portFile = `${v.id}-portrait.mp4`
    const postFile = `${v.id}-poster.webp`
    const postMobFile = `${v.id}-poster-${MOBILE.sd.maxSide}.webp`
    const postMobHdFile = `${v.id}-poster-${MOBILE.hd.maxSide}.webp`
    const postPortFile = `${v.id}-poster-portrait.webp`
    // the mobile family: the role's long GOP + mobile crf at two landscape
    // widths, and the portrait crops (crf 25) — see MOBILE / PORTRAIT above
    const mobSd = { ...prof.mobile, ...MOBILE.sd }
    const mobHd = { ...prof.mobile, ...MOBILE.hd }
    // a slot's `portraitCrf` overrides PORTRAIT.crf for both portrait encodes
    // (the ambient loops: background texture, 27; hero + featured stay at 25)
    const portCrf = v.portraitCrf || PORTRAIT.crf
    const portSd = { ...prof.mobile, crf: portCrf, portrait: PORTRAIT.sd }
    // an hd portrait only where the source is taller than the sd cap (a 4K
    // master); a 1080p delivery would just duplicate the sd file
    const srcHeight = Math.round(meta.height * (1 - crop))
    const portHd = srcHeight > PORTRAIT.sd.height ? { ...prof.mobile, crf: portCrf, portrait: PORTRAIT.hd } : null

    const deskBytes = await encode(input, resolve(OUT, deskFile), prof.desktop, crop, trim, fpsCap)
    const mobBytes = await encode(input, resolve(OUT, mobFile), mobSd, crop, trim, fpsCap)
    const mobHdBytes = await encode(input, resolve(OUT, mobHdFile), mobHd, crop, trim, fpsCap)
    const portBytes = await encode(input, resolve(OUT, portFile), portSd, crop, trim, fpsCap)
    let portHdFile = null, portHdBytes = 0, postPortHdFile = null, postPortHdBytes = 0
    const pf = v.posterFrame === 'last' ? 'last' : 'first'
    const postBytes = await poster(input, resolve(OUT, postFile), prof.desktop.maxSide, crop, pf, meta.duration, trim, pq)
    const postMobBytes = await poster(input, resolve(OUT, postMobFile), MOBILE.sd.maxSide, crop, pf, meta.duration, trim, pq)
    const postMobHdBytes = await poster(input, resolve(OUT, postMobHdFile), MOBILE.hd.maxSide, crop, pf, meta.duration, trim, pq)
    const postPortBytes = await poster(input, resolve(OUT, postPortFile), 0, crop, pf, meta.duration, trim, pq, PORTRAIT.sd)
    if (portHd) {
      portHdFile = `${v.id}-portrait-hd.mp4`
      portHdBytes = await encode(input, resolve(OUT, portHdFile), portHd, crop, trim, fpsCap)
      postPortHdFile = `${v.id}-poster-portrait-hd.webp`
      postPortHdBytes = await poster(input, resolve(OUT, postPortHdFile), 0, crop, pf, meta.duration, trim, pq, PORTRAIT.hd)
    }
    // scrub slots whose poster is the LAST frame also get a FIRST-frame poster —
    // scrub mode starts at frame 0, so its underlay must match frame 0.
    let postFirstFile = null
    let postFirstBytes = 0
    if (v.scrubVideo && pf === 'last') {
      postFirstFile = `${v.id}-poster-first.webp`
      postFirstBytes = await poster(input, resolve(OUT, postFirstFile), prof.desktop.maxSide, crop, 'first', meta.duration, trim, pq)
    }
    // HD tier (hero + featured): the 1920 clip + posters at its width, chosen by
    // src/video-tier.js for wide / high-DPR desktops
    let hdFile = null, hdBytes = 0, postHdFile = null, postHdBytes = 0, postFirstHdFile = null, postFirstHdBytes = 0
    if (prof.hd) {
      hdFile = `${v.id}-${prof.hd.maxSide}.mp4`
      hdBytes = await encode(input, resolve(OUT, hdFile), prof.hd, crop, trim, fpsCap)
      postHdFile = `${v.id}-poster-${prof.hd.maxSide}.webp`
      postHdBytes = await poster(input, resolve(OUT, postHdFile), prof.hd.maxSide, crop, pf, meta.duration, trim, pq)
      if (postFirstFile) {
        postFirstHdFile = `${v.id}-poster-first-${prof.hd.maxSide}.webp`
        postFirstHdBytes = await poster(input, resolve(OUT, postFirstHdFile), prof.hd.maxSide, crop, 'first', meta.duration, trim, pq)
      }
    }

    const outMeta = probe(resolve(OUT, deskFile))
    const portMeta = probe(resolve(OUT, portFile))
    const portHdMeta = portHdFile ? probe(resolve(OUT, portHdFile)) : null

    manifest[v.id] = {
      role,
      ...(placeholder ? { placeholder: v.placeholderSrc } : {}), // the real `src` has not landed
      ...(trim ? { trimStart: trim } : {}), // seconds dropped from the head of the source
      scrub: !!v.scrubVideo, // desktop variants are frequent-keyframe (seekable)
      ...(v.scrubVideo ? { gop: SCRUB_GOP } : {}),
      desktop: deskFile,
      ...(hdFile ? { desktopHd: hdFile } : {}), // 1920 tier (hero + featured only)
      mobile: mobFile, // landscape 720 (DPR 1)
      mobileHd: mobHdFile, // landscape 1080 (DPR ≥ 2)
      portrait: portFile, // phones: 9:16 centre crop, ≤ 720×1280 (never upscaled)
      ...(portHdFile ? { portraitHd: portHdFile } : {}), // ≤ 1080×1920, 4K sources only
      portraitSize: [portMeta.width, portMeta.height],
      ...(portHdMeta ? { portraitHdSize: [portHdMeta.width, portHdMeta.height] } : {}),
      poster: postFile,
      ...(postHdFile ? { posterHd: postHdFile } : {}),
      posterMobile: postMobFile,
      posterMobileHd: postMobHdFile,
      posterPortrait: postPortFile,
      ...(postPortHdFile ? { posterPortraitHd: postPortHdFile } : {}),
      ...(postFirstFile ? { posterFirst: postFirstFile } : {}),
      ...(postFirstHdFile ? { posterFirstHd: postFirstHdFile } : {}),
      posterFrame: pf,
      width: outMeta.width,
      height: outMeta.height,
      aspect: +(outMeta.width / outMeta.height).toFixed(4),
      duration: +meta.duration.toFixed(3),
      fps: outMeta.fps, // as encoded (a 60 fps source is capped, see FPS_CAP)
      ...(fpsCap ? { sourceFps: meta.fps } : {}),
      bytes: {
        desktop: deskBytes,
        ...(hdFile ? { desktopHd: hdBytes } : {}),
        mobile: mobBytes,
        mobileHd: mobHdBytes,
        portrait: portBytes,
        ...(portHdFile ? { portraitHd: portHdBytes } : {}),
        poster: postBytes,
        ...(postHdFile ? { posterHd: postHdBytes } : {}),
        posterMobile: postMobBytes,
        posterMobileHd: postMobHdBytes,
        posterPortrait: postPortBytes,
        ...(postPortHdFile ? { posterPortraitHd: postPortHdBytes } : {}),
        ...(postFirstFile ? { posterFirst: postFirstBytes } : {}),
        ...(postFirstHdFile ? { posterFirstHd: postFirstHdBytes } : {}),
      },
    }

    rawTotal += rawBytes
    deskTotal += deskBytes
    hdTotal += hdBytes
    mobTotal += mobBytes
    mobHdTotal += mobHdBytes
    portTotal += portBytes
    portHdTotal += portHdBytes || portBytes // what a DPR ≥ 2 phone actually gets
    postTotal += postBytes + postMobBytes + postMobHdBytes + postPortBytes + postPortHdBytes + postFirstBytes + postHdBytes + postFirstHdBytes

    const pct = ((deskBytes / rawBytes) * 100).toFixed(0)
    console.log(
      `✓ ${String(v.id).padEnd(9)} ${role.padEnd(7)} ${meta.width}×${meta.height} ${meta.duration.toFixed(1)}s` +
        `  raw ${KB(rawBytes).padStart(8)} → desktop ${KB(deskBytes).padStart(8)} (${pct}%)` +
        (hdFile ? `  hd ${KB(hdBytes).padStart(8)}` : '') +
        `  mobile ${KB(mobBytes).padStart(7)}/${KB(mobHdBytes)}  portrait ${KB(portBytes)}${portHdFile ? '/' + KB(portHdBytes) : ''} (${portMeta.width}×${portMeta.height}${portHdMeta ? ', ' + portHdMeta.width + '×' + portHdMeta.height : ''})  poster ${KB(postBytes).padStart(7)} [${pf}]` +
        (crop ? `  wm-crop ${Math.round(crop * 100)}%` : '') +
        (trim ? `  head-trim ${trim}s` : '') +
        (fpsCap ? `  ${meta.fps}→${fpsCap} fps` : '')
    )
  }

  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')

  console.log(
    `\n📦 ${Object.keys(manifest).length} slot(s) optimized.\n` +
      `   Raw sources : ${MB(rawTotal)}\n` +
      `   Desktop set : ${MB(deskTotal)}  (lazy-loaded — never all at once)\n` +
      `   HD set      : ${MB(hdTotal)}  (hero + featured, 1920 tier)\n` +
      `   Mobile set  : ${MB(mobTotal)} landscape 720 · ${MB(mobHdTotal)} landscape 1080\n` +
      `   Portrait    : ${MB(portTotal)} sd · ${MB(portHdTotal)} what a DPR ≥ 2 phone loads\n` +
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
