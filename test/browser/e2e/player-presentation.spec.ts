import { test, expect } from '@playwright/test'

test('public player presentation APIs load actors, preserve head-only mode and reject late installation', async ({
  page,
}) => {
  test.setTimeout(120000)
  await page.route('**/player-presentation-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body><div><canvas></canvas></div></body>' }),
  )
  await page.goto('/player-presentation-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime, PlayerBodyRig, actorBodyAssets } = await import(
        `/@fs/${root}/src/runtime/browser.ts`
      )
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const runtime = new GameRuntime({
        canvas: document.querySelector('canvas')!,
        clock: 'manual',
        audio: false,
        sea: false,
        settings: { namespace: 'player-presentation-test' },
        scene: {
          version: 1,
          name: 'Player presentation',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
        },
      })
      const originalLoad = PlayerBodyRig.load
      try {
        const choice = { kind: 'default', color: 'red' } as const
        const rig = await runtime.setActor(choice)
        const loaded =
          !!rig && runtime.playerBodyRig === rig && runtime.actorProfile === 'default:red'
        await runtime.setPlayerBody(null)
        const headOnly = !runtime.actorSelectable && runtime.playerBodyRig === null
        await runtime.setActor({ kind: 'default', color: 'blue' })
        const savedWhileHeadOnly =
          runtime.actorProfile === 'default:blue' && runtime.playerBodyRig === null
        let finish!: (value: typeof rig) => void
        PlayerBodyRig.load = () =>
          new Promise((resolve) => {
            finish = resolve
          })
        const pending = runtime.setPlayerBody(actorBodyAssets(choice))
        runtime.dispose()
        finish(rig)
        const late = await pending
        return {
          loaded,
          headOnly,
          savedWhileHeadOnly,
          discarded: late === null,
          bodyAbsent: runtime.playerBodyRig === null,
        }
      } finally {
        PlayerBodyRig.load = originalLoad
        runtime.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result).toEqual({
    loaded: true,
    headOnly: true,
    savedWhileHeadOnly: true,
    discarded: true,
    bodyAbsent: true,
  })
})
