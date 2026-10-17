import { afterEach, expect, it, vi } from 'vitest'
import { readZ16Snapshot, Z16Updates } from '../../src/render/planet/z16-updates.js'
const cell = {
  tile: [16, 32447, 23996],
  revision: 'rev-a',
  manifest: '/z/16/32447/23996/manifest.json?revision=rev-a',
}
const snapshot = { schema: 'atlas-z16-updates/1', cells: [cell] }
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
it('resolves publisher paths through the configured proxy and rejects mismatched identities', () => {
  expect([...readZ16Snapshot(snapshot, '/tiles-z16').values()][0].manifestUrl).toBe(
    '/tiles-z16' + cell.manifest,
  )
  expect(() =>
    readZ16Snapshot({ ...snapshot, cells: [{ ...cell, tile: [15, 32447, 23996] }] }, ''),
  ).toThrow()
  expect(() => readZ16Snapshot({ ...snapshot, cells: [cell, cell] }, '')).toThrow()
  expect(() =>
    readZ16Snapshot({ ...snapshot, cells: [{ ...cell, revision: 'rev-b' }] }, ''),
  ).toThrow()
})
it('retains ETag and snapshot on 304 or failure, replaces complete snapshots, and backs off', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(snapshot), { headers: { ETag: '"one"' } }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ ...snapshot, cells: [] }), { headers: { ETag: '"two"' } }),
    )
  vi.stubGlobal('fetch', fetcher)
  const changed = vi.fn(),
    updates = new Z16Updates('/tiles', new AbortController().signal, changed)
  await updates.poll()
  const previous = updates.entries
  await updates.poll()
  expect(fetcher).toHaveBeenCalledTimes(1)
  vi.setSystemTime(15000)
  await updates.poll()
  expect(updates.entries).toBe(previous)
  expect(fetcher.mock.calls[1][1]).toMatchObject({
    credentials: 'omit',
    headers: { 'If-None-Match': '"one"' },
  })
  vi.setSystemTime(30000)
  await updates.poll()
  expect(updates.entries).toBe(previous)
  expect(updates.lastError).toContain('503')
  vi.setSystemTime(44999)
  await updates.poll()
  expect(fetcher).toHaveBeenCalledTimes(3)
  vi.setSystemTime(45000)
  await updates.poll()
  expect(updates.entries.size).toBe(0)
  expect(updates.etag).toBe('"two"')
  expect(changed).toHaveBeenCalledTimes(2)
})
