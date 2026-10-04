import { defineConfig, devices } from '@playwright/test';

/**
 * The application end to end: the built client served by the built server,
 * with a fresh data directory, in Chromium and WebKit, on a desktop and on a
 * phone with touch. Run `npm run build` first; CI does.
 *
 * Rate limits are multiplied away: the suite makes hundreds of requests from
 * one address, which is exactly what they exist to stop.
 */
const PORT = 4320;
const DATA_DIR = 'e2e/.tmp/data';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // The data directory is emptied here, not in a globalSetup: Playwright
    // starts the web server first, so the server would open the old database.
    command: `node -e "require('node:fs').rmSync('${DATA_DIR}', { recursive: true, force: true })" && node packages/server/dist/index.js`,
    cwd: '..',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      // Not the address the tests open: links to share must carry PUBLIC_URL,
      // not whatever origin served the page.
      PUBLIC_URL: `http://localhost:${PORT}`,
      CLIENT_DIR: 'packages/client/dist',
      DATA_DIR,
      RATE_LIMIT_MULTIPLIER: '1000',
      LOG_LEVEL: 'warn',
      OPERATOR_NAME: 'Example Organisation',
      LOG_RETENTION_DAYS: '7',
    },
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
  ],
});
