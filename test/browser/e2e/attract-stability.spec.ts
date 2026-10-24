import { test, expect } from '@playwright/test'

test('intro owns its camera and does not catch up after loading stalls or probe redraws', async ({
  page,
}) => {
  await page.route('**/attract-stability-test', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/attract-stability-test')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
    const oldRequest = window.requestAnimationFrame,
      oldCancel = window.cancelAnimationFrame
    let pending: FrameRequestCallback | undefined
    window.requestAnimationFrame = (cb) => {
      pending = cb
      return 1
    }
    window.cancelAnimationFrame = () => {
      pending = undefined
    }
    const frames: { fov: number; eye: number[] }[] = []
    // Exercise the actual boot loop/camera path without loading vehicles or a physics world.
    const runtime = Object.create(GameRuntime.prototype)
    const camera = new T.PerspectiveCamera(48, 1.5, 0.1, 1000)
    Object.assign(runtime, {
      disposed: false,
      document: { geography: { altitude: 0 } },
      camera,
      origin: new T.Vector3(),
      options: { canvas: document.createElement('canvas') },
      displayController: { settings: { maxFps: 0 } },
      performanceSettings: { state: { fog: true } },
      renderer: { autoClear: false },
      environment: { updateSky() {} },
      sky: {
        setViewAspect() {},
        render(_renderer: unknown, cam: typeof camera, eye: InstanceType<typeof T.Vector3>) {
          frames.push({ fov: cam.fov, eye: eye.toArray() })
        },
      },
      observeResolution() {},
    })
    const tick = (time: number) => {
      const cb = pending!
      pending = undefined
      cb(time)
    }
    try {
      runtime.startAttract()
      tick(100)
      tick(116)
      camera.fov = 5 // asynchronous cockpit/map warmup changes the gameplay projection
      camera.position.set(9, 8, 7)
      tick(60_116) // one minute without frames must advance by at most 50 ms
      const elapsed = runtime.attract.elapsed
      runtime.renderAttractFrame()
      runtime.renderAttractFrame()
      const gamePose = camera.position.toArray()
      runtime.stopAttract()
      return { frames, elapsed, gamePose, gameFov: camera.fov, stopped: !pending }
    } finally {
      window.requestAnimationFrame = oldRequest
      window.cancelAnimationFrame = oldCancel
    }
  }, process.cwd())
  expect(result.frames.every((frame) => frame.fov === 48)).toBe(true)
  expect(result.elapsed).toBe(66)
  expect(result.frames[3]).toEqual(result.frames[2])
  expect(result.frames[4]).toEqual(result.frames[2])
  expect(result.gamePose).toEqual([9, 8, 7])
  expect(result.gameFov).toBe(5)
  expect(result.stopped).toBe(true)
})
