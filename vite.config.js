import { resolve } from 'node:path'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import { buildPages } from './scripts/build-pages.mjs'

/* Plain Vite vanilla setup, MULTI-PAGE since the portfolio (2026-09-16):
 *   index.html                       the homepage (main.js)
 *   portfolio/index.html             the portfolio grid       ┐ generated from
 *   portfolio/<id>/index.html        one page per project     │ config, see below
 *   404.html                         the not-found page       ┘ (web root)
 * `public/` is served at the web root, so the committed media lives at
 * /videos/…, /projects/<id>/… etc.
 *
 * The portfolio pages are static HTML written by scripts/build-pages.mjs from
 * src/sections.config.js. This plugin regenerates them (and public/sitemap.xml)
 * before every build and dev start, and again whenever the config or the
 * generator changes while the dev server runs — so they can never go stale and
 * never need committing (portfolio/ is gitignored). */
function portfolioPages() {
  const WATCH = /(sections\.config\.js|build-pages\.mjs|projects\.manifest\.json)$/
  return {
    name: 'semplo-portfolio-pages',
    async config() {
      const { inputs } = await buildPages()
      return {
        build: {
          rollupOptions: {
            input: { main: resolve(__dirname, 'index.html'), ...inputs },
          },
        },
      }
    },
    /* `vite preview` (what the e2e suite runs against) answers an unknown path
     * with an empty 404. Vercel — and the cPanel fallback via ErrorDocument —
     * serve dist/404.html with a 404 status instead, so mirror that here: a
     * GET/HEAD whose path maps to no file in dist/ gets the branded page and
     * the real status. Checked BEFORE sirv (pre-hook), so existing files and
     * directory indexes are untouched. */
    configurePreviewServer(server) {
      const out = resolve(server.config.root, server.config.build.outDir)
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const path = decodeURIComponent(req.url.split('?')[0])
        const file = resolve(out, '.' + path)
        const exists =
          existsSync(file) &&
          (statSync(file).isFile() || existsSync(resolve(file, 'index.html')))
        if (exists || existsSync(file + '.html')) return next()
        const page = resolve(out, '404.html')
        if (!existsSync(page)) return next()
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(req.method === 'HEAD' ? '' : readFileSync(page))
      })
    },
    configureServer(server) {
      server.watcher.on('change', async (file) => {
        if (!WATCH.test(file)) return
        try {
          await buildPages()
          server.ws.send({ type: 'full-reload' })
        } catch (e) {
          server.config.logger.error(`[portfolio-pages] ${e.message}`)
        }
      })
    },
  }
}

const __dirname = resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))

export default defineConfig({
  appType: 'mpa', // real 404s for unknown paths — no SPA fallback to the homepage
  server: { open: true },
  plugins: [portfolioPages()],
})
