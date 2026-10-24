import { expect, test } from '@playwright/test'

test('repeated runtime lifetimes cancel work, release listeners and preserve the surviving host', async ({
  page,
}) => {
  await page.route('**/teardown-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/teardown-check')
  const result = await page.evaluate(
    async (root) => {
      const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
      const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
      const navigation = await import(`/@fs/${root}/src/render/entity/navigation-places.ts`)
      const make = (tabIndex: string | null) => {
        const parent = document.createElement('div'),
          canvas = document.createElement('canvas')
        if (tabIndex !== null) canvas.setAttribute('tabindex', tabIndex)
        parent.append(canvas)
        document.body.append(parent)
        let frames = 0
        const runtime = new GameRuntime({
          canvas,
          clock: 'manual',
          sea: false,
          audio: false,
          onFrame: () => {
            frames++
          },
          scene: {
            version: 1,
            name: 'Teardown',
            geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
            entities: [
              createEntity('spawn', 'spawn', [0, 1, 0]),
              createEntity('floor', 'box', [0, -0.5, 0]),
            ],
          },
        })
        return { runtime, canvas, parent, frames: () => frames }
      }
      const survivor = make('4'),
        outcomes: unknown[] = []
      const releasePlaces = navigation.registerNavigationPlaces(() => [
        { id: 'survivor', text: 'Survivor', position: { x: 0, z: 0 } },
      ])
      try {
        await survivor.runtime.setPlayerBody(null)
        await survivor.runtime.play({ physicsWorker: false })
        let survivorActivity = 0
        survivor.runtime.cameraActivity = () => survivorActivity++
        for (const mode of ['preparation', 'reveal', 'playing']) {
          const f = make(mode === 'reveal' ? '7' : null)
          await f.runtime.setPlayerBody(null)
          let activity = 0,
            rendererDisposals = 0,
            contexts = 0,
            observerDisconnects = 0
          f.runtime.cameraActivity = () => activity++
          for (const [owner, key, count] of [
            [f.runtime.renderer, 'dispose', () => rendererDisposals++],
            [f.runtime.renderer, 'forceContextLoss', () => contexts++],
            [f.runtime.observer, 'disconnect', () => observerDisconnects++],
          ] as const) {
            const original = owner[key].bind(owner)
            owner[key] = (...args: unknown[]) => {
              count()
              return original(...args)
            }
          }
          let release!: () => void
          const gate = new Promise<void>((resolve) => {
            release = resolve
          })
          if (mode === 'preparation') f.runtime.holdPreparation(gate)
          if (mode === 'reveal') f.runtime.holdReveal(gate)
          const play = f.runtime.play({ physicsWorker: false }).then(
            () => 'played',
            (e: Error) => e.name,
          )
          if (mode === 'playing') {
            await play
            f.runtime.stop()
            await f.runtime.play({ physicsWorker: false })
            f.runtime.tick(1000)
          } else {
            const desired = mode === 'reveal' ? 'holding' : 'preparing',
              deadline = performance.now() + 15000
            while (f.canvas.dataset.reveal !== desired) {
              if (performance.now() > deadline) throw new Error('Gate not reached')
              await new Promise((resolve) => setTimeout(resolve, 10))
            }
          }
          const xr =
            mode === 'playing'
              ? f.runtime.loadXR().then(
                  () => 'loaded',
                  () => 'cancelled',
                )
              : Promise.resolve('unused')
          f.runtime.dispose()
          f.runtime.dispose()
          const outcome = await Promise.race([
            play,
            new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000)),
          ])
          release()
          await new Promise((resolve) => setTimeout(resolve, 20))
          const activityBefore = activity,
            survivorBefore = survivorActivity
          window.dispatchEvent(new PointerEvent('pointermove'))
          survivor.runtime.tick(1000 + outcomes.length * 16)
          outcomes.push({
            mode,
            outcome,
            xr: await xr,
            rendererDisposals,
            contexts,
            observerDisconnects,
            tabIndex: f.canvas.getAttribute('tabindex'),
            staleActivity: activity - activityBefore,
            survivorActivity: survivorActivity - survivorBefore,
            providers: navigation.navigationPlaces().map((p: { id: string }) => p.id),
            revealed: f.canvas.dataset.reveal === 'play',
          })
          f.parent.remove()
        }
        return { outcomes, survivorFrames: survivor.frames() }
      } finally {
        releasePlaces()
        survivor.runtime.dispose()
        survivor.parent.remove()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.survivorFrames).toBe(3)
  for (const row of result.outcomes as any[]) {
    expect(row).toMatchObject({
      rendererDisposals: 1,
      contexts: 1,
      observerDisconnects: 1,
      staleActivity: 0,
      survivorActivity: 1,
      providers: ['survivor'],
    })
    expect(row.outcome).toBe(row.mode === 'playing' ? 'played' : 'AbortError')
    expect(row.xr).toBe(row.mode === 'playing' ? 'cancelled' : 'unused')
    expect(row.tabIndex).toBe(row.mode === 'reveal' ? '7' : null)
    if (row.mode !== 'playing') expect(row.revealed).toBe(false)
  }
})

test('a failing presentation disposer still releases the renderer and restores the canvas', async ({
  page,
}) => {
  await page.route('**/teardown-error', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body><div><canvas tabindex="5"></canvas></div></body>',
    }),
  )
  await page.goto('/teardown-error')
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
          name: 'Dispose failure',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
        },
      })
      await runtime.setPlayerBody(null)
      const error = new Error('release failure'),
        original = runtime.view.dispose.bind(runtime.view)
      runtime.view.dispose = () => {
        original()
        throw error
      }
      let renderer = 0
      const release = runtime.renderer.dispose.bind(runtime.renderer)
      runtime.renderer.dispose = () => {
        renderer++
        release()
      }
      let sameError = false
      try {
        runtime.dispose()
      } catch (caught) {
        sameError = caught === error
      }
      runtime.dispose()
      return {
        sameError,
        renderer,
        tabIndex: canvas.getAttribute('tabindex'),
        aborted: runtime.lifetime.signal.aborted,
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result).toEqual({ sameError: true, renderer: 1, tabIndex: '5', aborted: true })
})
