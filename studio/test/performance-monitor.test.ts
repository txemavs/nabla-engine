import { expect, it } from 'vitest'
import { PerformanceMonitor } from '../../src/diagnostics/performance-monitor.js'
import { planMapZooms, mapTileId, planetReadyCover } from '../../src/scene/mercator.js'
it('bounds telemetry, excludes suspended frames and resets exports', () => {
  const monitor = new PerformanceMonitor()
  for (let i = 0; i < 1900; i++)
    monitor.add({ time: i, frame: 16, cpu: 4, physics: 1, calls: 10, triangles: 300, install: 0.5 })
  monitor.add({
    time: 2000,
    frame: 3000,
    cpu: 4,
    physics: 1,
    calls: 10,
    triangles: 300,
    install: 0,
  })
  expect(monitor.csv().split('\n')).toHaveLength(1801)
  expect(monitor.summary()).toContain('p99 16.0')
  monitor.reset()
  expect(monitor.summary()).toContain('Esperando')
})
it('adaptive coverage requests ancestors within budget and retains a ready parent during refinement', () => {
  const plan = planMapZooms({
    latitude: 43.3,
    longitude: -1.8,
    heightAboveGround: 100,
    viewDistance: 10000,
    maxTiles: 64,
    adaptive: true,
  })
  expect(plan.requests.length).toBeLessThanOrEqual(64)
  expect(new Set(plan.requests.map((t) => t.z)).size).toBeGreaterThan(1)
  const ready = new Set(plan.roots.map(mapTileId))
  expect(planetReadyCover(plan, ready)).toEqual(plan.roots)
})
