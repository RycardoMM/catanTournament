// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,   // tests share Firebase — run sequentially
  retries: 1,
  timeout: 30000,
  reporter: [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:5500',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile',   use: { ...devices['iPhone 13'] } },
  ],

  webServer: {
    command: 'npx serve . -p 5500 -s',
    url: 'http://localhost:5500',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
