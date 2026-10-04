/** Reproducible headless CPU benchmark. Build first; results are not GPU or browser FPS. */
import { initPhysics, Simulation, createEntity, idleInput } from '../dist/index.js'
import { presetVehicle } from '../dist/catalog/vehicles/index.js'
import { writeFileSync } from 'node:fs'
import os from 'node:os'

await initPhysics()
const results = []
for (const count of [1, 12, 40]) {
  for (let repeat = 0; repeat < 3; repeat++) {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]
    const sim = new Simulation({
      version: 1,
      name: 'CPU benchmark',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [-4, 1, 0]),
        ...Array.from({ length: count }, (_, i) =>
          presetVehicle('car', `car-${i}`, [(i % 8) * 8, 0.7, Math.floor(i / 8) * 12]),
        ),
      ],
    })
    try {
      for (let i = 0; i < 240; i++) sim.step(1 / 60)
      sim.startInVehicle('car-0')
      sim.setInput({ ...idleInput(), forward: 1 })
      const samples = []
      for (let i = 0; i < 600; i++) {
        const start = performance.now()
        sim.step(1 / 60)
        sim.entityTransform('car-0', true)
        sim.wheelTransforms('car-0', true)
        samples.push(performance.now() - start)
      }
      samples.sort((a, b) => a - b)
      results.push({
        vehicles: count,
        repeat,
        meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
        p50Ms: samples[299],
        p95Ms: samples[569],
        p99Ms: samples[593],
        droppedSeconds: sim.stats.droppedSeconds,
      })
    } finally {
      sim.dispose()
    }
  }
}
const report = {
  kind: 'headless CPU, fixed 60 Hz, warm scene, no rendering/streaming',
  node: process.version,
  cpu: os.cpus()[0]?.model,
  warmupSteps: 240,
  measuredSteps: 600,
  results,
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
