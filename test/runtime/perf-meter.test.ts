import { describe, expect, it } from 'vitest'
import { PerfMeter, type PerfSummary } from '../../src/runtime/perf-meter.js'

describe('performanceLog summary', () => {
  it('reports frame ms, physics main/worker ms and main idle per second', () => {
    const published: PerfSummary[] = []
    const lines: string[] = []
    const meter = new PerfMeter(
      (s) => published.push(s),
      (l) => lines.push(l),
    )
    for (let i = 0; i <= 50; i++)
      meter.frame(
        'worker',
        { frameMs: 20, cpuMs: 5, physicsMainMs: 0.2, physicsWorkerMs: 3 },
        i * 20,
      )
    expect(published).toHaveLength(1)
    expect(published[0]).toMatchObject({
      mode: 'worker',
      frameMs: 20,
      cpuMs: 5,
      physicsMainMs: 0.2,
      physicsWorkerMs: 3,
    })
    expect(published[0].mainIdlePct).toBe(75)
    expect(lines[0]).toMatch(/^\[nabla-perf\] worker/)
  })
})
