import { defineConfig } from 'vitest/config'

// Tests run hermetic: a deployment's VITE_* variables (the :10001 container sets
// VITE_NABLA_TILES_URL) would otherwise be baked into import.meta.env and change the defaults
// under test. The game build reads them from its own vite config, not from here.
for (const key of Object.keys(process.env)) if (key.startsWith('VITE_')) delete process.env[key]

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'services/world-cache/**/*.test.ts'],
    environment: 'node',
    // One budget locally and in CI (CI runs this same file through `npm test`). The real Rapier
    // journeys (real-world, ride-smoothing-sim, carrier...) take 2-5 s each on an idle machine
    // and about three times that while every worker is busy, so the old local 5 s budget failed
    // them under load while CI already allowed 30 s.
    testTimeout: 30_000,
    setupFiles: ['test/setup-physics.ts'],
  },
})
