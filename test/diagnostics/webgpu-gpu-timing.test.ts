import { describe, expect, it } from 'vitest'
import { WebGPUGpuTiming, type TimestampRenderer } from '../../src/diagnostics/gpu-timing.js'

/** A stand-in for three's render timestamp pool: each draw allocates a uid. */
function fakeRenderer(trackTimestamp = true) {
  const pool = { queryOffsets: new Map<string, number>(), timestamps: new Map<string, number>() }
  let next = 0
  const durations = new Map<string, number>()
  let release: () => void = () => undefined
  const renderer: TimestampRenderer & { draw(ms: number): void; settle(): Promise<void> } = {
    backend: { trackTimestamp, timestampQueryPool: { render: pool } },
    draw(ms: number) {
      const uid = `r:${next}:1:f1`
      pool.queryOffsets.set(uid, next * 2)
      durations.set(uid, ms)
      next++
    },
    resolveTimestampsAsync() {
      const batch = new Map(pool.queryOffsets)
      pool.queryOffsets.clear()
      return new Promise<number>((resolve) => {
        release = () => {
          pool.timestamps.clear()
          for (const uid of batch.keys()) pool.timestamps.set(uid, durations.get(uid)!)
          resolve(0)
        }
      })
    },
    async settle() {
      release()
      await new Promise((r) => setTimeout(r, 0))
    },
  }
  return renderer
}

describe('WebGPUGpuTiming', () => {
  it('is unavailable without timestamp tracking', () => {
    expect(new WebGPUGpuTiming(fakeRenderer(false)).available).toBe(false)
  })

  it('attributes each pass its own render calls and sums the frame', async () => {
    const renderer = fakeRenderer()
    const timing = new WebGPUGpuTiming(renderer)
    timing.beginFrame()
    timing.beginPass('mirrors')
    renderer.draw(0.5)
    timing.endPass('mirrors')
    timing.beginPass('main')
    renderer.draw(2)
    renderer.draw(1)
    timing.endPass('main')
    timing.endFrame()
    timing.beginFrame()
    expect(timing.finish()).toBeUndefined()
    await renderer.settle()
    expect(timing.finish()).toEqual({ frameMs: 3.5, passes: { mirrors: 0.5, main: 3 } })
  })

  it('carries queries over while a readback is still mapping', async () => {
    const renderer = fakeRenderer()
    const timing = new WebGPUGpuTiming(renderer)
    for (const ms of [1, 2]) {
      timing.beginFrame()
      timing.beginPass('main')
      renderer.draw(ms)
      timing.endPass('main')
      timing.endFrame()
    }
    timing.beginFrame()
    await renderer.settle()
    expect(timing.finish()).toEqual({ frameMs: 1, passes: { main: 1 } })
    expect(timing.finish()).toBeUndefined()
    timing.endFrame()
    await renderer.settle()
    expect(timing.finish()).toEqual({ frameMs: 2, passes: { main: 2 } })
  })
})
