# Projects — one folder per property

A **project** is a whole property (an apartment, a house, an office), not a
single room. Each lives in its own folder here:

    assets/projects/<project-id>/
        gallery/     01.jpg 02.jpg …       finished photos, shown in this order
        sketches/    01.jpg 02.jpg …       plans / drawings / visualizations (OPTIONAL)
        panoramas/   living.jpg …          360° equirects, one per ROOM (OPTIONAL)
        source-manifest.json               (optional) where each file came from

`npm run optimize:projects` (part of `npm run assets`, so `npm run dev` and
deploys run it automatically) **walks these folders** — no per-file listing
anywhere — emits web-ready WebP variants into `public/projects/<id>/…` and
writes `src/projects.manifest.json`, which the page reads. It also **fails the
build** if the config references a project or panorama that has no file.

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
         metaBg: 'София · 2026', metaEn: 'Sofia · 2026',
         span: null,                          // 'wide' for a full-width card
         panoramas: [                         // ONLY the rooms that have files,
           { file: 'living',  bg: 'Дневна', en: 'Living room' },   // in display
           { file: 'bedroom', bg: 'Спалня', en: 'Bedroom' },       // order
         ],
         blurbBg: '…', blurbEn: '…',
       }

   Omit `panoramas` if there are none. Sketches need **no config at all** —
   if `sketches/` has files, the Проект/Project tab appears; if not, it
   doesn't.

3. **Run** `npm run optimize:projects` (or just `npm run dev`).

That's it — the gallery card, the overlay photo sequence, the tabs, the 360°
block and its room switcher all follow from the folder + that one entry.

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
