# SEMPLO DESIGN — semplodesign.com

Single-page bilingual (BG/EN) site for the SEMPLO interior studio: signature
hero video, ambient loops, projects gallery with 360° rooms, catalogues,
reviews, and an enquiry form. Vite + GSAP + Three.js, deployed on Netlify.

---

## ⚠️ PRE-DEPLOY CHECKLIST — read before every push

**The deploy build is `vite build` only. Optimized media is COMMITTED and is
NOT regenerated on deploy.** The ffmpeg/sharp passes were eating Netlify's
free build minutes, so they run locally — never in the build hook.

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

The contract check cannot detect a *re-exported* source whose stale outputs
still exist — that case is exactly what step 1 is for.

---

## Commands

| command | what it does |
| --- | --- |
| `npm run dev` | contract check + Vite dev server |
| `npm run build` | contract check + `vite build` (this is all Netlify runs) |
| `npm run assets` | **local only** — ffmpeg + sharp: videos, project images, social card |
| `npm run optimize:videos` / `optimize:projects` / `optimize:social` | the individual optimizers |
| `npm run check:assets` | the config ↔ committed-assets contract check on its own |
| `npm run test:e2e` | `vite build` + Playwright e2e suite |

## Enquiry form → email (no Netlify Forms)

The form POSTs to `netlify/functions/enquiry.mjs`, which checks the honeypot,
verifies the Cloudflare Turnstile token, and **emails the enquiry to the
studio** over the client's own SuperHosting SMTP (Reply-To = the enquirer, so
the studio just hits Reply). Netlify Forms is deliberately not used — its free
tier silently stops storing at 100 submissions/month, which is unacceptable
during ad campaigns. Do not re-add `data-netlify` / `form-name` to the form.

Required environment variables (Netlify → Site configuration → Environment
variables, scope **Functions**) — the function **fails closed** (bilingual
error + mailto fallback in the dialog) if any are missing:

| variable | value |
| --- | --- |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile secret key |
| `SMTP_HOST` | SuperHosting mail server (cPanel → Email → Connect Devices), e.g. `semplodesign.com` or `serverNN.superhosting.bg` |
| `SMTP_PORT` | `465` (default if unset; `587` also works) |
| `SMTP_USER` | full mailbox address, e.g. `enquiry@semplodesign.com` |
| `SMTP_PASS` | that mailbox's password |
| `ENQUIRY_TO` | where enquiries land (optional — defaults to `SMTP_USER`) |

## Asset pipeline (local)

Raw sources live in `assets/` (committed); `npm run assets` writes optimized
output to `public/` (also committed — see the checklist above):

- `assets/videos/` → `public/videos/` + `src/videos.manifest.json` (ffmpeg)
- `assets/projects/<id>/{gallery,sketches,panoramas}/` → `public/projects/`
  + `src/projects.manifest.json` (sharp)
- `public/videos/hero-poster.webp` → `public/social/og-card.jpg` (sharp)

`scripts/check-assets.mjs` (the `prebuild`/`predev` hook) verifies every
config-referenced asset exists in every emitted size and exits 1 otherwise.
