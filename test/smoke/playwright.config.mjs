import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', serviceWorkers: 'block', trace: 'retain-on-failure' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, cwd: import.meta.dirname },
  outputDir: '../../test-results',
});
