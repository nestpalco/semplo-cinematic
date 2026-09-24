# SEMPLO DESIGN — semplodesign.com

Bilingual (BG/EN) site for the SEMPLO interior studio: a single-page HOMEPAGE
(signature hero video, ambient loops, selected projects with 360° rooms,
catalogues, reviews, enquiry form) plus a PORTFOLIO section — `/portfolio/`
(the full, filterable project grid) and `/portfolio/<id>/` (one page per
project). Vite + GSAP + Three.js, deployed to **Vercel** as a static build
plus one serverless function (`api/enquiry.js`). A tested SuperHosting/cPanel
fallback (static upload + PHP endpoint) stays in the repo — see the fallback
section at the end.

## Pages

| URL | source | runtime |
| --- | --- | --- |
| `/` | `index.html` (hand-written) | `src/main.js` |
| `/portfolio/` | **generated** from config → `portfolio/index.html` | `src/page.js` |
| `/portfolio/<id>/` | **generated** from config → `portfolio/<id>/index.html` | `src/page.js` |

The portfolio pages are static HTML written by `scripts/build-pages.mjs` from
`src/sections.config.js` (`projects`, `portfolio`, `ui`, `business`) and
`src/projects.manifest.json`. The Vite plugin in `vite.config.js` regenerates
them — and `public/sitemap.xml` — before every build and dev start, and again
whenever the config changes while the dev server runs. `portfolio/` is
gitignored (generated output); `public/sitemap.xml` is committed like the rest
of `public/` but never edited by hand. Shared chrome (BG/EN, light/dark,
burger, tel/mailto links) lives in `src/chrome.js`, imported by both runtimes.

**Removed project (2026-09-22, client request):** "Апартамент София"
(`sofia-apartment`) is no longer in the config, the grid, the sitemap or the
prev/next ring. Its assets were not deleted — they sit in
`archived/projects/sofia-apartment/` (see `assets/projects/README.md` for how
to restore them). The homepage's no-JS gallery, the decorative photo strip
and the "material" background texture now use frames from the remaining
projects.

Why `/portfolio/` and not `/projects/`: `/projects/<id>/…` already serves the
committed media, the Vercel cache rule gives that prefix a 30-day max-age
(wrong for HTML), and the retired WordPress site used `/projects/` (the e2e
suite treats links to it as legacy 404s).

---

## ⚠️ PRE-DEPLOY CHECKLIST — read before every push

**The deploy build is `vite build` only. Optimized media is COMMITTED and is
NOT regenerated on deploy.** The ffmpeg/sharp passes are far too heavy to run
per-deploy, so they run locally — never in the build hook. `vercel.json` pins
`buildCommand` to `npm run build`; the e2e suite fails if an optimizer pass
ever sneaks into it.

Before every push/deploy:

1. **Did anything under `assets/` change** (new/edited video, project photo,
   sketch, panorama, or a new project/room in `src/sections.config.js`)?
   → Run **`npm run assets`** locally, then **commit everything it changed**:
   `public/videos/`, `public/projects/`, `public/social/og-card.jpg`,
   `src/videos.manifest.json`, `src/projects.manifest.json`.
2. **Never re-enable the optimizers in the build hook.** `prebuild` must stay
   `node scripts/check-assets.mjs` (a millisecond existence/contract check that
   fails the build loudly if committed media is missing or out of step with the
   config). If you are tempted to put `npm run assets` back into `prebuild`,
   you are about to spend ~7 minutes of ffmpeg on every deploy — don't.
3. **Never re-add `public/videos/` or `public/projects/` to `.gitignore`.**
4. Run `npm run test:e2e` (builds, then runs the Playwright suite across
   desktop / mobile / reduced-motion).
5. **🚫 NO PLACEHOLDER BADGES IN PRODUCTION.** The dashed "ПРИМЕРЕН ТЕКСТ /
   PLACEHOLDER TEXT" badges (`todo: [...]` on project entries, `todo: true` on
   reviews in `src/sections.config.js`) are deliberately KEPT on the
   `portfolio-preview` branch — the client uses them to see what copy is
   still missing. They must be gone before anything merges to `main` or
   deploys to production: replace the placeholder copy and delete every
   `todo` key. `grep -n "todo:" src/sections.config.js` must come back empty.

The contract check cannot detect a *re-exported* source whose stale outputs
still exist — that case is exactly what step 1 is for.

---

## Commands

| command | what it does |
| --- | --- |
| `npm run dev` | contract check + Vite dev server |
| `npm run build` | contract check + `vite build` (all a deploy ever runs) |
| `npm run assets` | **local only** — ffmpeg + sharp: videos, project images, social card |
| `npm run optimize:videos` / `optimize:projects` / `optimize:social` | the individual optimizers |
| `npm run check:assets` | the config ↔ committed-assets contract check on its own (incl. the portfolio fields) |
| `node scripts/build-pages.mjs` | regenerate the portfolio pages + sitemap by hand (the Vite plugin does this automatically) |
| `npm run test:e2e` | `vite build` + Playwright e2e suite (`e2e/site.spec.js` homepage, `e2e/portfolio.spec.js` portfolio pages) |

## Homepage "Избрани проекти" — the three featured clips

The homepage shows THREE featured projects as full-bleed scroll-scrubbed
video sections (`featured` in `src/sections.config.js`), each linking to its
`/portfolio/<id>/` page, followed by a "Разгледайте всички проекти →" link.
The client is delivering the animated clips; until each lands the optimizer
encodes a placeholder and marks the manifest entry `placeholder`. To swap in
a real clip, drop it at the exact name below and run `npm run optimize:videos`
(then commit `public/videos/` + `src/videos.manifest.json`) — no config edit:

| featured slot | drop the client's file at |
| --- | --- |
| HILL SIDE | `assets/videos/featured-hillside.mp4` |
| Вила Гривица | `assets/videos/featured-villa-grivitsa.mp4` |
| Къща Троян | `assets/videos/featured-house-troyan.mp4` |

If a delivered clip carries a corner watermark, set that slot's
`cropWatermark` (0.08 trims the Kling mark; 0 for a clean file). If its first
frames are unusable (the HILL SIDE clip slides in from off-frame black), set
`trimStart` (seconds) to drop that head — frame 0 is the poster and the frame
a scrubbed section rests on. The manifest records both (`placeholder`,
`trimStart`) so you can see at a glance what was encoded.

Delivered so far: **HILL SIDE** (2026-09-16), **Villa Grivitsa** and
**Troyan House** (both 2026-09-23) — no placeholders remain.

### Video tiers (desktop and mobile)

The hero and the three featured clips are full-bleed, so they are encoded in
TWO desktop tiers (`SCRUB` in `scripts/optimize-videos.mjs`, keyframe every 6
frames — `SCRUB_GOP`); every slot also gets a MOBILE family (`MOBILE`,
`PORTRAIT` in the same script — forward autoplay, long GOP):

| tier | file | who gets it |
| --- | --- | --- |
| hd | `<id>-1920.mp4` + `<id>-poster-1920.webp` (crf 25) | viewports wider than 1440 CSS px, or DPR ≥ 1.5 at ≥ 1024 px |
| sd | `<id>-1280.mp4` + `<id>-poster.webp` (crf 23) | other desktops |
| portrait-hd | `<id>-portrait-hd.mp4` (≤ 1080×1920) + `<id>-poster-portrait-hd.webp` | phones (≤ 820 px or coarse pointer, viewport taller than 8:5) at DPR ≥ 2 — only slots with a 4K source have it, the rest fall through to `portrait` |
| portrait | `<id>-portrait.mp4` (≤ 720×1280, crf 25; the ambient loops set `portraitCrf: 27`) + `<id>-poster-portrait.webp` | phones at DPR 1, and DPR ≥ 2 phones for 1080p sources |
| mobile-hd | `<id>-1080.mp4` + `<id>-poster-1080.webp` | mobile in landscape / tablets, DPR ≥ 2 |
| mobile | `<id>-720.mp4` + `<id>-poster-720.webp` | mobile in landscape / tablets, DPR 1 |

The portrait files are the 9:16 CENTRE crop of the frame — the strip
`object-fit: cover` already showed on a phone (every full-bleed section there is
narrower than 9:16), so the framing is unchanged and the file spends its pixels
on what is visible instead of the 70 % that was cropped away. They are never
upscaled: a 1080p delivery yields one ~608×1080 portrait file (560×994 after a
watermark crop) and no `-hd` variant.

`src/video-tier.js` decides ONCE at boot (`matchMedia`, no re-fetch on resize
or rotation) and both `main.js` and `motion.js` read it, so a slot never mixes
tiers. The ambient loops stay single-tier on desktop (1280). The manifest
carries every variant and its `bytes` (plus `portraitSize` / `portraitHdSize`);
`check-assets` requires the files and insists each slot has the mobile family.
Measurements: `reports/2026-09-23-video-quality-tiers.md` (desktop),
`reports/2026-09-24-mobile-video-portrait-tiers.md` (mobile).

## Enquiry form → email (Vercel serverless function)

The form POSTs to `/api/enquiry` (`api/enquiry.js`, deployed by Vercel
alongside the static build), which checks the honeypot, verifies the
Cloudflare Turnstile token, and **emails the enquiry to the studio** over
SuperHosting's SMTP via nodemailer (Reply-To = the enquirer, so the studio
just hits Reply). No hosted form service is used (the one we once relied on
silently dropped submissions past its 100/month free cap) — do not re-add
hosted-form registration attributes / `form-name` to the form.

Secrets live in **Vercel environment variables**, never in this repo — the
endpoint **fails closed** (bilingual error + mailto fallback in the dialog)
if any are missing:

| variable | value |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `SMTP_HOST` | the SuperHosting mail server, e.g. `serverNN.superhosting.bg` (cPanel → Email → Connect Devices). **Not** `semplodesign.com` — that name now resolves to Vercel. |
| `SMTP_PORT` | `465` (default if unset; `587` also works) |
| `SMTP_USER` | full mailbox address, e.g. `enquiry@semplodesign.com` |
| `SMTP_PASS` | that mailbox's password |
| `ENQUIRY_TO` | where enquiries land (defaults to `SMTP_USER`) |

## Deploying to Vercel

`vercel.json` carries the whole deploy contract: `buildCommand: npm run build`
(contract check + `vite build` — **never** the media optimizers, see the
checklist above), `outputDirectory: dist`, the www→apex 308 redirect (Vercel
upgrades http→https itself), the security headers (HSTS, nosniff,
X-Frame-Options, Referrer-Policy, Permissions-Policy), and the cache policy
for the committed media / hashed bundles / HTML.

1. `npm run test:e2e` (builds `dist/` and runs the full suite).
2. Push to `main` — Vercel builds and deploys automatically.
3. One-time: set the environment variables above, add the
   `semplodesign.com` + `www.semplodesign.com` domains, and point DNS at
   Vercel (keep the MX/SPF records at SuperHosting — the mailbox stays there).
4. Smoke-test: `https://semplodesign.com/` loads over HTTPS; `http://` and
   `www.` both redirect to it; submit a real enquiry through the form and
   check the studio mailbox (and that Reply goes to the enquirer).

## Fallback: SuperHosting (cPanel)

The previous deploy target, kept tested and upload-ready. `dist/` still
carries `.htaccess` (redirects, headers, caching) and `api/enquiry.php` (the
PHP `mail()` twin of the serverless function — same gates, same JSON
contract; the e2e suite pins both). To fall back:

1. Switch `captcha.endpoint` in `src/sections.config.js` to
   `'/api/enquiry.php'` and rebuild.
2. Upload the **contents of `dist/`** to `/home/semplode/public_html/` —
   mirroring, not merging.
3. One-time: create `/home/semplode/semplo-private/enquiry.config.php`
   (chmod 600) from `server/enquiry.config.example.php` — keys:
   `turnstile_secret`, `to`, `from` (an address on a domain of the cPanel
   account).
4. Point the DNS A records back at SuperHosting.

## Asset pipeline (local)

Raw sources live in `assets/` (committed); `npm run assets` writes optimized
output to `public/` (also committed — see the checklist above):

- `assets/videos/` → `public/videos/` + `src/videos.manifest.json` (ffmpeg)
- `assets/projects/<id>/{gallery,sketches,panoramas}/` → `public/projects/`
  + `src/projects.manifest.json` (sharp); also `public/projects/<id>/og.jpg`,
  the 1200×630 JPEG social card for `/portfolio/<id>/` (cut from the
  project's `cover`, or its first gallery photo)
- `public/videos/hero-poster.webp` → `public/social/og-card.jpg` (sharp)

`scripts/check-assets.mjs` (the `prebuild`/`predev` hook) verifies every
config-referenced asset exists in every emitted size and exits 1 otherwise.
