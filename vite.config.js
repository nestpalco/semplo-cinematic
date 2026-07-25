import { defineConfig } from 'vite'

// Plain Vite vanilla setup. `public/` is served at the web root, so the
// optimized hero photos live at /scenes/<id>-<width>.webp (see scripts/optimize-scenes.mjs).
export default defineConfig({
  server: { open: true },
})
