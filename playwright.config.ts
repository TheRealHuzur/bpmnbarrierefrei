import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    // Lokal reicht der installierte Edge, in der CI kommt Chromium von Playwright.
    ...(process.env['CI'] ? {} : { channel: 'msedge' }),
    acceptDownloads: true,
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
