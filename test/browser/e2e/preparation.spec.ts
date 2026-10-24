import { test, expect } from '@playwright/test'

test('real runtime cancels preparation, retries and never reveals after disposal', async ({
  page,
}) => {
  await page.route('**/preparation-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body><div><canvas></canvas></div></body>' }),
  )
  await page.goto('/preparation-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const canvas = document.querySelector('canvas')!
      const runtime = new GameRuntime({
        canvas,
        clock: 'manual',
        audio: false,
        sea: false,
        scene: {
          version: 1,
          name: 'Preparation cancellation',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [
            createEntity('spawn', 'spawn', [0, 1, 0]),
            createEntity('floor', 'box', [0, -0.5, 0]),
          ],
        },
      })
      await runtime.setPlayerBody(null)
      const results: string[] = []
      const gates: (() => void)[] = []
      try {
        for (const dispose of [false, true]) {
          delete canvas.dataset.reveal
          runtime.holdPreparation(new Promise<void>((resolve) => gates.push(resolve)))
          const playing = runtime.play().then(
            () => 'resolved',
            (error: Error) => error.name,
          )
          const deadline = performance.now() + 10000
          while (canvas.dataset.reveal !== 'preparing') {
            if (performance.now() > deadline) throw new Error('Preparation did not start')
            await new Promise((resolve) => setTimeout(resolve, 10))
          }
          if (dispose) runtime.dispose()
          else runtime.stop()
          results.push(await playing)
        }
        for (const release of gates) release()
        await new Promise((resolve) => setTimeout(resolve, 50))
        return { results, revealed: canvas.dataset.reveal === 'play' }
      } finally {
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.results).toEqual(['AbortError', 'AbortError'])
  expect(result.revealed).toBe(false)
})
