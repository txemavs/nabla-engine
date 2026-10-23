import { afterEach, describe, expect, it, vi } from 'vitest'
import { bootTraceEntries, startBootPhase, measuredBootTime } from '../../src/runtime/boot-trace.js'
afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('nabla.bootTrace')]
  vi.restoreAllMocks()
})
describe('startup timeline', () => {
  it('does not double count nested intervals or include unfinished spans', () => {
    expect(
      measuredBootTime([
        { order: 1, phase: 'parent', startedMs: 10, durationMs: 40 },
        { order: 2, phase: 'child', startedMs: 20, durationMs: 20 },
        { order: 3, phase: 'later', startedMs: 60, durationMs: 10 },
        { order: 4, phase: 'pending', startedMs: 80 },
      ]),
    ).toBe(50)
    expect(measuredBootTime([])).toBe(0)
  })
  it('records start order, elapsed duration and ends each phase only once', () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const now = vi.spyOn(performance, 'now')
    now.mockReturnValue(100)
    const finish = startBootPhase('physics')
    now.mockReturnValue(142)
    finish()
    finish()
    expect(bootTraceEntries()).toEqual([
      { order: 1, phase: 'physics', startedMs: 100, durationMs: 42 },
    ])
    expect(log).toHaveBeenCalledTimes(2)
    expect(log.mock.calls[1][0]).toContain('fase 42.0 ms | total 142.0 ms')
  })
  it('keeps overlapping phases separate and returns isolated snapshots', () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const now = vi.spyOn(performance, 'now').mockReturnValue(10)
    const host = startBootPhase('host')
    now.mockReturnValue(20)
    const worker = startBootPhase('worker')
    now.mockReturnValue(40)
    worker()
    now.mockReturnValue(50)
    host()
    const entries = bootTraceEntries()
    expect(entries.map((e) => e.durationMs)).toEqual([40, 20])
    entries[0].phase = 'mutated'
    expect(bootTraceEntries()[0].phase).toBe('host')
  })
})
