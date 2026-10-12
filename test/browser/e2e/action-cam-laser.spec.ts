import { test, expect } from '@playwright/test'

test('hover walking produces visible camera roll without physical foot contact', async ({
  page,
}) => {
  await page.route('**/action-walk', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<body><canvas style="width:500px;height:400px"></canvas></body>',
    }),
  )
  await page.goto('/action-walk')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [100, 1, 100]
    const runtime = new GameRuntime({
      canvas: document.querySelector('canvas')!,
      clock: 'manual',
      sea: false,
      audio: false,
      scene: {
        version: 1,
        name: 'Hover walking',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [floor, createEntity('spawn', 'spawn', [0, 2, 0])],
      },
    })
    await runtime.play({ playerMode: 'hover' })
    const internal = runtime as unknown as {
      hasInput(): boolean
      keys: { press(code: string, repeat: boolean, now: number): void }
      camera: import('three').PerspectiveCamera
      cameraState: import('../../../src/runtime/game-camera').GameCameraState
      session: { simulation: import('../../../src/simulation/simulation').Simulation }
    }
    internal.hasInput = () => true
    internal.cameraState.firstPerson = true
    internal.cameraState.mode = 'chase'
    runtime.setActionCamEnabled(true)
    internal.keys.press('KeyW', false, performance.now())
    let maxRoll = 0,
      contactFrames = 0
    for (let i = 0; i < 100; i++) {
      runtime.tick((i * 1000) / 60)
      const up = { x: 0, y: 1, z: 0 }
      const { Vector3 } = await import(String('/e2e/render-fixture.ts'))
      const tilted = new Vector3(up.x, up.y, up.z).applyQuaternion(internal.camera.quaternion)
      maxRoll = Math.max(maxRoll, Math.abs(tilted.x))
      if (internal.session.simulation.player.grounded) contactFrames++
    }
    runtime.dispose()
    return { maxRoll, contactFrames }
  }, process.cwd())
  expect(result.contactFrames).toBe(0)
  expect(result.maxRoll).toBeGreaterThan(0.007)
})

test('laser ribbon keeps consistent screen width and brightness across its two triangles', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/laser-ribbon', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/laser-ribbon')
  const profile = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { ShotLaser } = await import(`/@fs/${root}/src/render/entity/shot-laser.ts`)
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(60, 1, 0.01, 100)
    const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true })
    renderer.setSize(600, 600)
    document.body.append(renderer.domElement)
    const laser = new ShotLaser()
    laser.enabled = true
    scene.add(laser.root)
    const start: [number, number, number] = [0.2, -0.2, -0.5],
      end: [number, number, number] = [-4, 4, -30]
    laser.set(start, end, false)
    renderer.render(scene, camera)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 600
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(renderer.domElement, 0, 0)
    const pixels = ctx.getImageData(0, 0, 600, 600).data
    const a = new T.Vector3(...start).project(camera),
      b = new T.Vector3(...end).project(camera)
    a.set((a.x + 1) * 300, (1 - a.y) * 300, 0)
    b.set((b.x + 1) * 300, (1 - b.y) * 300, 0)
    const along = b.clone().sub(a).normalize(),
      across = new T.Vector3(-along.y, along.x, 0)
    const sums = [0.15, 0.35, 0.65, 0.85].map((t) => {
      const center = a.clone().lerp(b, t)
      let sum = 0
      for (let n = -10; n <= 10; n++) {
        const p = center.clone().addScaledVector(across, n)
        const index = (Math.round(p.y) * 600 + Math.round(p.x)) * 4
        sum += pixels[index]
      }
      return sum
    })
    laser.dispose()
    renderer.dispose()
    return sums
  }, process.cwd())
  expect(errors).toEqual([])
  expect(Math.min(...profile)).toBeGreaterThan(100)
  expect(Math.max(...profile) / Math.min(...profile)).toBeLessThan(1.3)
})
