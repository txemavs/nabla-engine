import { expect, test } from '@playwright/test'

test('desktop frames preserve physics-to-render order and suppress late rendering after pause', async ({
  page,
}) => {
  await page.route('**/frame-order-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body><div><canvas></canvas></div></body>' }),
  )
  await page.goto('/frame-order-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const events: string[] = []
      const runtime = new GameRuntime({
        canvas: document.querySelector('canvas')!,
        clock: 'manual',
        audio: false,
        sea: false,
        onFrame: () => events.push('host'),
        scene: {
          version: 1,
          name: 'Frame order',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [
            createEntity('spawn', 'spawn', [0, 1, 0]),
            createEntity('floor', 'box', [0, -0.5, 0]),
          ],
        },
      })
      try {
        await runtime.setPlayerBody(null)
        await runtime.play({ physicsWorker: false })
        const wrap = (owner: any, key: string, label: string) => {
          const original = owner[key].bind(owner)
          owner[key] = (...args: unknown[]) => {
            events.push(label)
            return original(...args)
          }
        }
        wrap(runtime.view, 'sync', 'presentation')
        wrap(runtime.game, 'updateCamera', 'camera')
        wrap(runtime.environment, 'updateSky', 'environment')
        wrap(runtime.pipeline, 'render', 'render')
        const originalStep = runtime.game.step.bind(runtime.game)
        let release!: () => void
        runtime.game.step = (...args: unknown[]) => {
          events.push('physics')
          const value = originalStep(...args)
          return new Promise((resolve) => {
            release = () => resolve(value)
          })
        }
        runtime.tick(1000)
        runtime.tick(1016)
        const pending = [...events]
        release()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const completed = [...events]
        events.length = 0
        runtime.tick(1032)
        runtime.pause()
        release()
        await new Promise((resolve) => setTimeout(resolve, 0))
        return { pending, completed, paused: [...events], busy: runtime.frames.frameBusy }
      } finally {
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.pending).toEqual(['physics'])
  expect(result.completed).toEqual([
    'physics',
    'presentation',
    'camera',
    'environment',
    'render',
    'host',
  ])
  expect(result.paused).toEqual(['physics'])
  expect(result.busy).toBe(false)
})
