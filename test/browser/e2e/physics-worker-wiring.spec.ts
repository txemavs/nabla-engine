import { test, expect } from '@playwright/test'

/**
 * The real browser GameRuntime, run twice on the same scene and input: physics inline, then in the
 * default pipelined Web Worker with the main-thread query world. Frames are paced like
 * requestAnimationFrame and never wait for the worker, so worker state arrives a step or more
 * later; runs are compared by simulation time, not frame index:
 * - every worker snapshot must equal the inline state at the same physics tick;
 * - the worker camera, drawn on the render timeline, must equal the inline camera at that
 *   timeline's simulation time (float32 rounding only) and move no more per frame than inline.
 */
test('the physics worker gives the inline simulation at matching physics ticks', async ({
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
    const { FIXED_STEP } = await import(`/@fs/${root}/src/simulation/simulation.ts`)
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
        frames: { frameBusy: boolean }
        keys: { press(code: string, repeat: boolean, now: number): void }
        camera: import('three').PerspectiveCamera
        cameraState: { mode: string; firstPerson: boolean }
        session: { simulation: import('../../../src/simulation/simulation').Simulation }
      }
      // The worker's newest reply (raw state at its tick) and render time; reads such as
      // `player` blend on the render timeline instead.
      type Pipelined = {
        worker: {
          newest: {
            player: unknown
            stats: { ticks: number }
            entities: Record<string, [unknown, unknown]>
          }
          timeline: { renderTime: number | null }
        }
      }
      internal.hasInput = () => true
      internal.cameraState.firstPerson = false
      internal.cameraState.mode = 'chase'
      const frames: {
        tick: number
        renderTime: number
        state: string
        camera: number[]
      }[] = []
      const sim = () => internal.session.simulation
      // Duck-typed: the page imports modules under a different URL than the runtime does.
      const threaded = 'query' in (sim() as object) && 'worker' in (sim() as object)
      for (let i = 0; i < 180; i++) {
        now = (i * 1000) / 60
        if (i < 120) internal.keys.press('KeyW', i > 0, now)
        runtime.tick(now)
        // A frame that awaits a lagged worker answer finishes later (the step itself never waits).
        while (internal.frames.frameBusy) await new Promise((resolve) => setTimeout(resolve, 0))
        const raw = threaded ? (sim() as unknown as Pipelined).worker : null
        const tick = raw ? raw.newest.stats.ticks : sim().stats.ticks
        frames.push({
          tick,
          renderTime: raw ? (raw.timeline.renderTime ?? -1) : tick * FIXED_STEP,
          state: JSON.stringify(
            raw
              ? [raw.newest.player, raw.newest.entities.crate[0]]
              : [sim().player, sim().entityTransform('crate')],
          ),
          camera: [...internal.camera.position.toArray(), ...internal.camera.quaternion.toArray()],
        })
        // The next animation frame: the worker computes while this thread is idle.
        await new Promise((resolve) => setTimeout(resolve, 1000 / 60))
      }
      runtime.dispose()
      return { frames, threaded }
    }
    const inline = await run(false)
    const worker = await run(true)
    performance.now = realNow
    const atTick = new Map(inline.frames.map((frame) => [frame.tick, frame]))
    const ticks = new Set<number>()
    let mismatches = 0,
      cameraDeviation = 0,
      cameraCompared = 0,
      latency = 0
    worker.frames.forEach((frame, i) => {
      latency = Math.max(latency, inline.frames[i].tick - frame.tick)
      const same = atTick.get(frame.tick)
      if (same && !ticks.has(frame.tick)) {
        ticks.add(frame.tick)
        if (same.state !== frame.state) mismatches++
      }
      // The render timeline sits on a physics tick: the inline camera of that tick.
      const shown = atTick.get(Math.round(frame.renderTime / FIXED_STEP))
      if (!shown || Math.abs(frame.renderTime / FIXED_STEP - shown.tick) > 1e-6) return
      cameraCompared++
      frame.camera.forEach((v, k) => {
        cameraDeviation = Math.max(cameraDeviation, Math.abs(v - shown.camera[k]))
      })
    })
    const largestMove = (frames: typeof inline.frames) =>
      Math.max(
        ...frames
          .slice(1)
          .map((frame, i) =>
            Math.hypot(...[0, 1, 2].map((k) => frame.camera[k] - frames[i].camera[k])),
          ),
      )
    const first = JSON.parse(inline.frames[0].state)[0] as { position: number[] }
    const last = JSON.parse(inline.frames.at(-1)!.state)[0] as { position: number[] }
    return {
      mismatches,
      ticksCompared: ticks.size,
      latency,
      cameraDeviation,
      cameraCompared,
      cameraMove: [largestMove(inline.frames), largestMove(worker.frames)],
      frames: inline.frames.length,
      threaded: [inline.threaded, worker.threaded],
      walked: Math.hypot(
        last.position[0] - first.position[0],
        last.position[2] - first.position[2],
      ),
    }
  }, process.cwd())
  console.info(
    `tick parity: ${result.ticksCompared} ticks, ${result.mismatches} mismatches, latency ${result.latency} ticks; camera: ${result.cameraCompared} frames, deviation ${result.cameraDeviation}, largest move ${result.cameraMove}`,
  )
  expect(errors).toEqual([])
  expect(result.threaded).toEqual([false, true])
  expect(result.frames).toBe(180)
  // Most frames see a new worker tick, and every one of them is the inline state of that tick.
  expect(result.ticksCompared).toBeGreaterThan(result.frames / 2)
  expect(result.mismatches).toBe(0)
  expect(result.cameraCompared).toBeGreaterThan(result.frames / 2)
  expect(result.cameraDeviation).toBeLessThan(1e-5)
  // Smooth: the pipelined camera never moves more in one frame than the inline one does.
  expect(result.cameraMove[1]).toBeLessThanOrEqual(result.cameraMove[0] + 1e-5)
  expect(result.walked).toBeGreaterThan(1)
})
