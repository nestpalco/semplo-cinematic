import { defineConfig, devices } from '@playwright/test'

/* Semplo end-to-end checklist. Runs the SAME suite across three profiles:
 *   desktop         — 1440×900, motion on (pins + scrub)
 *   mobile          — 390×844, touch, motion-ok but NO pins (native scroll)
 *   reduced-motion  — 1440×900 with prefers-reduced-motion: reduce
 *                     (motion.js never loads → posters, no pins, content visible)
 * The preview server serves the latest `dist/` (test:e2e builds first). */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4318',
    screenshot: 'off',
    trace: 'off',
  },
  webServer: {
    command: 'npm run preview -- --port 4318 --strictPort',
    url: 'http://localhost:4318',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'reduced-motion',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
    },
  ],
})
