import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    // Use the same full Chromium headless renderer locally and on GitHub runners.
    channel: 'chromium',
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
  },
})
