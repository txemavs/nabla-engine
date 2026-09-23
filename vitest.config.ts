import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { include: ['src/**/*.test.ts', 'playground/studio/**/*.test.ts'], environment: 'node' },
})
