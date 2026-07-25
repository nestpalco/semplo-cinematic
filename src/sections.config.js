/*
 * ─────────────────────────────────────────────────────────────────────────
 *  SEMPLO — SINGLE SOURCE OF TRUTH for the calm, photography-first page.
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  Design principle (Awwwards 2025–26 architecture/interior studios):
 *    ONE signature moment, calm everywhere else, photography is the interface.
 *
 *  The page reads, top to bottom:
 *      HERO (one full-bleed video, plays once → holds its final frame)
 *      → statement → ambient strip → PROJECTS GALLERY (the centerpiece)
 *      → statement → ambient strip → statement → ambient strip → CTA → footer.
 *
 *  ── VIDEO SLOTS (the only heavy media the optimizer touches) ──────────────
 *  There are exactly two kinds, and BOTH are defined here so you can drop in
 *  new Kling clips by filename — one line each:
 *    • `hero`      — the single signature clip. Plays once on load, no scrub,
 *                    no pin, then holds the last frame. Its POSTER is the LAST
 *                    frame (the finished room), so reduced-motion / no-JS users
 *                    see the payoff, not an empty room.
 *    • `ambients`  — quiet "living photograph" loops used as full-width strips
 *                    BETWEEN content. Autoplay muted, loop, gentle parallax at
 *                    most. Backgrounds, not effects. Text may sit on them.
 *
 *  ── FILE NAMING ──────────────────────────────────────────────────────────
 *  `src` is the RAW file in assets/videos/. The optimizer (npm run
 *  optimize:videos) re-encodes each slot to web-ready MP4s named after the
 *  slot `id`, written to public/videos/<id>-{1600|1280,720}.mp4 (+ posters) and
 *  recorded in src/videos.manifest.json. The page loads the optimized files.
 *
 *  ★ SWAPPING IN A NEW CLIP: change the one `src` line for that slot, drop the
 *    raw .mp4 in assets/videos/, run `npm run optimize:videos`. Nothing else.
 *
 *  ── WATERMARK ────────────────────────────────────────────────────────────
 *  Kling sources carry a "KlingAI" mark bottom-right. `cropWatermark` (fraction
 *  of height trimmed off the BOTTOM during encode) removes it. 0.08 clears it on
 *  these; set 0 for clean sources.
 * ─────────────────────────────────────────────────────────────────────────
 */

/* ── THE signature hero clip ───────────────────────────────────────────────
 * PLACEHOLDER: the empty-volume clip stands in until the "room furnishes
 * itself" clip is generated. To go live, change `src` below to the new file
 * name (and keep posterFrame: 'last' so the poster is the furnished room). */
export const hero = {
  id: 'hero',
  role: 'hero',
  src: 'kling_20260619_VIDEO_A_big_mode_946_0-4K.mp4', // hero clip (4K master, clean)
  cropWatermark: 0, // clean source, use the full frame
  crf: 25, // 4K master stays crisp at crf 25 → ~4 MB (vs 5.5 MB at the default 22)
  posterFrame: 'last', // finished room is the payoff → poster = final frame
  // PATTERN B: on desktop (motion-ok) the hero is PINNED and scroll scrubs the
  // clip — scrolling literally furnishes the empty room under this headline.
  // Mobile / reduced-motion keep the calm play-once / poster behaviour.
  scrubVideo: true,
  bg: 'Имате празно пространство? Ние ще го превърнем в дом.',
  en: 'Have an empty space? We’ll turn it into home.',
  subBg: 'Пространства с характер',
  subEn: 'Spaces with character',
  // quiet credibility line (services + location) — the only above-the-fold
  // statement of WHAT Semplo does and WHERE. Kept subtle so it never competes.
  credBg: 'Интериор · Строителство · Мебели по поръчка — София',
  credEn: 'Interior · Construction · Custom furniture — Sofia',
  ctaBg: 'Разгледайте проектите',
  ctaEn: 'View our work',
  ctaHref: '#work',
}

/* ── Ambient "living photograph" loops ─────────────────────────────────────
 * Full-width strips between content. 3–4 recommended. Each may carry an
 * OPTIONAL quiet overlay line (eyebrow + line); omit those keys for a pure,
 * text-free living photograph. PLACEHOLDERS reuse the old room clips — swap the
 * `src` of each to the slow light-shift / near-still clips you generate. */
export const ambients = [
  {
    id: 'ambient1',
    role: 'ambient',
    src: 'semplo-the_living_room-4K.mp4', // living room ambient clip (4K source, clean)
    cropWatermark: 0, // clean source, use the full frame
    crf: 28, // 4K master stays crisp at crf 28 → ~2 MB (vs 2.9 MB at the default 25)
    scrubVideo: true, // PATTERN B: position-linked scrub (no pin) on desktop
    eyebrowBg: 'Дневната', eyebrowEn: 'The living room',
    lineBg: 'Където денят се събира.', lineEn: 'Where the day gathers.',
  },
  {
    id: 'ambient2',
    role: 'ambient',
    src: 'kling_20260619_VIDEO_A_modern_l_488_0.mp4', // ← SWAP: near-still warm interior
    cropWatermark: 0.08,
    scrubVideo: true, // PATTERN B: position-linked scrub (no pin) on desktop
    // pure living photograph — no overlay text
  },
  {
    id: 'ambient3',
    role: 'ambient',
    src: 'kling_20260619_VIDEO_Cinematic__1333_0.mp4', // ← SWAP: quiet sea-view room
    cropWatermark: 0.08,
    eyebrowBg: 'Гледката', eyebrowEn: 'The outlook',
    lineBg: 'Където погледът среща морето.', lineEn: 'Where the eye meets the sea.',
  },
  // Add a 4th ambient by copying a block above with a new id + src.
]

/*
 * ── PROJECTS — the centerpiece editorial gallery ──────────────────────────
 * Photography is the interface: large imagery, minimal chrome. Each project
 * opens a detail overlay with an edge-to-edge photo SEQUENCE (`frames`).
 *
 * REAL SEMPLO imagery, harvested from semplodesign.com/projects/ (their
 * portfolio is one flagship apartment presented room by room, so our four
 * "projects" are its four strongest room-suites). Raw files live in
 * assets/projects/ — assets/projects/source-manifest.json maps every file to
 * its source URL. `npm run optimize:projects` emits the -1600/-900 webp
 * variants used here. `span`: 'wide' | 'tall' | null (gallery size hint).
 *
 * `panorama` (OPTIONAL) — id of an equirectangular 360° source in
 * assets/panoramas/<id>.jpg. Projects that have one get an immersive
 * drag-to-look 360° block in their detail overlay (Three.js + texture are
 * lazy-loaded only when that overlay opens). Omit the key = no block.
 */
const pf = (name) => `/projects/${name}-1600.webp`
export const projects = [
  {
    id: 'living',
    titleBg: 'Дневна зона', titleEn: 'The Living Area',
    metaBg: 'София · 2023', metaEn: 'Sofia · 2023',
    cover: pf('g1-01'), coverMobile: '/projects/g1-01-900.webp',
    span: 'wide',
    frames: ['g1-01', 'g1-02', 'g1-03', 'g1-04', 'g1-05', 'g1-06', 'g1-07', 'g1-08'].map(pf),
    panorama: 'living',
    blurbBg: 'Мрамор, мед и меки кремави обеми — дневна, подредена около медийната стена и светлината от двете страни.',
    blurbEn: 'Marble, copper and soft cream volumes — a living room arranged around the media wall and light from both sides.',
  },
  {
    id: 'dining',
    titleBg: 'Трапезария и кухня', titleEn: 'Dining & Kitchen',
    metaBg: 'София · 2023', metaEn: 'Sofia · 2023',
    cover: pf('g5-01'), coverMobile: '/projects/g5-01-900.webp',
    span: null,
    frames: ['g5-01', 'g5-02', 'g5-03', 'g5-04', 'g5-05', 'g5-06', 'g5-07', 'g5-08'].map(pf),
    panorama: 'hallway',
    blurbBg: 'Каменна маса върху месингова основа, медни висулки и кухня, скрита в топло дърво и стъкло.',
    blurbEn: 'A stone table on a brass base, copper pendants, and a kitchen tucked into warm wood and glass.',
  },
  {
    id: 'bedroom',
    titleBg: 'Спалня под покрива', titleEn: 'The Attic Bedroom',
    metaBg: 'София · 2023', metaEn: 'Sofia · 2023',
    cover: pf('g14-01'), coverMobile: '/projects/g14-01-900.webp',
    span: null,
    frames: ['g14-01', 'g14-02', 'g14-03', 'g14-04', 'g14-05', 'g15-01', 'g15-02', 'g15-03'].map(pf),
    panorama: 'bedroom',
    blurbBg: 'Скосени тавани, дъб и гардероби от опушено стъкло — спокойна спалня, събрана под линията на покрива.',
    blurbEn: 'Sloped ceilings, oak and smoked-glass wardrobes — a calm bedroom gathered under the roofline.',
  },
  {
    id: 'office',
    titleBg: 'Домашен кабинет', titleEn: 'The Home Office',
    metaBg: 'София · 2023', metaEn: 'Sofia · 2023',
    cover: pf('g20-01'), coverMobile: '/projects/g20-01-900.webp',
    span: 'wide',
    frames: ['g20-01', 'g20-02', 'g20-03', 'g21-01', 'g21-02', 'g22-01', 'g22-02', 'g22-03'].map(pf),
    panorama: 'office',
    blurbBg: 'Тъмно дърво, черен мрамор и място за концентрация — кабинет, който остава тих в края на деня.',
    blurbEn: 'Dark wood, black marble and room to focus — a study that stays quiet at the end of the day.',
  },
]

/*
 * Short statement blocks between the media. `bg`/`en` heading, `bodyBg`/`bodyEn`
 * paragraph, `eyebrow*` the small gold kicker. Pure Semplo language.
 */
export const interludes = [
  {
    // ── ABOUT / STUDIO ── nav "Студио / Studio" scrolls here. Copy migrated
    // from the retired semplodesign.com/about-us/ (story + the "10 years" stat
    // + their about.jpg), integrated into this single-page section.
    anchor: 'studio',
    eyebrowBg: 'Студио', eyebrowEn: 'Studio',
    bg: 'Вашият мечтан дом или работно място.',
    en: 'Your dream home or workplace.',
    bgFx: 'blueprint', // PATTERN A background: drifting floor-plan linework
    bodyBg:
      'Ние сме екип от професионалисти, посветени в създаването на красиви и функционални пространства. С нашия опит в дизайна, строителството, вноса на строителни материали и мебели по поръчка, създаваме вашия мечтан дом или работно място.',
    bodyEn:
      'We are a team of professionals dedicated to creating beautiful, functional spaces. With our experience in design, construction, the import of building materials and bespoke furniture, we craft your dream home or workplace.',
    bodyBg2:
      'Вярваме, че добрият дизайн е съчетание от естетика, функционалност и иновация. С дългогодишен опит и дълбоко познаване на индустрията помогнахме на безброй клиенти да превърнат пространствата си в нещо наистина специално.',
    bodyEn2:
      'We believe good design is a blend of aesthetics, functionality and innovation. With years of experience and a deep understanding of the industry, we have helped countless clients turn their spaces into something truly special.',
    stat: { num: '10', labelBg: 'Години опит', labelEn: 'Years of experience' },
    image: { srcMobile: '/studio/about-420.webp', src: '/studio/about-525.webp',
      altBg: 'Semplo — стол и маса до прозорец с гледка към езеро',
      altEn: 'Semplo — a chair and table by a lake-view window' },
  },
  {
    eyebrowBg: 'Материали', eyebrowEn: 'Materials',
    bg: 'Палитра от естествени тонове.',
    en: 'A palette drawn from nature.',
    bgFx: 'material', // PATTERN A background: drifting marble/wood texture
    bodyBg:
      'Дъб, варовик, лен и матово стъкло. Подбираме материали, които остаряват красиво и стоплят пространството, без да го затрупват.',
    bodyEn:
      'Oak, limestone, linen and matte glass. We choose materials that age beautifully and warm a space without crowding it.',
  },
  {
    eyebrowBg: 'Гледката', eyebrowEn: 'The Outlook',
    bg: 'Домове, които живеят с пейзажа.',
    en: 'Homes that live with the landscape.',
    bgFx: 'geometry', // PATTERN A background: soft parallax geometry
    bodyBg:
      'Когато има море, всичко друго отстъпва. Рамкираме гледката, успокояваме интериора и оставяме хоризонта да бъде главният акцент.',
    bodyEn:
      'When there is a sea, everything else steps back. We frame the view, quiet the interior, and let the horizon be the loudest thing in the room.',
  },
]

// UI / chrome copy, bilingual as [bg, en].
export const ui = {
  brand: ['Semplo', 'Semplo'],
  tagline: ['Интериорно студио', 'Interior studio'],
  nav: {
    work: ['Проекти', 'Work'],
    catalogs: ['Каталози', 'Catalogues'],
    studio: ['Студио', 'Studio'],
    contact: ['Контакт', 'Contact'],
    shop: ['Магазин', 'Shop'], // → semplohome.com (external)
  },
  scrollHint: ['Скролнете, за да видите', 'Scroll to see it furnished'],
  loading: ['Зареждане', 'Loading'],
  replay: ['Пусни отново', 'Replay'],
  projects: {
    eyebrow: ['Избрани проекти', 'Selected work'],
    title: ['Завършени интериори.', 'Finished interiors.'],
    view: ['Разгледай', 'View project'],
    close: ['Затвори', 'Close'],
  },
  pano: {
    badge: ['360°', '360°'],
    hint: ['Влачете, за да разгледате', 'Drag to look around'],
  },
  // Real SEMPLO contact details (semplodesign.com)
  contact: {
    phone: ['+359 889 747 773', '+359 889 747 773'],
    email: ['office@semplohome.com', 'office@semplohome.com'],
    addr: ['бул. „Околовръстен път“ 130, София', '130 Okolovrasten Pat Blvd, Sofia'],
  },
  // Каталози — the internal catalogues section (see the `catalogs` export).
  catalogs: {
    eyebrow: ['Каталози', 'Catalogues'],
    title: ['Мебели и оборудване по каталог.', 'Furniture and equipment, by catalogue.'],
    text: [
      'Изтеглете нашите каталози за мебели по поръчка и професионално оборудване за гастрономия.',
      'Download our catalogues for custom furniture and professional gastronomy equipment.',
    ],
    download: ['Изтегли PDF', 'Download PDF'],
  },
  cta: {
    // this section IS the contact/CTA (nav "Контакт" lands here) — labelled as
    // Contact, not Portfolio, so it doesn't read as the projects gallery
    eyebrow: ['Контакт', 'Contact'],
    title: ['Да създадем вашето пространство.', 'Let’s shape your space.'],
    text: [
      'Подбрана селекция от завършени интериори — от градски апартаменти до къщи край морето. Разкажете ни за вашия проект.',
      'A curated selection of finished interiors — from city apartments to houses by the sea. Tell us about your project.',
    ],
    button: ['Свържете се с нас', 'Get in touch'],
  },
  foot: {
    rights: [
      '© 2026 Semplo — Интериорно студио · Всички права запазени',
      '© 2026 Semplo — Interior studio · All rights reserved',
    ],
  },
}

/*
 * ── Motion (global) ───────────────────────────────────────────────────────
 * The hero video is THE moment; everything else whispers. The polish motion
 * layer (src/motion.js — GSAP, lazy-loaded, skipped entirely under
 * prefers-reduced-motion) reads these dials. No pins, no scroll hijacking.
 */
export const motion = {
  // Viewport-heights ahead of a video slot to begin fetching it (lazy-load).
  preloadMargin: 1.2,

  // IntersectionObserver visibility to start/stop an ambient loop (battery-kind).
  playThreshold: 0.35,

  // Ambient-strip parallax travel as a fraction of strip height (±). The strip
  // media has 8% overscan headroom, so keep ≤ 0.08. ~0.06 reads as ≈0.9× scroll.
  parallax: 0.06,

  // Reveal feel (scroll-triggered, once, transform/opacity only).
  reveal: { y: 26, duration: 0.85, ease: 'power3.out', stagger: 0.09 },

  // Ken Burns drift on the held hero frame (mobile play-once mode only now —
  // gallery covers use the PATTERN C film strips instead).
  kenBurns: { heroScale: 1.06, heroSeconds: 24 },

  // 360° viewer: degrees of gentle scroll-linked yaw as the block passes through
  // the overlay viewport (0 in reduced-motion — drag always works).
  panoScrollYaw: 70,

  // ── PATTERN B: scroll-scrubbed video (desktop, motion-ok only) ──────────
  scrub: {
    smooth: 0.45, // ScrollTrigger catch-up seconds — frame glides, never snaps
    seekEpsilon: 0.012, // dirty-gate: skip seeks smaller than ~half a frame
    heroLength: 2.2, // viewport-heights of scroll the PINNED hero scrub occupies
  },

  // ── PATTERN C: frames shown in each gallery card's scroll-linked strip ──
  stripFrames: 4,
}

/* ── CATALOGUES ────────────────────────────────────────────────────────────
 * Migrated from the (now-retired) semplodesign.com/catalogs/. Each PDF lives at
 * public/catalogs/<id>.pdf (see assets/catalogs/source-manifest.json for the
 * ours→theirs mapping). The source "covers" were generic black SEMPLO title-
 * cards, so the page renders elegant TYPOGRAPHIC cards in the site's palette
 * instead. `size` is shown so visitors know the download weight up front. */
export const catalogs = [
  { id: 'gastronomy-general', catBg: 'Гастрономия', catEn: 'Gastronomy',
    titleBg: 'Оборудване за гастрономия', titleEn: 'Gastronomy Equipment', size: '10 MB' },
  { id: 'gastronomy-restaurant', catBg: 'Гастрономия', catEn: 'Gastronomy',
    titleBg: 'Оборудване за ресторант', titleEn: 'Restaurant Equipment', size: '12 MB' },
  { id: 'gastronomy-exclusive', catBg: 'Гастрономия', catEn: 'Gastronomy',
    titleBg: 'Ексклузивно оборудване', titleEn: 'Exclusive Equipment', size: '2.3 MB' },
  { id: 'furniture-chairs', catBg: 'Мебели', catEn: 'Furniture',
    titleBg: 'Столове', titleEn: 'Chairs', size: '13 MB' },
  { id: 'furniture-general', catBg: 'Мебели', catEn: 'Furniture',
    titleBg: 'Общ каталог — столове', titleEn: 'General Catalogue — Chairs', size: '18 MB' },
]

/* Horizontal photo strip (PATTERN C) for the portfolio/contact section.
 * Paths into public/projects/ (900 variants — they render ~300px tall). */
export const strips = {
  portfolio: [
    '/projects/g1-01-900.webp',
    '/projects/g5-01-900.webp',
    '/projects/g14-01-900.webp',
    '/projects/g20-01-900.webp',
  ],
}
