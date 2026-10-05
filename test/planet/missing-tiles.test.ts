import { describe, expect, it } from 'vitest'
import { MissingTiles, formatMissingReport } from '../../src/planet/missing-tiles.js'

const a = { z: 15, x: 16210, y: 12003 }
const b = { z: 15, x: 16211, y: 12004 }

function memory(initial?: string) {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set('k', initial)
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}
const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve))

describe('MissingTiles', () => {
  it('records holes with status and time, and lists them oldest first', () => {
    let now = 1000
    const missing = new MissingTiles({ now: () => now })
    missing.record(b, 403)
    now = 2000
    missing.record(a, 404)
    expect(missing.list()).toEqual([
      { ...b, status: 403, at: 1000 },
      { ...a, status: 404, at: 2000 },
    ])
    expect(missing.has(a)).toBe(true)
    expect(missing.countAmong([a, b, { z: 15, x: 1, y: 1 }])).toBe(2)
    expect(formatMissingReport(missing.list())).toBe(
      '15/16211/12004 403 1970-01-01T00:00:01.000Z\n15/16210/12003 404 1970-01-01T00:00:02.000Z',
    )
  })

  it('does not ask again until the retry time has passed (no 404 spam), then asks once more', () => {
    let now = 0
    const missing = new MissingTiles({ now: () => now, retryAfterMs: 60_000 })
    missing.record(a, 404)
    expect(missing.suppressed(a)).toBe(true)
    now = 59_999
    expect(missing.suppressed(a)).toBe(true)
    now = 60_000
    expect(missing.suppressed(a)).toBe(false)
    expect(missing.has(a)).toBe(true)
    expect(missing.suppressed(b)).toBe(false)
  })

  it('forgets a tile that turned up, or everything on clear', () => {
    const missing = new MissingTiles()
    missing.record(a, 404)
    missing.record(b, 404)
    missing.resolve(a)
    expect(missing.list().map((t) => t.x)).toEqual([16211])
    missing.clear()
    expect(missing.list()).toEqual([])
  })

  it('persists across sessions, writing once per burst', async () => {
    const storage = memory()
    const first = new MissingTiles({ key: 'k', storage, now: () => 5 })
    let writes = 0
    const set = storage.setItem
    storage.setItem = (key, value) => {
      writes++
      set(key, value)
    }
    first.record(a, 404)
    first.record(b, 403)
    await flush()
    expect(writes).toBe(1)
    const second = new MissingTiles({ key: 'k', storage })
    expect(second.list()).toEqual([
      { ...a, status: 404, at: 5 },
      { ...b, status: 403, at: 5 },
    ])
  })

  it('starts empty from corrupt or foreign storage and survives a failing write', async () => {
    expect(new MissingTiles({ key: 'k', storage: memory('{nope') }).list()).toEqual([])
    expect(new MissingTiles({ key: 'k', storage: memory('{"a":1}') }).list()).toEqual([])
    expect(new MissingTiles({ key: 'k', storage: memory('[{"z":"x"},null,[1]]') }).list()).toEqual(
      [],
    )
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const missing = new MissingTiles({ storage: broken })
    missing.record(a, 404)
    await flush()
    expect(missing.has(a)).toBe(true)
  })

  it('keeps at most `max` entries, dropping the oldest', () => {
    let now = 0
    const missing = new MissingTiles({ max: 2, now: () => ++now })
    for (const x of [1, 2, 3]) missing.record({ z: 15, x, y: 1 }, 404)
    expect(missing.list().map((t) => t.x)).toEqual([2, 3])
  })
})
