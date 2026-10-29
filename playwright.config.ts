import { defineConfig, devices } from '@playwright/test';

// Browser tests against the dev server (window.game is exposed there, for the few
// steps that would take minutes by hand, like reaching a crash).
const PORT = 5340;

export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, hasTouch: true } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
