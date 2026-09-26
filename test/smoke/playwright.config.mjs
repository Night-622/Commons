import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,   // one retry on GitHub, where a slow machine can trip a timing; it's still reported as flaky
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, cwd: import.meta.dirname },
  outputDir: '../../test-results',
});
