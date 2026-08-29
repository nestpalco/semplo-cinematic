# SEMPLO DESIGN — semplodesign.com

Single-page bilingual (BG/EN) site for the SEMPLO interior studio: signature
hero video, ambient loops, projects gallery with 360° rooms, catalogues,
reviews, and an enquiry form. Vite + GSAP + Three.js, deployed to **Vercel**
as a static build plus one serverless function (`api/enquiry.js`). A tested
SuperHosting/cPanel fallback (static upload + PHP endpoint) stays in the repo
— see the fallback section at the end.

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
  + `src/projects.manifest.json` (sharp)
- `public/videos/hero-poster.webp` → `public/social/og-card.jpg` (sharp)

`scripts/check-assets.mjs` (the `prebuild`/`predev` hook) verifies every
config-referenced asset exists in every emitted size and exits 1 otherwise.
