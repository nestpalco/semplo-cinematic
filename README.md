# SEMPLO DESIGN — semplodesign.com

Single-page bilingual (BG/EN) site for the SEMPLO interior studio: signature
hero video, ambient loops, projects gallery with 360° rooms, catalogues,
reviews, and an enquiry form. Vite + GSAP + Three.js, deployed as a static
build (plus one PHP endpoint) to the client's SuperHosting cPanel account.

---

## ⚠️ PRE-DEPLOY CHECKLIST — read before every push

**The deploy build is `vite build` only. Optimized media is COMMITTED and is
NOT regenerated on deploy.** The ffmpeg/sharp passes are far too heavy to run
per-deploy, so they run locally — never in the build hook.

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
| `npm run build` | contract check + `vite build` (all a deploy ever runs) |
| `npm run assets` | **local only** — ffmpeg + sharp: videos, project images, social card |
| `npm run optimize:videos` / `optimize:projects` / `optimize:social` | the individual optimizers |
| `npm run check:assets` | the config ↔ committed-assets contract check on its own |
| `npm run test:e2e` | `vite build` + Playwright e2e suite |

## Enquiry form → email (self-hosted PHP endpoint)

The form POSTs to `/api/enquiry.php` (`public/api/enquiry.php` — shipped
inside the static build), which checks the honeypot, verifies the Cloudflare
Turnstile token, and **emails the enquiry to the studio** via PHP `mail()`
(Reply-To = the enquirer, so the studio just hits Reply). `mail()` rather than
SMTP because the script runs on the same SuperHosting server as the mailbox:
local Exim delivery, no credentials on disk. No hosted form service is used
(Netlify Forms once silently dropped submissions past its 100/month free cap)
— do not re-add `data-netlify` / `form-name` to the form.

Secrets live in a config file **outside `public_html`**, never in this repo —
the endpoint **fails closed** (bilingual error + mailto fallback in the
dialog) if it is missing:

```
/home/semplode/semplo-private/enquiry.config.php   (chmod 600)
```

Template: `server/enquiry.config.example.php`. Keys: `turnstile_secret`
(Cloudflare Turnstile secret), `to` (the studio's mailbox), `from` (an address
on a domain of this cPanel account, e.g. `enquiry@semplodesign.com`).

## Deploying to SuperHosting (cPanel)

1. `npm run test:e2e` (builds `dist/` and runs the full suite).
2. Upload the **contents of `dist/`** (including `.htaccess` and
   `api/enquiry.php`) to `/home/semplode/public_html/`. Delete stale files on
   the server that are no longer in `dist/` — mirroring, not merging.
3. One-time: create `/home/semplode/semplo-private/enquiry.config.php` from
   the template above.
4. Smoke-test: `https://semplodesign.com/` loads over HTTPS; `http://` and
   `www.` both 301 to it; submit a real enquiry through the form and check the
   studio mailbox (and that Reply goes to the enquirer).

`public/.htaccess` carries the canonical www→apex + HTTPS redirects, the
security headers, and the cache policy for the committed media.

## Asset pipeline (local)

Raw sources live in `assets/` (committed); `npm run assets` writes optimized
output to `public/` (also committed — see the checklist above):

- `assets/videos/` → `public/videos/` + `src/videos.manifest.json` (ffmpeg)
- `assets/projects/<id>/{gallery,sketches,panoramas}/` → `public/projects/`
  + `src/projects.manifest.json` (sharp)
- `public/videos/hero-poster.webp` → `public/social/og-card.jpg` (sharp)

`scripts/check-assets.mjs` (the `prebuild`/`predev` hook) verifies every
config-referenced asset exists in every emitted size and exits 1 otherwise.
