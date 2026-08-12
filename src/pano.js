import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  SphereGeometry,
  MeshBasicMaterial,
  Mesh,
  TextureLoader,
  SRGBColorSpace,
  MathUtils,
} from 'three'

/* ──────────────────────────────────────────────────────────────────────────
 * SEMPLO — immersive 360° project viewer (the overlay centerpiece).
 *
 *   LAZY: this module (and therefore Three.js) is dynamic-imported by main.js
 *   ONLY when a project overlay with a `panorama` opens — the main page bundle
 *   stays Three-free. The equirect texture (public/projects/<id>/panoramas/
 *   <room>-{4096|2048}.webp) loads at the same moment. Projects with several
 *   rooms switch via setSource() — same sphere, texture swapped in place.
 *
 *   Interaction: classic inverted-sphere look-around.
 *     • drag-to-look — Pointer Events (mouse + touch). touch-action: pan-y so
 *       vertical swipes still scroll the overlay on phones; horizontal drags
 *       rotate the view.
 *     • scroll-linked yaw — while the block is inside the overlay's viewport,
 *       its scroll progress adds a slow yaw drift (auto-look). NOT a pin: the
 *       block scrolls by normally, the camera just turns as it passes.
 *       Disabled under prefers-reduced-motion (drag still works).
 *     • rAF runs only while the block is visible in the overlay.
 *
 *   destroy() disposes everything (geometry, material, texture, GL context).
 * ────────────────────────────────────────────────────────────────────────── */

export function createPano(stage, { src, scroller, scrollYawDeg = 70, autoYaw = true }) {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))

  const scene = new Scene()
  const camera = new PerspectiveCamera(75, 1, 0.1, 1100)

  const geo = new SphereGeometry(500, 60, 40)
  geo.scale(-1, 1, 1) // view from inside
  const mat = new MeshBasicMaterial()
  scene.add(new Mesh(geo, mat))

  /* texture loading — also used by setSource() for the room switcher.
   * `loadToken` makes the LAST requested room win a fast chip-click race;
   * the outgoing texture is disposed only after its replacement is mapped. */
  let tex = null
  let loadToken = 0
  function loadTexture(url) {
    const token = ++loadToken
    new TextureLoader().load(url, (t) => {
      if (token !== loadToken) return t.dispose() // a newer room superseded this
      t.colorSpace = SRGBColorSpace
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      const old = tex
      tex = t
      mat.map = t
      mat.needsUpdate = true
      old?.dispose()
      stage.classList.add('is-loaded')
      stage.dataset.src = url // observable: what the sphere is actually showing
    })
  }
  loadTexture(src)

  const canvas = renderer.domElement
  canvas.className = 'pano-canvas'
  canvas.style.touchAction = 'pan-y' // phones: vertical swipe scrolls, horizontal looks
  stage.appendChild(canvas)

  /* look state — user yaw/pitch + scroll-linked yaw, all damped every frame */
  let lon = 0, lat = -2, tLon = 0, tLat = -2
  let scrollYaw = 0, tScrollYaw = 0
  let dragging = false, sx = 0, sy = 0, sLon = 0, sLat = 0

  const down = (e) => {
    dragging = true
    sx = e.clientX; sy = e.clientY
    sLon = tLon; sLat = tLat
    stage.classList.add('is-touched') // fades the "drag to look" hint
    canvas.setPointerCapture?.(e.pointerId)
  }
  const move = (e) => {
    if (!dragging) return
    tLon = sLon + (sx - e.clientX) * 0.16
    tLat = MathUtils.clamp(sLat + (e.clientY - sy) * 0.12, -55, 55)
  }
  const up = () => { dragging = false }
  canvas.addEventListener('pointerdown', down)
  canvas.addEventListener('pointermove', move)
  canvas.addEventListener('pointerup', up)
  canvas.addEventListener('pointercancel', up)

  /* scroll-linked yaw: block's progress through the overlay viewport → drift */
  const onScroll = () => {
    if (!autoYaw) return
    const r = stage.getBoundingClientRect()
    const vh = scroller.clientHeight
    const p = MathUtils.clamp((vh - r.top) / (vh + r.height), 0, 1)
    tScrollYaw = (p - 0.5) * scrollYawDeg
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })

  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(stage)

  /* render loop — alive only while the block is visible inside the overlay */
  let raf = 0
  let visible = false
  const loop = () => {
    if (!visible) { raf = 0; return }
    raf = requestAnimationFrame(loop)
    lon += (tLon - lon) * 0.08
    lat += (tLat - lat) * 0.08
    scrollYaw += (tScrollYaw - scrollYaw) * 0.05
    const phi = MathUtils.degToRad(90 - lat)
    const theta = MathUtils.degToRad(lon + scrollYaw)
    camera.lookAt(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    )
    renderer.render(scene, camera)
  }
  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting
      if (visible && !raf) loop()
    },
    { root: scroller, threshold: 0.05 }
  )
  io.observe(stage)
  onScroll()

  return {
    /* room switch: swap the equirect on the SAME sphere/renderer — the canvas
     * dips out via the is-loaded fade and returns when the texture arrives */
    setSource(url) {
      stage.classList.remove('is-loaded')
      loadTexture(url)
    },
    destroy() {
      loadToken++ // orphan any in-flight texture load (its callback disposes it)
      visible = false
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      geo.dispose()
      mat.dispose()
      tex?.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
