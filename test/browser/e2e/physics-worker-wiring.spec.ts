import { test, expect } from '@playwright/test'

/**
 * The real browser GameRuntime, run twice on the same scene and input: physics inline, then in a
 * Web Worker with the main-thread query world. Every frame must give the same player state and
 * entity poses; the camera (placed by a cameraPosition query) may differ only by float32 rounding.
 */
test('the game frame loop gives the same frames with the physics worker on and off', async ({
  page,
}) => {
  // Two full software-rendered runs of 180 frames each.
  test.setTimeout(180000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.route('**/physics-worker-wiring', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body></body>',
    }),
  )
  await page.goto('/physics-worker-wiring')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    // Held keys expire on performance.now(); pin it to the frame clock so both runs see the same
    // input regardless of how long each frame really takes.
    let now = 0
    const realNow = performance.now.bind(performance)
    performance.now = () => now
    const run = async (physicsWorker: boolean) => {
      now = 0
      const floor = createEntity('floor', 'box', [0, -0.5, 0])
      floor.size = [100, 1, 100]
      const wall = createEntity('wall', 'box', [0, 1.5, -8])
      wall.size = [6, 3, 0.4]
      const crate = createEntity('crate', 'box', [1.5, 4, -4])
      crate.size = [1, 1, 1]
      crate.motion = 'dynamic'
      crate.mass = 20
      // A fresh canvas per run: a disposed runtime releases its WebGL context.
      const canvas = document.createElement('canvas')
      canvas.style.cssText = 'width:500px;height:400px'
      document.body.replaceChildren(canvas)
      const runtime = new GameRuntime({
        canvas,
        clock: 'manual',
        sea: false,
        audio: false,
        scene: {
          version: 1,
          name: 'Physics worker wiring',
          geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
          entities: [floor, wall, crate, createEntity('spawn', 'spawn', [0, 0.05, 2])],
        },
      })
      await runtime.play({ playerMode: 'walk', physicsWorker })
      const internal = runtime as unknown as {
        hasInput(): boolean
        frameBusy: boolean
        keys: { press(code: string, repeat: boolean, now: number): void }
        camera: import('three').PerspectiveCamera
        cameraState: { mode: string; firstPerson: boolean }
        session: { simulation: import('../../../src/simulation/simulation').Simulation }
      }
      internal.hasInput = () => true
      internal.cameraState.firstPerson = false
      internal.cameraState.mode = 'chase'
      const frames: { player: unknown; crate: unknown; camera: number[] }[] = []
      const sim = () => internal.session.simulation
      // Duck-typed: the page imports modules under a different URL than the runtime does.
      const threaded = 'query' in (sim() as object) && 'worker' in (sim() as object)
      for (let i = 0; i < 180; i++) {
        now = (i * 1000) / 60
        if (i < 120) internal.keys.press('KeyW', i > 0, now)
        runtime.tick(now)
        // With the worker the frame finishes when the step's state arrives.
        while (internal.frameBusy) await new Promise((resolve) => setTimeout(resolve, 0))
        frames.push({
          player: { ...sim().player },
          crate: sim().entityTransform('crate', true),
          camera: [...internal.camera.position.toArray(), ...internal.camera.quaternion.toArray()],
        })
      }
      runtime.dispose()
      return { frames, threaded }
    }
    const inline = await run(false)
    const worker = await run(true)
    performance.now = realNow
    let mismatches = 0,
      cameraDeviation = 0
    inline.frames.forEach((frame, i) => {
      const other = worker.frames[i]
      if (JSON.stringify(frame.player) !== JSON.stringify(other.player)) mismatches++
      else if (JSON.stringify(frame.crate) !== JSON.stringify(other.crate)) mismatches++
      frame.camera.forEach((v, k) => {
        cameraDeviation = Math.max(cameraDeviation, Math.abs(v - other.camera[k]))
      })
    })
    const first = inline.frames[0].player as { position: number[] }
    const last = inline.frames.at(-1)!.player as { position: number[] }
    return {
      mismatches,
      cameraDeviation,
      frames: inline.frames.length,
      threaded: [inline.threaded, worker.threaded],
      walked: Math.hypot(
        last.position[0] - first.position[0],
        last.position[2] - first.position[2],
      ),
    }
  }, process.cwd())
  console.info(
    `frame parity: ${result.frames} frames, ${result.mismatches} mismatches, camera deviation ${result.cameraDeviation}`,
  )
  expect(errors).toEqual([])
  expect(result.threaded).toEqual([false, true])
  expect(result.frames).toBe(180)
  expect(result.mismatches).toBe(0)
  expect(result.cameraDeviation).toBeLessThan(1e-5)
  expect(result.walked).toBeGreaterThan(1)
})
