import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { buildPages } from './scripts/build-pages.mjs'

/* Plain Vite vanilla setup, MULTI-PAGE since the portfolio (2026-09-16):
 *   index.html                       the homepage (main.js)
 *   portfolio/index.html             the portfolio grid       ┐ generated from
 *   portfolio/<id>/index.html        one page per project     ┘ config, see below
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
