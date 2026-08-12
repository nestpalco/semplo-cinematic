# Project sketches (Проект / Project tab)

Design sketches, drawings, plans and visualizations — the PROCESS work shown
in the **Проект / Project** tab of a project's detail overlay. (The finished
photos live in `assets/projects/`; these are the drawings behind them.)

## How to add sketches to a project

1. **Drop the files here**, named `<projectId>-NN.jpg` (or `.png`/`.webp`):
   the id must match the project's `id` in `src/sections.config.js`
   (`living`, `dining`, `bedroom`, `office`), `NN` keeps them ordered.
   Portrait, landscape and mixed aspect ratios are all fine — drawings are
   shown uncropped.

       living-01.jpg   living-02.jpg   living-03.jpg …

2. **List them in the project's `sketches` array** in
   `src/sections.config.js` (base names, no extension):

       sketches: ['living-01', 'living-02', 'living-03'],

3. Run `npm run optimize:sketches` (or just `npm run dev` — it runs as part
   of `npm run assets`). Web-ready WebP variants land in `public/sketches/`.

A project with no `sketches` entry simply shows no Проект/Project tab —
that is the intended behaviour, not an error.

## Current files

`living-01..03.jpg` are **generated placeholders** (each is labelled
"ПРИМЕРНА СКИЦА · PLACEHOLDER" on its face) so the tab is demonstrable —
replace them with the real drawings, keeping the same names, and re-run the
optimizer. Delete any you don't replace and remove them from the config.
