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
  credBg: 'Интериор · Сухо строителство · Мебели по поръчка — София',
  credEn: 'Interior · Drywall construction · Custom furniture — Sofia',
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
 * Photography is the interface: large imagery, minimal chrome. A PROJECT is a
 * whole PROPERTY (an apartment, a house, an office), one folder per project:
 *
 *     assets/projects/<project-id>/
 *         gallery/    01.jpg 02.jpg …      finished photos, shown in order
 *         sketches/   01.jpg 02.jpg …      plans/drawings (optional)
 *         panoramas/  <room-name>.jpg …    360° equirects, one per room (opt.)
 *
 * `npm run optimize:projects` WALKS those folders (no per-file listing here),
 * emits the webp variants into public/projects/<id>/…, writes
 * src/projects.manifest.json (which main.js reads to build the cards, the
 * overlay, the Проект tab and the 360° room switcher), and FAILS THE BUILD if
 * an entry below has no folder/gallery or labels a panorama that has no file.
 *
 * ★ TO ADD A NEW PROJECT (full walkthrough: assets/projects/README.md):
 *     1. create assets/projects/<new-id>/gallery/ and drop numbered photos
 *        (sketches/ and panoramas/ too, if you have them)
 *     2. add ONE entry below: id + titles + meta + blurb (+ `panoramas`
 *        labels if the project has 360° rooms)
 *     3. npm run optimize:projects  (or just npm run dev)
 *
 * Per entry:
 *   `panoramas` — the 360° rooms, IN DISPLAY ORDER, each { file, bg, en }:
 *      `file` is the base name in panoramas/, bg/en the room label shown in
 *      the viewer (and on the switcher chips when there are several). The
 *      viewer itself stays lazy: Three.js + one texture load only when the
 *      overlay opens; switching rooms swaps the texture in place.
 *   sketches need NO config — folder presence alone adds the Проект tab
 *      (gallery still opens selected; no folder = no tab). Drawings render
 *      uncropped, click-to-zoom to the 3000px variant.
 *   `span`: 'wide' | null — gallery card size hint.
 *
 * REAL SEMPLO imagery, harvested from semplodesign.com/projects/. Their
 * portfolio is ONE flagship apartment presented room by room, so it is ONE
 * project here — its gallery runs living → dining/kitchen → attic bedroom →
 * home office (see assets/projects/sofia-apartment/source-manifest.json for
 * the ours → theirs mapping of every photo).
 */
export const projects = [
  {
    id: 'house-troyan',
    titleBg: 'Къща Троян', titleEn: 'Troyan House',
    // name and year confirmed against the plan sheets' title block
    // (ОБЕКТ: Къща Троян, ДАТА: 4.8.2026)
    metaBg: 'Троян · 2026', metaEn: 'Troyan · 2026',
    span: 'wide',
    panoramas: [
      { file: 'living', bg: 'Дневна', en: 'Living room' },
      { file: 'bedroom', bg: 'Спалня', en: 'Bedroom' },
    ],
    // draft blurb — edit freely
    blurbBg:
      'Двуетажна къща с отворена дневна, кухня и трапезария, три спални и гараж — топло дърво, камък и мека светлина в полите на Балкана.',
    blurbEn:
      'A two-storey house with an open living, kitchen and dining space, three bedrooms and a garage — warm wood, stone and soft light in the foothills of the Balkan range.',
  },
  {
    id: 'sofia-apartment',
    titleBg: 'Апартамент София', titleEn: 'Sofia Apartment',
    metaBg: 'София · 2023', metaEn: 'Sofia · 2023',
    span: 'wide',
    panoramas: [
      { file: 'living', bg: 'Дневна', en: 'Living room' },
      { file: 'hallway', bg: 'Коридор', en: 'Hallway' },
      { file: 'bedroom', bg: 'Спалня', en: 'Bedroom' },
      { file: 'office', bg: 'Кабинет', en: 'Home office' },
    ],
    // TODO: sketches/01..03.jpg are generated PLACEHOLDERS (labelled as such
    // on their face) — replace the files with the real drawings, re-run the
    // optimizer.
    blurbBg:
      'Мрамор, мед и дъб през целия апартамент — дневна около медийната стена, каменна маса върху месингова основа, спалня под линията на покрива и кабинет, който остава тих в края на деня.',
    blurbEn:
      'Marble, copper and oak throughout — a living room arranged around the media wall, a stone table on a brass base, a bedroom gathered under the roofline, and a study that stays quiet at the end of the day.',
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

/*
 * ── BUSINESS — the single source of truth for contact + map + schema ──────
 * Everything here feeds THREE consumers, so a change lands everywhere at once:
 *   1. the visible contact block + footer (via `ui.contact`, below),
 *   2. the Google Maps band in the CTA section (`map.embed`),
 *   3. the LocalBusiness JSON-LD, which main.js rebuilds from this object and
 *      writes into the [data-ld-business] script tag in index.html.
 *
 * index.html keeps a STATIC copy of the same JSON-LD as a no-JS fallback for
 * crawlers that don't execute scripts — if you edit name / telephone / address
 * here, mirror it there too (it is the only duplication in the file).
 *
 * ── THE MAP EMBED (no API key, real business pin) ─────────────────────────
 * `?q=<address>` embeds drop a plain ADDRESS pin — the listing's name, hours and
 * reviews are absent. Their actual Google Business listing is addressed by its
 * CID, which is the second half of the place FID in the share link:
 *   https://maps.app.goo.gl/RW5PLieX7xKHSCPx5
 *     → …/place/SEMPLO/@42.633219,23.3295871,17z/data=…!1s0x40aa83c5305618a5:0x52d0053226e794e2!…
 *                                                            └── FID ──┘ └───── CID (hex) ─────┘
 *   0x52d0053226e794e2 = 5967275219225122018  ← `cid` below
 * `?cid=` renders the LISTING (pin carries the SEMPLO name), which is what the
 * client asked for. To repoint at another listing: open the share link, follow
 * it, take the hex after the colon in `!1s…`, convert to decimal.
 */
export const business = {
  name: 'SEMPLO DESIGN',
  legalName: 'SEMPLO DESIGN',
  /* ── CANONICAL DOMAIN — the one base URL for the whole site ───────────────
   * Read by src/schema.js (JSON-LD `url` + `@id` + `image`) and mirrored by
   * hand in four static places that cannot import config:
   *     index.html      <link rel="canonical"> and og:url / og:image
   *     index.html      the no-JS JSON-LD fallback
   *     public/robots.txt   the Sitemap: line
   *     public/sitemap.xml  every <loc>
   * The e2e suite compares all of them against this value, so a change here
   * that isn't mirrored fails the build rather than shipping quietly.
   *
   * ⚠ DNS still points at the old WordPress install, so these URLs describe the
   * FUTURE live site — they will not resolve until the domain is switched to
   * Netlify. That is fine, and is exactly why the canonical matters now: until
   * the switch the site is reachable at its *.netlify.app address, and the
   * canonical keeps that copy from competing with this domain in the index.
   * Trailing slash included — it is the homepage, and every mirrored copy uses
   * the identical string so nothing has to normalise it. */
  url: 'https://semplodesign.com/',
  /* ── SOCIAL CARD — the one asset on the site that is NOT WebP ─────────────
   * Path is relative to `url` above (og:image and schema.org `image` both need
   * an absolute URL, which schema.js builds). Cut from the hero poster to
   * 1200×630 by scripts/optimize-social.mjs — see that file for why a JPEG:
   * Facebook and LinkedIn simply do not render a WebP og:image, so the preview
   * comes up blank in the two places a studio's work actually gets shared.
   * Every image the PAGE loads stays WebP; only this card changes format.
   * `width`/`height` are declared to the scrapers so they can lay the card out
   * before the image has downloaded — keep them in step with CARD in that
   * script (the e2e suite probes the real file and fails if they disagree). */
  ogImage: { path: 'social/og-card.jpg', width: 1200, height: 630, type: 'image/jpeg' },
  phone: '+359 894 880 088',
  tel: '+359894880088', // tel: href form (no spaces)
  email: 'semplo.design@gmail.com',
  street: 'бул. „Околовръстен път“ 130',
  city: 'София',
  country: 'BG',
  geo: { lat: 42.6332151, lng: 23.332162 },
  map: {
    cid: '5967275219225122018',
    // the muted full-width band in the CTA section
    embed:
      'https://maps.google.com/maps?cid=5967275219225122018&hl=bg&z=17&output=embed',
    // "Open in Google Maps" — the client's own share link
    link: 'https://maps.app.goo.gl/RW5PLieX7xKHSCPx5',
  },
  social: [
    'https://www.facebook.com/semplodesign.bulgaria',
    'https://www.instagram.com/semplo.design',
    'https://semplohome.com/',
  ],
}

/*
 * ── REVIEWS — Google reviews, copied in by hand ───────────────────────────
 * Google's Places API is the only programmatic source of review text and it
 * needs a billed API key, so this section is CONFIG-DRIVEN instead: paste each
 * real review from the Google listing into `items` below and the section, the
 * star rows and the Review + AggregateRating JSON-LD all follow.
 *
 * ★ TO FILL IN (open business.map.link → "Reviews"):
 *   1. `rating` / `count` — the listing's headline score and total review count.
 *      These two power the AggregateRating, so they must match the listing.
 *      Already set from the live listing as of 2026-08-02 (4.4 ★, 14 reviews) —
 *      re-check them when you paste the reviews in, since they drift.
 *   2. one `items` entry per review you want to show (4–6 reads best):
 *        author  — the reviewer's display name, as Google shows it
 *        rating  — 1–5, as given
 *        date    — ISO yyyy-mm-dd (Google shows "2 months ago"; approximate it)
 *        textBg  — the review verbatim, in the language it was written
 *        textEn  — your translation (shown when the site is in EN)
 *        todo    — DELETE this key once the entry holds a real review. Entries
 *                  that still carry it are dimmed and badged in the UI, and are
 *                  LEFT OUT of the JSON-LD so no placeholder is ever published
 *                  as structured data.
 *   3. delete any placeholder you don't replace.
 *
 * Until at least one `todo`-free entry exists, main.js emits NO review schema
 * at all — deliberate: fake reviews in schema are a manual-action risk.
 */
export const reviews = {
  rating: 4.4, // their live Google rating on 2026-08-02 — re-check before launch
  count: 14, // their live Google review count on 2026-08-02
  url: 'https://maps.app.goo.gl/RW5PLieX7xKHSCPx5', // read / leave a review
  items: [
    {
      todo: true, // TODO: replace with a real Google review, then delete this key
      author: 'Мария Петрова',
      rating: 5,
      date: '2026-05-18',
      textBg:
        'Работихме със SEMPLO DESIGN по цялостния проект на апартамента ни. Изслушаха ни, предложиха решения, за които не бяхме се сетили, и спазиха срока. Резултатът е точно домът, който си представяхме.',
      textEn:
        'We worked with SEMPLO DESIGN on the complete design of our apartment. They listened, proposed solutions we had never thought of, and kept to the schedule. The result is exactly the home we pictured.',
    },
    {
      todo: true, // TODO: replace with a real Google review, then delete this key
      author: 'Георги Иванов',
      rating: 5,
      date: '2026-03-04',
      textBg:
        'Прецизност в детайла и коректност в комуникацията. Мебелите по поръчка са безупречни, а екипът остана на разположение и след приключване на ремонта.',
      textEn:
        'Precision in the detail and honesty in the communication. The bespoke furniture is faultless, and the team stayed available well after the works were finished.',
    },
    {
      todo: true, // TODO: replace with a real Google review, then delete this key
      author: 'Elena Dimitrova',
      rating: 4, // one 4★ placeholder so the partial star row is visible in the design
      date: '2025-11-22',
      textBg:
        'Довериха ни се с офиса и не сбъркахме. Пространството е спокойно, светло и работи много по-добре от предишното — а бюджетът остана там, където се уговорихме.',
      textEn:
        'We trusted them with our office and we were right to. The space is calm, bright and works far better than before — and the budget stayed where we agreed it would.',
    },
    {
      todo: true, // TODO: replace with a real Google review, then delete this key
      author: 'Николай Стоянов',
      rating: 5,
      date: '2025-09-09',
      textBg:
        'От идеята до последния детайл — един екип, един стандарт. Рядкост е да срещнеш студио, което държи на качеството толкова, колкото и клиентът.',
      textEn:
        'From the first idea to the last detail — one team, one standard. It is rare to find a studio that cares about the quality as much as the client does.',
    },
  ],
}

/*
 * ── SPAM PROTECTION — Cloudflare Turnstile ────────────────────────────────
 * Chosen over Netlify's built-in reCAPTCHA 2 on four counts: Turnstile's
 * managed mode usually passes with no interaction (a checkbox click, sometimes
 * an image puzzle, is real friction on a lead form); it is ~60–90 KB against
 * reCAPTCHA's ~400–600 KB; it sets no cross-site tracking cookies and ships an
 * EU-jurisdiction DPA, which matters for a Bulgarian studio collecting leads;
 * and it takes `theme`, `size: flexible` and `language`, so it follows this
 * site's light/dark tokens, field rhythm and BG/EN toggle instead of pasting a
 * Google-branded box into the middle of the form. Netlify's own reCAPTCHA also
 * injects its script into the published HTML, so every visitor pays for it
 * whether or not they open the dialog — we load this one only on open.
 *
 * ── HOW IT IS ENFORCED ───────────────────────────────────────────────────
 * Netlify Forms cannot validate Turnstile, so the dialog POSTs to `endpoint`
 * (netlify/functions/enquiry.mjs) instead of straight to Netlify. That function
 * checks the honeypot, verifies the token against Cloudflare with the SECRET
 * key, and only then forwards the submission into Netlify Forms — so it still
 * lands in the dashboard. The honeypot stays as a second, independent layer.
 *
 * LIMITATION, stated plainly: Netlify registers a form by parsing public HTML,
 * so `form-name=contact` is always discoverable and the bare Netlify endpoint
 * stays POST-able. A bot that scrapes this page and submits what it finds hits
 * the function and is blocked; one written specifically against Netlify Forms
 * could skip it, and would then meet the honeypot and Netlify's own spam
 * filtering. Closing that last gap means storing submissions in the function
 * rather than in Netlify Forms.
 *
 * ★ TO GO LIVE (2 minutes, free, no credit card):
 *   1. dash.cloudflare.com → Turnstile → Add site. Domain: semplodesign.com
 *      (add localhost too if you want to test locally). Widget mode: Managed.
 *   2. Paste the SITE key over `sitekey` below. It is public — safe to commit.
 *   3. Put the SECRET key in Netlify → Site configuration → Environment
 *      variables as TURNSTILE_SECRET_KEY (scope: Functions). Never commit it.
 * Until step 2 is done this holds Cloudflare's documented ALWAYS-PASSES TEST
 * key: it renders a real widget on any domain (localhost included) and always
 * issues a valid token, so the design and the e2e suite work out of the box —
 * but it blocks nothing. main.js logs a loud console warning while it is in use.
 */
export const captcha = {
  provider: 'turnstile',
  // SEMPLO's live Turnstile site key. Public by design (the SECRET key is the
  // half that must stay private — it lives only in Netlify's environment as
  // TURNSTILE_SECRET_KEY and is never in this repo).
  sitekey: '0x4AAAAAAEEhCNbT9NBnI65P',
  // Cloudflare's documented dummy keys — recognised so we can warn on them.
  //   1x…AA always passes · 2x…AB always fails · 3x…FF forces a challenge
  testKeys: ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF'],
  scriptSrc: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  // The verifying function. Not a prettier /api/… path on purpose: that would
  // need a netlify.toml redirect, and this site has no netlify.toml to conflict
  // with the deploy settings already configured in the Netlify UI.
  endpoint: '/.netlify/functions/enquiry',
}

// UI / chrome copy, bilingual as [bg, en].
export const ui = {
  brand: ['SEMPLO DESIGN', 'SEMPLO DESIGN'],
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
  // Light / dark switch. The nav shows an icon (a word pair would crowd the
  // 390px bar), so these are the accessible names — the action, not the state:
  // in light mode the button offers "Тъмен режим", and vice versa.
  theme: {
    toDark: ['Тъмен режим', 'Dark mode'],
    toLight: ['Светъл режим', 'Light mode'],
  },
  projects: {
    eyebrow: ['Избрани проекти', 'Selected work'],
    title: ['Завършени интериори.', 'Finished interiors.'],
    view: ['Разгледай', 'View project'],
    close: ['Затвори', 'Close'],
    // detail-overlay tabs (only shown for projects that have `sketches`)
    tabs: ['Изглед', 'View'], // the tablist's accessible name
    tabProject: ['Проект', 'Project'], // sketches / plans / visualizations
    tabGallery: ['Галерия', 'Gallery'], // the finished photography
    zoomIn: ['Увеличи скицата', 'Zoom the sketch'],
    zoomOut: ['Намали скицата', 'Zoom back out'],
  },
  pano: {
    badge: ['360°', '360°'],
    hint: ['Влачете, за да разгледате', 'Drag to look around'],
    rooms: ['Изберете стая', 'Choose a room'], // accessible name of the switcher
  },
  // Real SEMPLO contact details. Phone/email mirror `business` above (which is
  // what the JSON-LD reads) — keep the two in step.
  contact: {
    phone: [business.phone, business.phone],
    email: [business.email, business.email],
    addr: ['бул. „Околовръстен път“ 130, София', '130 Okolovrasten Pat Blvd, Sofia'],
    map: ['Отвори в Google Maps', 'Open in Google Maps'],
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
  // ── Отзиви / Reviews (see the `reviews` export) ──
  reviews: {
    eyebrow: ['Отзиви', 'Reviews'],
    title: ['Какво казват клиентите ни.', 'What our clients say.'],
    // {r} = the rating, {n} = the number of reviews (substituted in main.js)
    agg: ['{r} от 5 · {n} отзива в Google', '{r} out of 5 · {n} reviews on Google'],
    link: ['Прочетете всички в Google', 'Read them all on Google'],
    of: ['{r} от 5 звезди', '{r} out of 5 stars'],
    todo: ['ПРИМЕРЕН ОТЗИВ', 'PLACEHOLDER'],
  },
  // ── Contact form (the modal behind the "Свържете се с нас" button) ──
  // Field values POSTed to Netlify stay in Bulgarian whatever the UI language,
  // so the client reads one consistent vocabulary in their dashboard.
  form: {
    open: ['Свържете се с нас', 'Get in touch'],
    title: ['Разкажете ни за проекта', 'Tell us about your project'],
    intro: [
      'Отговаряме в рамките на един работен ден. Полетата със звездичка са задължителни.',
      'We reply within one working day. Fields marked with an asterisk are required.',
    ],
    close: ['Затвори', 'Close'],
    name: ['Име', 'Name'],
    namePh: ['Име и фамилия', 'First and last name'],
    email: ['Имейл', 'Email'],
    emailPh: ['вашият@имейл.com', 'your@email.com'],
    phone: ['Телефон', 'Phone'],
    phonePh: ['+359 …', '+359 …'],
    type: ['Тип проект', 'Project type'],
    stage: ['Етап', 'Project stage'],
    size: ['Площ (кв.м)', 'Size (m²)'],
    sizePh: ['напр. 95', 'e.g. 95'],
    timeline: ['Кога', 'Timeline'],
    budget: ['Бюджет', 'Budget'],
    optional: ['по избор', 'optional'],
    message: ['Съобщение', 'Message'],
    messagePh: [
      'Няколко думи за пространството и какво търсите.',
      'A few words about the space and what you are looking for.',
    ],
    choose: ['Изберете…', 'Choose…'],
    submit: ['Изпратете запитване', 'Send enquiry'],
    sending: ['Изпраща се…', 'Sending…'],
    sentTitle: ['Благодарим!', 'Thank you!'],
    sentText: [
      'Получихме запитването ви и ще се свържем с вас в рамките на един работен ден.',
      'We have your enquiry and will be in touch within one working day.',
    ],
    sentClose: ['Затвори', 'Close'],
    errTitle: ['Нещо се обърка', 'Something went wrong'],
    errText: [
      'Запитването не беше изпратено. Опитайте отново или ни пишете директно на',
      'The enquiry was not sent. Please try again, or email us directly at',
    ],
    retry: ['Опитайте отново', 'Try again'],
    // ── Turnstile (see the `captcha` export) ──
    captchaLabel: ['Проверка за сигурност', 'Security check'],
    // shown in place of the widget while `captcha.sitekey` is still one of
    // Cloudflare's dummy keys — those issue a token with no visible widget, so
    // without this the form would show a labelled empty box and look broken
    captchaTestKey: ['ТЕСТОВ КЛЮЧ — БЕЗ ЗАЩИТА', 'TEST KEY — NO PROTECTION'],
    captchaNote: [
      'Защитено от Cloudflare Turnstile. Без проследяващи бисквитки.',
      'Protected by Cloudflare Turnstile. No tracking cookies.',
    ],
    // still waiting for the widget — not an error, just "one moment"
    captchaPendingTitle: ['Един момент', 'One moment'],
    captchaPendingText: [
      'Проверката за сигурност още не е завършила. Изчакайте да се появи отметката и опитайте отново.',
      'The security check has not finished yet. Wait for the tick to appear, then try again.',
    ],
    // the token was rejected by Cloudflare (or had already been used)
    captchaFailedTitle: ['Проверката за сигурност не мина', 'Security check failed'],
    captchaFailedText: [
      'Опитайте отново. Ако проблемът продължава, пишете ни директно на',
      'Please try again. If it keeps happening, email us directly at',
    ],
    // the widget script itself could not load (offline, blocked, ad-blocker)
    captchaLoadTitle: ['Проверката не може да се зареди', 'The check could not load'],
    captchaLoadText: [
      'Проверете връзката си или изключете блокиращите разширения. Или просто ни пишете на',
      'Check your connection or disable blocking extensions. Or simply email us at',
    ],
    // select options — `value` posted to Netlify is always the Bulgarian label
    types: {
      apartment: ['Апартамент', 'Apartment'],
      house: ['Къща', 'House'],
      office: ['Офис', 'Office'],
      restaurant: ['Ресторант', 'Restaurant'],
      other: ['Друго', 'Other'],
    },
    stages: {
      idea: ['Идея', 'Just an idea'],
      ready: ['Проект готов', 'Design already done'],
      works: ['В процес на ремонт', 'Works under way'],
    },
    timelines: {
      asap: ['Възможно най-скоро', 'As soon as possible'],
      m13: ['1–3 месеца', '1–3 months'],
      m36: ['3–6 месеца', '3–6 months'],
      later: ['След 6 месеца', 'In more than 6 months'],
      exploring: ['Още проучвам', 'Still exploring'],
    },
    budgets: {
      b1: ['до 20 000 €', 'up to €20,000'],
      b2: ['20 000 – 50 000 €', '€20,000 – €50,000'],
      b3: ['50 000 – 100 000 €', '€50,000 – €100,000'],
      b4: ['над 100 000 €', 'over €100,000'],
      unsure: ['Още не е определен', 'Not decided yet'],
    },
  },
  foot: {
    rights: [
      '© 2026 SEMPLO DESIGN — Интериорно студио · Всички права запазени',
      '© 2026 SEMPLO DESIGN — Interior studio · All rights reserved',
    ],
    // quiet studio credit under the © line (links to https://webservices.agency)
    credit: [
      'Изработка и поддръжка — webservices.agency',
      'Designed & maintained by webservices.agency',
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
  // 51, not 70: this is the one scroll-linked effect whose window is fixed by
  // the overlay viewport, so the global scroll slow-down (SPEED.distance = 1.38
  // in motion.js) has to come off the TRAVEL instead — 70 / 1.38 ≈ 51.
  panoScrollYaw: 51,

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
 * Paths into public/projects/<id>/gallery/ (900 variants — they render ~300px
 * tall). One frame per room-suite of the apartment: living, dining, bedroom,
 * office. */
export const strips = {
  portfolio: [
    '/projects/sofia-apartment/gallery/01-900.webp',
    '/projects/sofia-apartment/gallery/09-900.webp',
    '/projects/sofia-apartment/gallery/17-900.webp',
    '/projects/sofia-apartment/gallery/25-900.webp',
  ],
}
