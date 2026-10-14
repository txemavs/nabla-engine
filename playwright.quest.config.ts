import { defineConfig } from '@playwright/test'

/** Exercise the shipped demo; run build:game before this focused browser check. */
export default defineConfig({
  testDir: './test/quest',
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5195',
    viewport: { width: 1440, height: 960 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --config vite.game.config.ts --host 127.0.0.1 --port 5195 --strictPort',
    url: 'http://127.0.0.1:5195/xr.html',
    reuseExistingServer: !process.env.CI,
  },
})
