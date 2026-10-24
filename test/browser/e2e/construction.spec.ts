import { expect, test } from '@playwright/test'

test('construction validates before allocation and rolls back failed owners without disturbing a live runtime', async ({
  page,
}) => {
  await page.route('**/construction-check?loadingWorkers=0', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/construction-check?loadingWorkers=0')
  const result = await page.evaluate(
    async (root) => {
      const moduleRoot = `/@fs/${root.replace(/^\/+/, '')}`
      const { BrowserGameRuntime, GameRuntime } = await import(
        `${moduleRoot}/src/runtime/browser.ts`
      )
      const { createEntity } = await import(`${moduleRoot}/src/entity/schema.ts`)
      const navigation = await import(`${moduleRoot}/src/render/entity/navigation-places.ts`)
      const { GameToolbar } = await import(`${moduleRoot}/src/runtime/game-toolbar.ts`)
      const { VehicleMonitors } = await import(`${moduleRoot}/src/runtime/vehicle-monitors.ts`)
      const scene = {
        version: 1,
        name: 'Construction',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [createEntity('spawn', 'spawn', [0, 1, 0])],
      }
      const make = () => {
        const parent = document.createElement('div'),
          canvas = document.createElement('canvas')
        canvas.setAttribute('tabindex', '7')
        canvas.style.width = '320px'
        parent.append(canvas)
        document.body.append(parent)
        return {
          parent,
          canvas,
          options: { canvas, scene, audio: false, sea: false, hud: true, clock: 'manual' },
        }
      }
      if (BrowserGameRuntime !== GameRuntime)
        throw new Error('Browser compatibility alias diverged')
      const live = make(),
        survivor = new BrowserGameRuntime(live.options)
      await survivor.setPlayerBody(null)
      await survivor.play({ physicsWorker: false })
      const releasePlaces = navigation.registerNavigationPlaces(() => [
        { id: 'survivor', text: 'Survivor', position: { x: 0, z: 0 } },
      ])
      const invalid = make(),
        originalContext = HTMLCanvasElement.prototype.getContext
      let contexts = 0
      HTMLCanvasElement.prototype.getContext = new Proxy(originalContext, {
        apply(target, receiver, args) {
          contexts++
          return Reflect.apply(target, receiver, args)
        },
      })
      const validation: boolean[] = []
      const initial = invalid.parent.innerHTML
      try {
        for (const override of [
          { scene: {} },
          { scene: { ...scene, geography: undefined } },
          { tiles: { baseUrl: null } },
          { fsr: { sharpness: 2 } },
          { startCameras: [{ type: 'invalid' }] },
          { world: { invalid: () => {} } },
          { display: { maxFps: 1 } },
          { camera: { nearClip: -1 } },
          { canvas: document.createElement('canvas') },
          { backend: { renderer: { domElement: document.createElement('canvas') } } },
        ]) {
          let rejected = false
          try {
            new GameRuntime({ ...invalid.options, ...override })
          } catch {
            rejected = true
          }
          validation.push(rejected && invalid.parent.innerHTML === initial)
        }
      } finally {
        HTMLCanvasElement.prototype.getContext = originalContext
      }

      const outcomes: unknown[] = []
      for (const phase of ['toolbar', 'webgl', 'monitors', 'resize']) {
        const f = make(),
          before = f.parent.innerHTML,
          error = new Error(phase)
        const owner =
          phase === 'toolbar'
            ? GameToolbar.prototype
            : phase === 'webgl'
              ? f.canvas
              : phase === 'monitors'
                ? VehicleMonitors.prototype
                : GameRuntime.prototype
        const method =
          phase === 'toolbar'
            ? 'addAction'
            : phase === 'webgl'
              ? 'getContext'
              : phase === 'monitors'
                ? 'rebuild'
                : 'resize'
        const original = owner[method],
          toolbarDispose = GameToolbar.prototype.dispose
        const originalAdd = EventTarget.prototype.addEventListener,
          originalRemove = EventTarget.prototype.removeEventListener
        const listeners: {
          target: EventTarget
          type: string
          callback: unknown
          signal?: AbortSignal
          removed: boolean
        }[] = []
        EventTarget.prototype.addEventListener = function (type, callback, options) {
          if (this === window || this === document || this === f.canvas)
            listeners.push({
              target: this,
              type,
              callback,
              signal: typeof options === 'object' ? options?.signal : undefined,
              removed: false,
            })
          return originalAdd.call(this, type, callback, options)
        }
        EventTarget.prototype.removeEventListener = function (type, callback, options) {
          for (const entry of listeners)
            if (entry.target === this && entry.type === type && entry.callback === callback)
              entry.removed = true
          return originalRemove.call(this, type, callback, options)
        }
        let partial: any,
          renderer = 0,
          lost = 0,
          disconnected = 0,
          worldDisposals = 0,
          sameError = false
        owner[method] = function () {
          if (phase === 'resize') {
            partial = this
            for (const [resource, key, count] of [
              [this.renderer, 'dispose', () => renderer++],
              [this.renderer, 'forceContextLoss', () => lost++],
              [this.observer, 'disconnect', () => disconnected++],
              [this.world, 'dispose', () => worldDisposals++],
            ]) {
              const release = resource[key].bind(resource)
              resource[key] = () => {
                count()
                return release()
              }
            }
          }
          throw error
        }
        GameToolbar.prototype.dispose = function () {
          toolbarDispose.call(this)
          throw new Error('secondary cleanup failure')
        }
        try {
          new GameRuntime({
            ...f.options,
            ...(phase === 'resize' ? { tiles: { baseUrl: '/tiles' } } : {}),
          })
        } catch (caught) {
          sameError = caught === error
        } finally {
          owner[method] = original
          GameToolbar.prototype.dispose = toolbarDispose
          EventTarget.prototype.addEventListener = originalAdd
          EventTarget.prototype.removeEventListener = originalRemove
        }
        outcomes.push({
          phase,
          sameError,
          domRestored: before === f.parent.innerHTML,
          listenersReleased: listeners.every((entry) => entry.removed || entry.signal?.aborted),
          registrationRestored: navigation.navigationPlaces()[0]?.id === 'survivor',
          lateReleased:
            phase !== 'resize' ||
            (partial.disposed &&
              partial.lifetime.signal.aborted &&
              renderer === 1 &&
              lost === 1 &&
              worldDisposals === 1 &&
              disconnected === 1),
        })
        f.parent.remove()
      }
      survivor.tick(1000)
      const survived = survivor.session.state === 'playing' && !survivor.lifetime.signal.aborted
      survivor.dispose()
      releasePlaces()
      const cleanDispose =
        live.parent.children.length === 1 && live.parent.firstElementChild === live.canvas
      return { contexts, validation, outcomes, survived, cleanDispose }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(result.contexts).toBe(0)
  expect(result.validation).toEqual(Array(10).fill(true))
  expect(result.outcomes).toEqual(
    ['toolbar', 'webgl', 'monitors', 'resize'].map((phase) => ({
      phase,
      sameError: true,
      domRestored: true,
      listenersReleased: true,
      registrationRestored: true,
      lateReleased: true,
    })),
  )
  expect(result.survived).toBe(true)
  expect(result.cleanDispose).toBe(true)
})
