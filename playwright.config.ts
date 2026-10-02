import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end specs run the production build (`vite preview`) in real
 * Chromium. They cover what jsdom can't: CodeMirror and Milkdown actually
 * rendering, the two panes syncing through the shared store, and the
 * document surviving a reload.
 *
 * `PLAYWRIGHT_CHROMIUM_PATH` lets a machine with a preinstalled Chromium
 * (e.g. a cloud dev container) skip `playwright install`.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
