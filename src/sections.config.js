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
  crf: 25, // both desktop tiers: the Kling 4K master looks the same at 25 and 23 (measured 2026-09-23)
  posterQuality: 85, // the hero poster is the page's LCP image — a notch above the default q80
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
    portraitCrf: 27, // background texture: its 1080×1920 portrait was the heaviest phone fetch (2.2 MB at 25)
    scrubVideo: true, // PATTERN B: position-linked scrub (no pin) on desktop
    eyebrowBg: 'Дневната', eyebrowEn: 'The living room',
    lineBg: 'Където денят се събира.', lineEn: 'Where the day gathers.',
  },
  {
    id: 'ambient2',
    role: 'ambient',
    src: 'kling_20260619_VIDEO_A_modern_l_488_0.mp4', // ← SWAP: near-still warm interior
    cropWatermark: 0.08,
    portraitCrf: 27, // background texture — see ambient1
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
 * The original flagship apartment harvested from semplodesign.com/projects/
 * ("Апартамент София", sofia-apartment) was REMOVED at the client's request on
 * 2026-09-22; its 32 photos, 4 panoramas and source manifest are parked in
 * archived/projects/sofia-apartment/ (outside the build) in case they want it
 * back — restore = move the folder back under assets/projects/ + re-add an entry.
 *
 * ── PORTFOLIO PAGE FIELDS (added 2026-09-16, pass 1) ──────────────────────
 * Every entry also feeds /portfolio/ (the card) and /portfolio/<id>/ (the
 * detail page). Both are GENERATED at build time by scripts/build-pages.mjs
 * from the fields below, so the static HTML carries the copy for crawlers:
 *   `category`   apartment | house | commercial — drives the filter row and
 *                the default `type` label (see ui.portfolio.cats / .types).
 *   `locationBg/En`  the meta row's first item ("София" / "Sofia").
 *   `typeBg/En`  OPTIONAL override of the category's singular label.
 *   `area`       OPTIONAL number, square metres. Omit it and the meta row
 *                simply shows location · type (the client has not supplied
 *                every area yet — the layout must not depend on it).
 *   `cover`      OPTIONAL gallery base name for the card cover + social card
 *                (defaults to the first gallery image).
 *   `cardBg/En`  the one-line blurb on the portfolio card.
 *   `conceptTitleBg/En` + `conceptBg/En`   left column of the text block.
 *   `realizationTitleBg/En` (optional, defaults to ui.portfolio.realization)
 *   + `realizationBg/En`                    right column ("От концепцията до
 *                                          реализацията").
 *   `todo`       list of field groups still holding PLACEHOLDER copy:
 *                'card' | 'concept' | 'realization' | 'area'. Those are badged
 *                on the page so nobody mistakes them for client copy. Delete
 *                the key once the real text is in.
 *   `updated`    OPTIONAL ISO date → <lastmod> for the page in sitemap.xml.
 * NO year anywhere on the portfolio pages — the client dropped it (the
 * homepage `metaBg/En` still carry it for the existing gallery cards only).
 */
export const projects = [
  /* ── the three FEATURED projects come first (homepage order = grid order) ── */
  {
    id: 'hillside',
    titleBg: 'Тристаен апартамент в затворен комплекс HILL SIDE',
    titleEn: 'Two-bedroom apartment in the HILL SIDE gated complex',
    category: 'apartment',
    locationBg: 'гр. София', locationEn: 'Sofia',
    area: 90, // Информация.pdf, 2026-09-16
    updated: '2026-09-16',
    cardBg:
      'Изискан съвременен интериор в топла неутрална палитра, съчетаващ естествени текстури, мебели по индивидуален проект и внимателно проектирано осветление.',
    cardEn:
      'A refined contemporary interior in a warm neutral palette, combining natural textures, bespoke furniture and carefully designed lighting.',
    conceptTitleBg: 'Мека елегантност и прецизно балансирани детайли',
    conceptTitleEn: 'Soft elegance and precisely balanced details',
    conceptBg:
      'Интериорът е развит в светла, топла и изискана палитра, в която неутралните тонове са комбинирани с естествено дърво, каменни текстури и деликатни метални акценти. Дневната зона е организирана компактно и функционално, а индивидуално проектираните мебели, осветените витрини и характерните облицовки създават усещане за завършеност. Двете спални продължават същия визуален език с меки линии, интегрирано осветление и мебели по мярка, докато антрето и баните добавят по-декоративен характер чрез огледала, релефни повърхности и внимателно подбрани материали.',
    conceptEn:
      'The interior unfolds in a light, warm and refined palette in which neutral tones are combined with natural wood, stone textures and delicate metal accents. The living area is organised compactly and functionally, while the bespoke furniture, lit display cabinets and distinctive wall cladding give a sense of completeness. The two bedrooms continue the same visual language with soft lines, integrated lighting and made-to-measure furniture, while the hallway and bathrooms add a more decorative character through mirrors, relief surfaces and carefully chosen materials.',
    realizationBg:
      'За SEMPLO Concept всеки проект е цялостен процес, в който дизайнът и реализацията се развиват заедно. Предлагаме пълна услуга — от интериорната концепция и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство позволява всеки детайл да бъде изпълнен като естествено продължение на интериорната концепция — с контрол върху качеството, пропорциите и крайния резултат. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept every project is a single process in which design and execution evolve together. We offer a complete service — from the interior concept and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets every detail be executed as a natural continuation of the interior concept — with control over quality, proportion and the final result. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    // ONE project: the VIP HALL and the WINE BAR are the same building (client
    // decision 2026-09-16; merged deck in _source/, gallery ordered hall → bar)
    id: 'villa-grivitsa',
    titleBg: 'Вила Гривица', titleEn: 'Villa Grivitsa',
    category: 'commercial',
    locationBg: 'село Гривица', locationEn: 'Grivitsa village',
    // area: none supplied (Информация.pdf lists no figure) — omitted on purpose
    updated: '2026-09-22',
    // 360° — DELIVERED 2026-09-21 (email "Вила Гривица", six Homestyler ZIPs):
    // one viewpoint kept per space (see source-manifest.json for the rejects)
    panoramas: [
      { file: 'vip-hall', bg: 'ВИП зала', en: 'VIP hall' },
      { file: 'wine-bar', bg: 'Винен бар', en: 'Wine bar' },
    ],
    cardBg:
      'VIP зала и бутиков винен бар под един покрив — топло дърво, кожа, камък и прецизно осветление за дегустации, срещи и специални поводи.',
    cardEn:
      'A VIP hall and a boutique wine bar under one roof — warm wood, leather, stone and precise lighting for tastings, meetings and special occasions.',
    conceptTitleBg: 'Бутикова атмосфера за специални моменти — VIP зала и винен бар',
    conceptTitleEn: 'A boutique setting for special moments — VIP hall and wine bar',
    conceptBg:
      'VIP залата е създадена като изискано пространство за срещи, дегустации и събития — топли дървесни повърхности, светли мебели и зелени текстилни акценти изграждат балансирана и уютна среда, а линейното осветление и декоративните детайли подчертават архитектурата на залата. Винният бар под нея е изграден около усещането за интимност и премиум преживяване: топли дървесни текстури и карамелени кожени мебели, черни каменни повърхности, метални детайли и меко акцентно осветление. Вградените винени композиции и осветените ниши превръщат самата селекция от вина в част от архитектурата, а зоните за дегустация и почивка създават комфортна среда за по-дълъг престой.',
    conceptEn:
      'The VIP hall is conceived as a refined space for meetings, tastings and events — warm wood surfaces, light furniture and green textile accents build a balanced, welcoming setting, while the linear lighting and decorative details underline the architecture of the hall. The wine bar below it is built around intimacy and a premium experience: warm wood textures and caramel leather furniture, black stone surfaces, metal details and soft accent lighting. The built-in wine displays and lit niches turn the wine selection itself into part of the architecture, while the tasting and lounge areas create a comfortable setting for a longer stay.',
    realizationBg:
      'За SEMPLO Concept търговските и hospitality пространства трябва не просто да изглеждат добре, а да създават преживяване и разпознаваема идентичност. Предлагаме цялостна услуга — от интериорната концепция и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели и специфични елементи по индивидуален проект. Така всеки детайл — от винените стелажи и облицовките до осветлението и мебелите — може да бъде реализиран като част от една последователна концепция. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept, commercial and hospitality spaces must not merely look good — they have to create an experience and a recognisable identity. We offer a complete service — from the interior concept and technical design to the selection of materials, the construction works and the production of bespoke furniture and special elements. That way every detail — from the wine racks and wall cladding to the lighting and furniture — can be realised as part of one consistent concept. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    id: 'house-troyan',
    // copy + area DELIVERED 2026-09-23 (email "Fwd: Видео- къща Троян", docx
    // "Двуетажна къща в Троян"); BG verbatim, EN drafted by us
    titleBg: 'Двуетажна къща в Троян', titleEn: 'Two-storey house in Troyan',
    category: 'house',
    locationBg: 'Троян', locationEn: 'Troyan',
    area: 377, // РЗП 377,2 кв.м (ЗП 226 кв.м) per the docx — total floor area shown, rounded
    updated: '2026-09-23',
    panoramas: [
      { file: 'living', bg: 'Дневна', en: 'Living room' },
      { file: 'bedroom', bg: 'Спалня', en: 'Bedroom' },
    ],
    cardBg:
      'Изискан съвременен интериор с богати текстури, мраморни и дървесни акценти, индивидуален мебелен дизайн и прецизно проектирано осветление.',
    cardEn:
      'A refined contemporary interior with rich textures, marble and wood accents, bespoke furniture design and precisely planned lighting.',
    conceptTitleBg: 'Модерен лукс с топъл органичен характер',
    conceptTitleEn: 'Modern luxury with a warm, organic character',
    conceptBg:
      'Интериорът изгражда перфектен баланс между съвременна елегантност и естествен уют. Дневната зона се откроява с ярък акцент в наситено смарагдовозелено, хармонично съчетан с топла дървесна текстура, каменни облицовки с подчертана структура и ефирни светли тонове. Кухнята и трапезарията залагат на чисти линии, кухненски остров с елегантно скрито осветление и дизайнерски осветителни тела. В спалнята и антрето са използвани вертикални дървесни панели, огледала и амбиентно осветление, които създават усещане за дълбочина и архитектурна завършеност, докато банята драматично комбинира светъл и тъмен камък с меки дървесни елементи.',
    conceptEn:
      'The interior strikes a perfect balance between contemporary elegance and natural comfort. The living area stands out with a bold accent in deep emerald green, harmoniously paired with warm wood texture, stone cladding with a pronounced structure and airy light tones. The kitchen and dining room rely on clean lines, a kitchen island with elegantly concealed lighting and designer light fittings. In the bedroom and the hallway, vertical wood panels, mirrors and ambient lighting create a sense of depth and architectural completeness, while the bathroom dramatically combines light and dark stone with soft wooden elements.',
    // the docx's "От концепцията до реализацията" text is word-for-word the HILL SIDE
    // one (its "результат" typo corrected to "резултат")
    realizationBg:
      'За SEMPLO Concept всеки проект е цялостен процес, в който дизайнът и реализацията се развиват заедно. Предлагаме пълна услуга — от интериорната концепция и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство позволява всеки детайл да бъде изпълнен като естествено продължение на интериорната концепция — с контрол върху качеството, пропорциите и крайния резултат. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept every project is a single process in which design and execution evolve together. We offer a complete service — from the interior concept and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets every detail be executed as a natural continuation of the interior concept — with control over quality, proportion and the final result. SEMPLO Concept — from idea to a fully finished interior.',
  },

  /* ── the rest of the portfolio ── */
  {
    id: 'gravity-house',
    titleBg: 'Къща в жилищен комплекс Gravity Homes & Living',
    titleEn: 'House in the Gravity Homes & Living complex',
    category: 'house',
    locationBg: 'гр. София', locationEn: 'Sofia',
    area: 190,
    updated: '2026-09-16',
    cardBg:
      'Съвременен интериор с премиум излъчване, в който естественото дърво, камъкът, меките текстури и индивидуалните мебели създават балансирана и отличителна атмосфера.',
    cardEn:
      'A contemporary interior with a premium feel, where natural wood, stone, soft textures and bespoke furniture create a balanced, distinctive atmosphere.',
    conceptTitleBg: 'Съвременен лукс с естествен характер',
    conceptTitleEn: 'Contemporary luxury with a natural character',
    conceptBg:
      'Интериорът е изграден в топла и дълбока цветова палитра, в която естественото дърво, камъкът, текстилът и фините метални акценти се допълват в балансирана композиция. Дневната зона обединява кухня, трапезария и кът за почивка, като тъмните дървесни повърхности и каменният остров придават изразителен характер, а меката мебел и скритото осветление внасят визуална лекота и уют. Същият дизайнерски език преминава през спалните, баните, офиса и комуникационните пространства, създавайки цялостен и последователен интериор.',
    conceptEn:
      'The interior is built in a warm, deep colour palette in which natural wood, stone, textiles and fine metal accents complement one another in a balanced composition. The living area brings together the kitchen, the dining room and a lounge corner: the dark wood surfaces and the stone island give it an expressive character, while the soft furniture and concealed lighting bring visual lightness and comfort. The same design language runs through the bedrooms, bathrooms, office and circulation spaces, creating a complete, consistent interior.',
    realizationBg:
      'За SEMPLO Concept интериорният проект е цялостен процес, в който архитектурата, материалите, мебелите и изпълнението се развиват като една обща концепция. Предлагаме пълна услуга — от интериорното и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство ни позволява да реализираме специфичните мебели и детайли с прецизност и контрол върху качеството във всеки етап. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept an interior project is a single process in which the architecture, the materials, the furniture and the execution evolve as one overall concept. We offer a complete service — from interior and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets us realise the specific furniture and details with precision and control over quality at every stage. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    id: 'bimbashov',
    titleBg: 'Тристаен апартамент в жилищен комплекс Gravity Homes & Living',
    titleEn: 'Two-bedroom apartment in the Gravity Homes & Living complex',
    category: 'apartment',
    locationBg: 'гр. София', locationEn: 'Sofia',
    area: 100,
    updated: '2026-09-16',
    cardBg:
      'Светъл съвременен интериор с минималистична линия, естествени текстури и индивидуално проектирани мебели, създаден с внимание към функционалността, светлината и детайла.',
    cardEn:
      'A light contemporary interior with a minimalist line, natural textures and bespoke furniture, designed with care for function, light and detail.',
    conceptTitleBg: 'Светлина, баланс и съвременна елегантност',
    conceptTitleEn: 'Light, balance and contemporary elegance',
    conceptBg:
      'Интериорът е изграден върху минимализъм, светлина и изтънченост — трите водещи принципа в концепцията на проекта. Светлата неутрална палитра, естествените дървесни текстури и прецизните черни и зелени акценти създават спокойна, модерна и балансирана среда. Индиректното осветление, индивидуално проектираните мебели и внимателно подбраните детайли обединяват отделните помещения в един цялостен визуален език.',
    conceptEn:
      'The interior rests on minimalism, light and refinement — the three guiding principles of the project. The light neutral palette, natural wood textures and precise black and green accents create a calm, modern and balanced environment. Indirect lighting, bespoke furniture and carefully chosen details bring the individual rooms together into one coherent visual language.',
    realizationBg:
      'За SEMPLO Concept интериорният проект е само началото на процеса. Ние предлагаме цялостна услуга — от интериорната концепция и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство ни позволява да реализираме мебелите и специфичните интериорни детайли като естествено продължение на проекта, с контрол върху качеството и изпълнението на всеки етап. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept the interior design is only the beginning of the process. We offer a complete service — from the interior concept and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets us realise the furniture and the specific interior details as a natural continuation of the project, with control over quality and execution at every stage. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    id: 'uzunov',
    titleBg: 'Дневна с кухня и трапезария',
    titleEn: 'Living room with kitchen and dining',
    category: 'house',
    locationBg: 'гр. София', locationEn: 'Sofia',
    area: 65,
    updated: '2026-09-16',
    cardBg:
      'Съвременен интериор в топла неутрална палитра, в който естествените материали, индивидуалните мебели и характерната камина създават хармонично и функционално пространство.',
    cardEn:
      'A contemporary interior in a warm neutral palette, where natural materials, bespoke furniture and the distinctive fireplace create a harmonious, functional space.',
    conceptTitleBg: 'Топъл минимализъм и естествен баланс',
    conceptTitleEn: 'Warm minimalism and natural balance',
    conceptBg:
      'Интериорът е развит в спокойна неутрална палитра от бежово, кремаво и естествени дървесни тонове, подчертани с графични черни акценти. Камината е превърната в централен архитектурен елемент, който добавя характер и същевременно оформя плавен преход между отделните функционални зони. Светлите каменни текстури, индивидуално проектираните мебели и меките обеми създават съвременна среда с усещане за комфорт, лекота и завършеност.',
    conceptEn:
      'The interior is developed in a calm neutral palette of beige, cream and natural wood tones, underlined by graphic black accents. The fireplace becomes the central architectural element, adding character while shaping a smooth transition between the functional zones. Light stone textures, bespoke furniture and soft volumes create a contemporary setting with a sense of comfort, lightness and completeness.',
    realizationBg:
      'За SEMPLO Concept всеки интериор е цялостен процес, в който дизайнът, материалите и изпълнението се развиват като една обща концепция. Предлагаме пълна услуга — от интериорното и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство позволява специфичните мебели и интериорни детайли да бъдат реализирани с прецизност и контрол върху всеки етап. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept every interior is a single process in which the design, the materials and the execution evolve as one concept. We offer a complete service — from interior and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets the specific furniture and interior details be realised with precision and control at every stage. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    id: 'konna-baza',
    titleBg: 'Конна база', titleEn: 'Equestrian Base',
    category: 'apartment', // as typed by the client ("апартамент") — see Информация.pdf
    locationBg: 'гр. Божурище', locationEn: 'Bozhurishte',
    area: 45,
    updated: '2026-09-24', // revised deck ("Конна база ново.pdf") + revised copy ("Текст нов.docx", same day)
    // copy = the client's revised text.docx of 2026-09-24 14:43, verbatim (the
    // trailing "Конна база ново" in its concept paragraph is the deck's file
    // name, not copy — left out)
    cardBg:
      'Топъл и характерен интериор, в който естественото дърво, наситеното зелено и меките неутрални текстури създават съвременна, уютна и разпознаваема атмосфера.',
    cardEn:
      'A warm, characterful interior in which natural wood, deep green and soft neutral textures create a contemporary, cosy and recognisable atmosphere.',
    conceptTitleBg:
      'Естествен характер и съвременен уют',
    conceptTitleEn:
      'Natural character and contemporary comfort',
    conceptBg:
      'Интериорът е изграден около топлината на естественото дърво, земните тонове и наситеното зелено. Тъмните дървесни повърхности придават дълбочина на дневната зона, докато характерният зелен диван, светлата трапезария и меките текстури внасят баланс и комфорт. В спалнята по-светлите дървесни мебели и неутралният текстил създават по-спокойна и уютна атмосфера, а банята продължава концепцията с меки каменни нюанси, релефни повърхности и топло осветление.',
    conceptEn:
      'The interior is built around the warmth of natural wood, earthy tones and a deep green. Dark wood surfaces give the living area depth, while the signature green sofa, the light dining set and the soft textures bring balance and comfort. In the bedroom the lighter wooden furniture and neutral textiles create a calmer, cosier atmosphere, and the bathroom carries the concept on with soft stone shades, relief surfaces and warm lighting.',
    realizationBg:
      'За SEMPLO Concept всеки интериор е цялостен процес, в който дизайнът, материалите и мебелите се развиват като една обща концепция. Предлагаме интериорно и техническо проектиране, подбор на материали, строително-ремонтни дейности и производство на мебели по индивидуален проект. Така можем да контролираме всеки детайл и да превърнем първоначалната идея в напълно завършено пространство. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept every interior is a single process in which the design, the materials and the furniture evolve as one overall concept. We offer interior and technical design, the selection of materials, construction works and the production of bespoke furniture. That lets us control every detail and turn the initial idea into a fully finished space. SEMPLO Concept — from idea to a fully finished interior.',
  },
  {
    id: 'sofia-2',
    titleBg: 'Двустаен апартамент', titleEn: 'One-bedroom apartment',
    category: 'apartment',
    locationBg: 'гр. София', locationEn: 'Sofia',
    area: 38, // Информация.pdf, 2026-09-16
    updated: '2026-09-16',
    cardBg:
      'Елегантен съвременен интериор в светла неутрална палитра, допълнен от тъмно дърво, зелени каменни акценти и индивидуално проектирани мебели.',
    cardEn:
      'An elegant contemporary interior in a light neutral palette, complemented by dark wood, green stone accents and bespoke furniture.',
    conceptTitleBg: 'Мека елегантност и съвременен лукс',
    conceptTitleEn: 'Soft elegance and contemporary luxury',
    conceptBg:
      'Интериорът е разработен в спокойна кремаво-бежова палитра, комбинирана с естествени дървесни текстури, тъмни акценти и детайли в златист метал. В спалнята интегрираната витрина и декоративните стенни панели създават дълбочина и усещане за премиум завършеност, докато компактната дневна с кухня е организирана функционално и визуално леко. В банята наситеният зелен камък се превръща в основен акцент и придава силен, отличителен характер на пространството.',
    conceptEn:
      'The interior is developed in a calm cream-and-beige palette, combined with natural wood textures, dark accents and details in golden metal. In the bedroom the integrated display cabinet and decorative wall panels create depth and a sense of premium finish, while the compact living room with kitchen is organised to be functional and visually light. In the bathroom the deep green stone becomes the main accent and gives the space a strong, distinctive character.',
    realizationBg:
      'За SEMPLO Concept всеки интериор е цялостен процес, в който концепцията, материалите, мебелите и изпълнението се развиват като една обща идея. Предлагаме пълна услуга — от интериорното и техническото проектиране до подбора на материали, строително-ремонтните дейности и производството на мебели по индивидуален проект. Собственото ни производство ни позволява да реализираме всеки специфичен детайл с прецизност и контрол върху качеството във всеки етап. SEMPLO Concept — от идея до напълно завършен интериор.',
    realizationEn:
      'For SEMPLO Concept every interior is a single process in which the concept, the materials, the furniture and the execution evolve as one idea. We offer a complete service — from interior and technical design to the selection of materials, the construction works and the production of bespoke furniture. Our own workshop lets us realise every specific detail with precision and control over quality at every stage. SEMPLO Concept — from idea to a fully finished interior.',
  },
]

/*
 * ── FEATURED — the homepage "Избрани проекти" (Selected projects) ─────────
 * Three projects, each a full-bleed scroll-scrubbed video section (PATTERN B,
 * the same treatment as the ambient strips — the client specifically wants
 * this presentation kept) with the project title overlaid and a link to its
 * /portfolio/<id>/ page. Order here = order on the page.
 *
 * VIDEO SLOTS — the client is delivering animated MP4s. Each slot names the
 * file to DROP INTO assets/videos/ (`src`); until it exists the optimizer
 * encodes `placeholderSrc` instead and marks the manifest entry
 * `placeholder`. So the swap is: copy the delivered clip to
 *     assets/videos/featured-hillside.mp4
 *     assets/videos/featured-villa-grivitsa.mp4
 *     assets/videos/featured-house-troyan.mp4
 * then `npm run optimize:videos` and commit public/videos/ + the manifest.
 * No config edit needed. If a delivered clip carries a Kling-style watermark,
 * set its `cropWatermark` to 0.08 (currently set per PLACEHOLDER clip).
 */
export const featured = [
  {
    id: 'featured-hillside',
    role: 'featured',
    project: 'hillside',
    // DELIVERED 2026-09-16 ("Нели Хил сайд-1.mp4", email "Видео"): 1920×1080,
    // 60 fps, 15.45 s, H.264, no audio, no watermark — three hard-cut shots
    // (kitchen → sofa → TV wall), the last with the SEMPLO CONCEPT STORE placard
    // on the TV (in the render, not an overlay).
    src: 'featured-hillside.mp4',
    placeholderSrc: 'kling_20260619_VIDEO_Cinematic__1064_0.mp4', // no longer used — the real clip exists
    cropWatermark: 0, // clean delivery, full frame (the placeholder needed 0.08)
    // the camera slides in from off-frame BLACK over the first 11 frames (a
    // 285px black band down the left edge at frame 0, gone by 0.2s) — and frame
    // 0 is the poster + the scrub's resting frame, so drop that head
    trimStart: 0.25,
    scrubVideo: true,
  },
  {
    id: 'featured-villa-grivitsa',
    role: 'featured',
    project: 'villa-grivitsa',
    // DELIVERED 2026-09-23 ("VipZALAGRIVITSA-1.mp4", thread "Re: Вила Гривица"):
    // 1920×1080, 60 fps (genuine), 10.15 s, H.264, no audio — ONE continuous
    // dolly down the VIP hall to the TV wall, no cuts, clean frame 0 (no trim).
    // HOMESTYLER logo burned into the bottom-right corner (rows 1013–1043 of 1080).
    src: 'featured-villa-grivitsa.mp4',
    placeholderSrc: 'semplo-the_living_room.mp4', // no longer used — the real clip exists
    cropWatermark: 0.08, // drops the bottom 86 px → HOMESTYLER mark gone (0.06 left its top edge)
    scrubVideo: true,
  },
  {
    id: 'featured-house-troyan',
    role: 'featured',
    project: 'house-troyan',
    // DELIVERED 2026-09-23 ("YouCut_20260923_151806551.mp4" on Drive, email
    // "Fwd: Видео- къща Троян"): 1624×1080 (3:2, SAR 405:406), 50 fps container
    // but only ~12.5 UNIQUE frames/s (a Kling AI 3.0 clip slowed ~2× in YouCut —
    // every frame is held for four), 10.17 s, silent AAC track (stripped). ONE
    // continuous push from the sofa toward the kitchen, no cuts, clean frame 0.
    // "KlingAI 3.0" mark burned into the bottom-right corner (rows 1021–1040 of 1080).
    src: 'featured-house-troyan.mp4',
    placeholderSrc: 'kling_20260619_VIDEO_A_big_mode_919_0.mp4', // no longer used — the real clip exists
    cropWatermark: 0.08, // drops the bottom 86 px → KlingAI mark gone
    scrubVideo: true,
  },
]

/*
 * ── PORTFOLIO — the full-portfolio page + one page per project ─────────────
 * `path` is the URL root of the generated pages (scripts/build-pages.mjs):
 *     <path>            the filterable grid of every project above
 *     <path><id>/       the project's own page (hero slider, meta, text,
 *                       gallery, 360° block when it has rooms, prev/next)
 * Deliberately NOT /projects/: that prefix already serves the committed media
 * (public/projects/<id>/…), the Vercel cache rule gives it a 30-day max-age
 * (fatal for HTML), and the retired WordPress site used /projects/ too — the
 * e2e suite treats links to that path as legacy 404s.
 * `heroFrames` — how many gallery photos the detail hero slider shows (the
 * full gallery follows below, so the slider stays light).
 */
export const portfolio = {
  path: '/portfolio/',
  heroFrames: 8,
  categories: ['apartment', 'house', 'commercial'],
}

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
   * DNS (managed at SuperHosting) points the web records at Vercel, which
   * provisions certificates for semplodesign.com and www. vercel.json 301s
   * www to this exact origin (Vercel itself upgrades plain http), so the
   * canonical, the redirect target and every mirrored copy agree. The
   * .htaccess in public/ keeps the same policy for the cPanel fallback.
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
 * ★ HOW TO MAINTAIN (open business.map.link → "Reviews"):
 *   1. `rating` / `count` — the listing's headline score and total review count.
 *      These two power the AggregateRating, so they must match the listing.
 *      Re-check them whenever a review is added — they drift.
 *   2. one `items` entry per review you want to show (3–6 reads best):
 *        author  — the reviewer's display name, as Google shows it
 *        rating  — 1–5, as given
 *        date    — ISO yyyy-mm-dd (Google shows "2 months ago"; approximate it)
 *        lang    — 'bg' | 'en': the language the review was WRITTEN in. That
 *                  column is the verbatim text and is what the JSON-LD
 *                  publishes; the other column is our translation for the
 *                  language toggle.
 *        textBg / textEn — the review in each UI language (one verbatim, one
 *                  translated — see `lang`)
 *        todo    — a `todo` flag (true) marks a demo/placeholder entry. Such
 *                  entries are dimmed and badged in the UI and LEFT OUT of the
 *                  JSON-LD. There are none now (all three below are real,
 *                  2026-09-24) and none may ship to production.
 *
 * With no `todo`-free entry main.js would emit NO review schema at all —
 * deliberate: fake reviews in schema are a manual-action risk.
 */
export const reviews = {
  rating: 4.5, // their live Google rating on 2026-09-24 (was 4.4 on 2026-08-02)
  count: 16, // their live Google review count on 2026-09-24 (was 14)
  url: 'https://maps.app.goo.gl/RW5PLieX7xKHSCPx5', // read / leave a review
  // Three real Google reviews, transcribed from the screenshots the studio sent
  // on 2026-09-24 ("Re: Вила Гривица", ревю.jpg / ревю 2.jpg / ревю 3.jpg).
  // `date` is approximated from Google's relative stamp on that day ("a year
  // ago" → 2025-09, "just now" → the day of the screenshot). `lang` marks the
  // language the review was WRITTEN in — the other column is our translation,
  // and schema.js publishes the original as reviewBody.
  items: [
    {
      author: 'Кристина Хаджиева',
      rating: 5,
      date: '2026-09-24', // "just now" on the screenshot day
      lang: 'bg',
      textBg:
        'Изключително съм доволна от целия процес и крайния резултат. Още от първите разговори усетих, че идеите и желанията ми са разбрани, а крайният проект надмина очакванията ми. Всеки детайл беше внимателно обмислен, а съчетанието между естетика, функционалност и индивидуален подход направи пространството наистина мое. Благодаря за професионализма, търпението и отношението през целия процес. С удоволствие бих се доверила на Semplo Concept отново!',
      textEn:
        'I am extremely happy with the whole process and the final result. From the very first conversations I felt that my ideas and wishes were understood, and the final project exceeded my expectations. Every detail was carefully thought through, and the combination of aesthetics, functionality and an individual approach made the space truly mine. Thank you for the professionalism, the patience and the attitude throughout the whole process. I would gladly trust Semplo Concept again!',
    },
    {
      author: "Nicolas d'ambra", // straight apostrophe, as Google shows it
      rating: 5,
      date: '2025-09-01', // "a year ago" on 2026-09-24
      lang: 'en', // written in English — textBg is our translation
      textBg:
        'Наскоро възложих на Semplo Design обновяването на интериора си и съм абсолютно възхитен от резултата. Екипът показа образцов професионализъм, вслушваше се внимателно в нуждите ми и предлагаше креативни решения. Шоурумът им е истински източник на вдъхновение с широка гама от мебели и дизайни за всякакъв вкус. Горещо препоръчвам Semplo Design на всеки, който иска да преобрази своя дом.',
      textEn:
        'I recently hired Semplo Design to renovate my interior, and I am absolutely delighted with the result. The team demonstrated exemplary professionalism, listening carefully to my needs and offering creative solutions. Their showroom is a true source of inspiration, offering a wide range of furniture and designs to suit all tastes. I highly recommend Semplo Design to anyone looking to transform their living space.',
    },
    {
      author: 'Selcuk Coskunoglu',
      rating: 5,
      date: '2025-09-01', // "a year ago" on 2026-09-24
      lang: 'bg',
      textBg:
        'Вашият ангажимент към качеството личи във всеки аспект на работата ви. Вниманието към детайла, иновативните дизайни и стремежът към създаване на изключителни потребителски изживявания ви отличават. Ясно е, че съвършенството е в основата на всичко, което правите- продължавайте с невероятната работа!!!!',
      textEn:
        'Your commitment to quality shows in every aspect of your work. The attention to detail, the innovative designs and the drive to create exceptional customer experiences set you apart. It is clear that excellence is at the heart of everything you do – keep up the incredible work!!!!',
    },
  ],
}

/*
 * ── SPAM PROTECTION — Cloudflare Turnstile ────────────────────────────────
 * Chosen over reCAPTCHA 2 on four counts: Turnstile's managed mode usually
 * passes with no interaction (a checkbox click, sometimes an image puzzle, is
 * real friction on a lead form); it is ~60–90 KB against reCAPTCHA's
 * ~400–600 KB; it sets no cross-site tracking cookies and ships an
 * EU-jurisdiction DPA, which matters for a Bulgarian studio collecting leads;
 * and it takes `theme`, `size: flexible` and `language`, so it follows this
 * site's light/dark tokens, field rhythm and BG/EN toggle instead of pasting a
 * Google-branded box into the middle of the form. It is also loaded only when
 * the dialog opens — a visitor who never enquires never pays for it.
 *
 * ── HOW IT IS ENFORCED ───────────────────────────────────────────────────
 * The dialog POSTs to `endpoint` (api/enquiry.js, a Vercel serverless
 * function). That function checks the honeypot, verifies the token against
 * Cloudflare with the SECRET key, and only then EMAILS the enquiry to the
 * studio over SuperHosting's SMTP (Reply-To = the enquirer, so the studio
 * just hits Reply). The honeypot stays as a second, independent layer.
 *
 * A hosted form service is deliberately NOT used (the free tier of the one we
 * once relied on silently stopped storing at 100 submissions/month —
 * enquiries vanishing mid-ad-campaign — which is what pushed the form to
 * self-hosted email), and there is no second, unverified endpoint a bot could
 * POST around this function. The secret lives only in Vercel environment
 * variables, never in this repo (details in api/enquiry.js and the README).
 * public/api/enquiry.php is the tested SuperHosting/cPanel fallback of the
 * same contract (secrets outside public_html — see
 * server/enquiry.config.example.php).
 *
 * ★ TO GO LIVE (2 minutes, free, no credit card):
 *   1. dash.cloudflare.com → Turnstile → Add site. Domain: semplodesign.com
 *      (add localhost too if you want to test locally). Widget mode: Managed.
 *   2. Paste the SITE key over `sitekey` below. It is public — safe to commit.
 *   3. Put the SECRET key in Vercel → Project → Settings → Environment
 *      Variables as TURNSTILE_SECRET_KEY. Never commit it.
 * Until step 2 is done this holds Cloudflare's documented ALWAYS-PASSES TEST
 * key: it renders a real widget on any domain (localhost included) and always
 * issues a valid token, so the design and the e2e suite work out of the box —
 * but it blocks nothing. main.js logs a loud console warning while it is in use.
 */
export const captcha = {
  provider: 'turnstile',
  // SEMPLO's live Turnstile site key. Public by design (the SECRET key is the
  // half that must stay private — it lives only in Vercel's environment
  // variables and is never in this repo).
  sitekey: '0x4AAAAAAEEhCNbT9NBnI65P',
  // Cloudflare's documented dummy keys — recognised so we can warn on them.
  //   1x…AA always passes · 2x…AB always fails · 3x…FF forces a challenge
  testKeys: ['1x00000000000000000000AA', '2x00000000000000000000AB', '3x00000000000000000000FF'],
  scriptSrc: 'https://challenges.cloudflare.com/turnstile/v0/api.js',
  // The verifying + emailing endpoint: the Vercel serverless function in
  // api/enquiry.js, deployed alongside the static build. (The cPanel fallback
  // lives at /api/enquiry.php inside dist/ — switch this path if the site
  // ever moves back to SuperHosting.)
  endpoint: '/api/enquiry',
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
  // ── homepage "Избрани проекти" — three featured video sections (see `featured`) ──
  projects: {
    eyebrow: ['Портфолио', 'Portfolio'],
    title: ['Избрани проекти', 'Selected projects'],
    view: ['Разгледай проекта', 'View project'], // the link on each featured section
    more: ['Разгледайте всички проекти', 'View all projects'], // → /portfolio/ (arrow added in CSS)
  },
  pano: {
    badge: ['360°', '360°'],
    hint: ['Влачете, за да разгледате', 'Drag to look around'],
    rooms: ['Изберете стая', 'Choose a room'], // accessible name of the switcher
  },
  // ── /portfolio/ + /portfolio/<id>/ (see the `portfolio` export) ──
  // Section titles agreed with the client 2026-09-16: the homepage keeps
  // "Избрани проекти / Selected projects", the full portfolio page is
  // "Интериорни проекти / Interior projects".
  portfolio: {
    eyebrow: ['Портфолио', 'Portfolio'],
    title: ['Интериорни проекти', 'Interior projects'],
    intro: [
      'Апартаменти, къщи и търговски пространства — проектирани и изпълнени от SEMPLO DESIGN.',
      'Apartments, houses and commercial spaces — designed and delivered by SEMPLO DESIGN.',
    ],
    filter: ['Филтър по категория', 'Filter by category'], // the row's accessible name
    all: ['Всички', 'All'],
    // plural — the filter chips
    cats: {
      apartment: ['Апартаменти', 'Apartments'],
      house: ['Къщи', 'Houses'],
      commercial: ['Търговски пространства', 'Commercial spaces'],
    },
    // singular — the card eyebrow and the detail page's `type` (unless overridden)
    types: {
      apartment: ['Апартамент', 'Apartment'],
      house: ['Къща', 'House'],
      commercial: ['Търговско пространство', 'Commercial space'],
    },
    area: ['{n} кв.м', '{n} m²'], // {n} = the number
    view: ['Разгледай проекта', 'View project'],
    empty: ['Все още няма проекти в тази категория.', 'No projects in this category yet.'],
    // detail page
    slider: ['Снимки от проекта', 'Project photos'], // the hero carousel's accessible name
    prev: ['Предишна снимка', 'Previous photo'],
    next: ['Следваща снимка', 'Next photo'],
    realization: ['От концепцията до реализацията', 'From concept to realisation'],
    gallery: ['Галерия', 'Gallery'],
    pano: ['360° разходка', '360° walkthrough'],
    other: ['Други проекти', 'Other projects'], // prev/next nav accessible name
    prevProject: ['Предишен проект', 'Previous project'],
    nextProject: ['Следващ проект', 'Next project'],
    allProjects: ['Всички проекти', 'All projects'],
    ctaTitle: ['Имате подобен проект?', 'Have a project like this?'],
    ctaText: [
      'Разкажете ни за пространството — отговаряме в рамките на един работен ден.',
      'Tell us about the space — we reply within one working day.',
    ],
    // The placeholder badge labels (`todo`, `todoArea`, `todoAreaMissing`) were
    // removed 2026-09-24 with the last placeholder copy — nothing in `projects`
    // carries a `todo` list any more. build-pages.mjs falls back to a plain
    // "TODO" badge should one ever come back during a client preview.
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
    // no `todo` badge label any more — all reviews are real (2026-09-24);
    // main.js falls back to "TODO" if a placeholder entry ever reappears
  },
  // ── Contact form (the modal behind the "Свържете се с нас" button) ──
  // Field values POSTed to the function stay in Bulgarian whatever the UI
  // language, so the studio reads one consistent vocabulary in the enquiry
  // emails it receives.
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
    // select options — the `value` that lands in the enquiry email is always
    // the Bulgarian label
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

  // (PATTERN C — the gallery card film strips — was retired 2026-09-16; the
  // homepage shows three featured scrub-video sections instead, see `featured`.)
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
 * tall). One frame per project: the three featured ones + Gravity House
 * (was four rooms of sofia-apartment until that project was removed 2026-09-22). */
export const strips = {
  portfolio: [
    '/projects/hillside/gallery/01-900.webp',
    '/projects/villa-grivitsa/gallery/01-900.webp',
    '/projects/house-troyan/gallery/01-900.webp',
    '/projects/gravity-house/gallery/01-900.webp',
  ],
}
