import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'services/world-cache/**/*.test.ts'],
    environment: 'node',
    // Physics integration journeys must tolerate shared runner CPU contention.
    testTimeout: process.env.CI ? 30000 : 5000,
    setupFiles: ['test/setup-physics.ts'],
  },
})
