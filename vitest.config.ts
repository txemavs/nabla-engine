import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'studio/test/**/*.test.ts', 'services/world-cache/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['test/setup-physics.ts'],
  },
})
