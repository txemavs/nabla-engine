import { expect, it } from 'vitest'
import { XRStats } from '../../src/runtime/xr-stats.js'
it('reports callback cadence, CPU, physics and unmultiplied render counters', () => {
  const stats = new XRStats()
  expect(stats.sample(0, 5, 2, 40, 100000)).toBeNull()
  for (let time = 20; time < 1000; time += 20) stats.sample(time, 5, 2, 40, 100000)
  const text = stats.sample(1000, 5, 2, 40, 100000)!
  expect(text).toContain('FPS app 50 · p95 20.0 ms')
  expect(text).toContain('CPU 5.0 ms · física 2.0 ms')
  expect(text).toContain('100.000 triángulos · 40 dibujos')
  stats.reset()
  expect(stats.sample(20000, 5, 2, 40, 100000)).toBeNull()
})
