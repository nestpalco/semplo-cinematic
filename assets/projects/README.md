# Projects — one folder per property

A **project** is a whole property (an apartment, a house, an office), not a
single room. Each lives in its own folder here:

    assets/projects/<project-id>/
        gallery/     01.jpg 02.jpg …       finished photos, shown in this order
        sketches/    01.jpg 02.jpg …       plans / drawings / visualizations (OPTIONAL)
        panoramas/   living.jpg …          360° equirects, one per ROOM (OPTIONAL)
        source-manifest.json               (optional) where each file came from

`npm run optimize:projects` (part of `npm run assets` — run it LOCALLY and
commit the output; deploys only run the contract check) **walks these
folders** — no per-file listing anywhere — emits web-ready WebP variants into
`public/projects/<id>/…` and writes `src/projects.manifest.json`, which the
pages read: the file lists per type, plus `dims` (`"gallery/01": [w, h]`, the
largest variant's pixels) that the page generator writes as `width`/`height`
on every `<img>` so the browser reserves each frame's box before the file
arrives (no layout shift as lazy gallery photos load). It also **fails the
build** if the config references a project or panorama that has no file.
Folders starting with `_` (e.g. `_shared/`) are not projects.

## Adding a new project (e.g. "Апартамент Лозенец")

1. **Create the folder and drop the files:**

       assets/projects/lozenets-apartment/
           gallery/    01.jpg 02.jpg 03.jpg …     (required — numbered, in order)
           sketches/   01.jpg 02.jpg …            (only if you have drawings)
           panoramas/  living.jpg bedroom.jpg …   (only if you have 360° shots,
                                                   named after the ROOM, ASCII)

2. **Add ONE entry** to `projects` in `src/sections.config.js`:

       {
         id: 'lozenets-apartment',            // must equal the folder name
         titleBg: 'Апартамент Лозенец', titleEn: 'Lozenets Apartment',
         metaBg: 'София · 2026', metaEn: 'Sofia · 2026',   // homepage card only
         span: null,                          // 'wide' for a full-width card
         panoramas: [                         // ONLY the rooms that have files,
           { file: 'living',  bg: 'Дневна', en: 'Living room' },   // in display
           { file: 'bedroom', bg: 'Спалня', en: 'Bedroom' },       // order
         ],
         blurbBg: '…', blurbEn: '…',          // homepage overlay blurb

         // ── /portfolio/ card + /portfolio/<id>/ page ──
         category: 'apartment',               // apartment | house | commercial
         locationBg: 'София', locationEn: 'Sofia',
         area: 95,                            // m², OPTIONAL — omit if unknown
         // typeBg/typeEn: optional override of the category label
         // cover: '03',                      // gallery photo for card + og.jpg
         cardBg: '…', cardEn: '…',            // one line on the portfolio card
         conceptTitleBg: '…', conceptTitleEn: '…',
         conceptBg: '…', conceptEn: '…',      // left column
         realizationBg: '…', realizationEn: '…', // right column ("От концепцията…")
         todo: ['concept'],                   // groups still holding placeholder
                                              // copy (badged on the page) — delete
                                              // the key when the real text lands
         updated: '2026-09-16',               // sitemap <lastmod>, optional
       }

   Omit `panoramas` if there are none — the 360° block then simply does not
   appear on the project page. Sketches currently show nowhere on the
   portfolio pages (the client dropped the Планове/Материали/Детайли tabs);
   the folder is still harvested by the optimizer for later.

3. **Run** `npm run optimize:projects` (or just `npm run dev`).

That's it — the homepage card, the portfolio card, the project page (hero
slider, meta row, text columns, gallery, 360° block, prev/next, its own
`<title>`/OG tags and social card), and the sitemap entry all follow from
the folder + that one entry. `npm run check:assets` fails the build if a
portfolio field is missing.

## Notes

- **Gallery order** is filename order — number them `01.jpg, 02.jpg, …`.
- **Sketches that arrive as PDFs** must be rendered to images (the pipeline
  publishes images only). Render each page at high resolution (≈3000px wide
  for an A2 sheet keeps dimension text readable in the click-to-zoom view),
  and crop the title block if it carries client-identifying details before
  the image lands in `sketches/`. The source PDFs themselves are NOT kept in
  the repo — they live in the studio's Google Drive; restore from there if a
  sheet ever needs re-rendering. (Should you need a temporary holding spot,
  the optimizer only reads images directly in `sketches/`, so a subfolder
  there is never published.)
- **Panorama files** must be ~2:1 equirectangular, ideally 4096px wide or
  more (e.g. 8000×4000 — the pipeline never upscales, so a small source like
  1600×800 will render soft in the viewer); name them after the room in
  ASCII (`living.jpg`, not `дневна.jpg`) — the visible bilingual label comes
  from the config entry.
- **Sketches** may be any aspect ratio (portrait plans are fine); they are
  shown uncropped with click-to-zoom.
- **Deleting**: remove the files AND (for panoramas) the config label, or the
  build will fail on the missing file — that guardrail is deliberate.
- `sofia-apartment/source-manifest.json` maps every migrated photo to its
  original URL on the old semplodesign.com WordPress site (the `was` field is
  the pre-2026-08 flat filename). New projects don't need a source manifest.
- `sofia-apartment/sketches/` currently holds generated PLACEHOLDERS
  (labelled as such on their face) — replace with the real drawings, keeping
  the numbered names.
- `villa-grivitsa/` is ONE project for the VIP HALL **and** the WINE BAR (same
  building — client decision 2026-09-16). Its gallery (14) was curated from
  the merged deck in `_source/presentation.pdf`, ordered hall → bar; the
  former `winebar-grivitsa/` folder was folded into it (`_source/*-wine-bar.*`,
  `materials/02.jpg`). `source-manifest.json` maps each photo to a deck page.
- `villa-grivitsa/panoramas/` (2026-09-22): `vip-hall.jpg` + `wine-bar.jpg`,
  8000×4000 `spherical.jpg` files taken from the client's Homestyler ZIP
  exports (email "Вила Гривица", 2026-09-21). Each ZIP also carries six
  2000×2000 cube faces (`…#front.jpg` … `#bottom.jpg`) — those are the
  auto-generated "detail renders" the client said to ignore; only the
  `spherical.jpg` is the equirect. One viewpoint was kept per space (the
  rejects and why are in `source-manifest.json`). The other 2026-09 client
  projects still have no `panoramas/`; `materials/` (mood boards) and
  `_source/` (the raw decks, gitignored) are not published.
