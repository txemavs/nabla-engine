import { test, expect } from '@playwright/test'

test('a Web Worker hosted simulation matches the inline one step for step', async ({ page }) => {
  await page.route('**/physics-worker', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/physics-worker')
  const result = await page.evaluate(async (root) => {
    const host = await import(`/@fs${root}/src/simulation/simulation-worker-host.ts`)
    const { Simulation, idleInput } = await import(`/@fs${root}/src/simulation/simulation.ts`)
    const { initPhysics } = await import(`/@fs${root}/src/simulation/physics.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    await initPhysics()
    const ground = createEntity('ground', 'box', [0, -0.5, 0])
    ground.size = [200, 1, 200]
    const doc = {
      version: 1,
      name: 'Worker parity',
      entities: [
        ground,
        createEntity('spawn', 'spawn', [0, 0.05, 4]),
        createEntity('car', 'vehicle', [0, 1, 0]),
      ],
    }
    const inline = new Simulation(structuredClone(doc))
    const worker = host.createWorkerSimulation()
    await worker.create(structuredClone(doc))
    inline.startInVehicle('car')
    await worker.call('startInVehicle', 'car')
    let mismatches = 0
    for (let frame = 0; frame < 180; frame++) {
      const input = { ...idleInput(), forward: 1, right: frame > 90 ? 0.4 : 0 }
      inline.setInput(input)
      inline.setWaterLevel(0)
      inline.step(1 / 60)
      await worker.step(1 / 60, input, 0)
      if (JSON.stringify(worker.snapshot) !== JSON.stringify(host.snapshotSimulation(inline)))
        mismatches++
    }
    const out = { mismatches, inline: inline.player.position, worker: worker.player.position }
    inline.dispose()
    await worker.dispose()
    return out
  }, process.cwd())
  expect(result.mismatches).toBe(0)
  expect(result.worker).toEqual(result.inline)
  expect(Math.hypot(...result.worker)).toBeGreaterThan(2)
})
