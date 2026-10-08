import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  timeout: 45000, expect: { timeout: 10000 }, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3010', channel: 'chrome', viewport: { width: 1440, height: 1000 }, locale: 'en-GB', timezoneId: 'Asia/Tokyo', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/e2e-server.mjs', url: 'http://127.0.0.1:3010/api/health', reuseExistingServer: false, timeout: 30000 },
});
