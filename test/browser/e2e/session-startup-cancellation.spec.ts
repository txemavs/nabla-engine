import { expect, test } from '@playwright/test'

test('real worker startup cannot publish after cancellation during initial snapshot synchronization', async ({
  page,
}) => {
  await page.route('**/session-startup-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/session-startup-check')
  const results = await page.evaluate(
    async (root) => {
      const { PlaySession } = await import(`/@fs${root}/src/runtime/session.ts`)
      const { ThreadedSimulation } = await import(
        `/@fs${root}/src/simulation/threaded-simulation.ts`
      )
      const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
      const originalRefresh = ThreadedSimulation.prototype.refresh
      const results = []
      for (const action of ['stop', 'dispose', 'replace']) {
        const session = new PlaySession()
        let release!: () => void,
          entered!: () => void,
          first = true,
          disposals = 0
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        const ready = new Promise<void>((resolve) => {
          entered = resolve
        })
        ThreadedSimulation.prototype.refresh = async function (this: any) {
          const hold = first
          first = false
          const result = await originalRefresh.call(this)
          if (hold) {
            const dispose = this.dispose.bind(this)
            this.dispose = () => {
              disposals++
              dispose()
            }
            entered()
            await gate
          }
          return result
        }
        const scene = {
          version: 1,
          name: 'Worker cancellation',
          entities: [createEntity('spawn', 'spawn', [0, 2, 0])],
        }
        const starting = session.play(scene, { physicsWorker: true }).then(
          () => 'published',
          (e: Error) => e.message,
        )
        try {
          await ready
          let current = null
          if (action === 'stop') session.stop()
          else if (action === 'dispose') session.dispose()
          else current = await session.play(scene, { physicsWorker: true })
          release()
          const outcome = await starting
          results.push({
            action,
            outcome,
            state: session.state,
            disposals,
            currentPreserved: current
              ? session.simulation === current
              : session.simulation === null,
          })
        } finally {
          release()
          await starting
          session.dispose()
          ThreadedSimulation.prototype.refresh = originalRefresh
        }
      }
      return results
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(results).toEqual([
    {
      action: 'stop',
      outcome: 'Play session cancelled',
      state: 'stopped',
      disposals: 1,
      currentPreserved: true,
    },
    {
      action: 'dispose',
      outcome: 'Play session cancelled',
      state: 'disposed',
      disposals: 1,
      currentPreserved: true,
    },
    {
      action: 'replace',
      outcome: 'Play session cancelled',
      state: 'playing',
      disposals: 1,
      currentPreserved: true,
    },
  ])
})
