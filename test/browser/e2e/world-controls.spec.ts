import { test, expect } from '@playwright/test'

test('world controls survive play and restart and remain isolated between hosts', async ({
  page,
}) => {
  await page.route('**/world-controls-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body><div><canvas></canvas></div><div><canvas></canvas></div></body>',
    }),
  )
  await page.goto('/world-controls-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const runtimes = [...document.querySelectorAll('canvas')].map(
        (canvas) =>
          new GameRuntime({
            canvas,
            clock: 'manual',
            audio: false,
            sea: false,
            scene: {
              version: 1,
              name: 'World controls',
              geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
              entities: [
                createEntity('spawn', 'spawn', [0, 1, 0]),
                createEntity('floor', 'box', [0, -0.5, 0]),
              ],
            },
          }),
      )
      const [a, b] = runtimes
      try {
        await Promise.all(runtimes.map((runtime) => runtime.setPlayerBody(null)))
        a.setGravityScale(0.75)
        a.setRecoverToRoadEnabled(false)
        a.setWater({ mode: 'manual', level: 3, amplitude: 1 })
        a.setSkyClock({ mode: 'fixed', at: '2026-10-24T10:00:00Z' })
        await a.play()
        const firstGravity = a.game.session.simulation!.gravityScale
        a.setGravityScale(2)
        const liveGravity = a.game.session.simulation!.gravityScale
        a.stop()
        await a.play()
        const restartedGravity = a.game.session.simulation!.gravityScale
        const state = {
          firstGravity,
          liveGravity,
          restartedGravity,
          recover: a.recoverToRoadEnabled,
          sea: a.sea,
          clock: a.skyClock,
          other: {
            gravity: b.gravityScale,
            recover: b.recoverToRoadEnabled,
            water: b.waterSettings ?? null,
            clock: b.skyClock,
          },
        }
        a.dispose()
        b.setGravityScale(1.5)
        return { ...state, survivor: b.gravityScale }
      } finally {
        for (const runtime of runtimes) runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result).toEqual({
    firstGravity: 0.75,
    liveGravity: 2,
    restartedGravity: 2,
    recover: false,
    sea: { level: 3, state: 'Manual' },
    clock: { mode: 'fixed', at: '2026-10-24T10:00:00Z' },
    other: { gravity: 1, recover: true, water: null, clock: { mode: 'live' } },
    survivor: 1.5,
  })
})
