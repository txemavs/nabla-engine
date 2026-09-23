import { test, expect } from '@playwright/test'
test.beforeEach(async ({ page }) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
})
test('shares a byte budget, touches LRU reads and persists settings', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { mapCache, setMapCacheBudget, mapCacheStats } = await import(String('/map-cache.ts'))
    await setMapCacheBudget(0.0001)
    const a = mapCache('extract'),
      b = mapCache('prepared')
    await a.put('/a', new Response('a'.repeat(40)))
    await b.put('/b', new Response('b'.repeat(40)))
    await new Promise((r) => setTimeout(r, 5))
    await a.match('/a')
    await b.put('/c', new Response('c'.repeat(40)))
    await b.put('/oversized', new Response('x'.repeat(101)))
    return {
      stats: await mapCacheStats(),
      a: !!(await a.match('/a')),
      b: !!(await b.match('/b')),
      c: !!(await b.match('/c')),
    }
  })
  expect(result).toMatchObject({
    stats: { bytes: 80, budget: 100, entries: 2 },
    a: true,
    b: false,
    c: true,
  })
  await page.reload()
  expect(
    await page.evaluate(async () => {
      const m = await import(String('/map-cache.ts'))
      return (await m.mapCacheStats()).budget
    }),
  ).toBe(100)
})
test('migrates usable legacy responses and removes old cache stores', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const old = await caches.open('nabla-prepared-v5')
    await old.put('/legacy', new Response('prepared', { headers: { etag: 'test' } }))
    const m = await import(String('/map-cache.ts'))
    const hit = await m.mapCache('nabla-prepared-v5').match('/legacy')
    return {
      text: await hit?.text(),
      etag: hit?.headers.get('etag'),
      old: await caches.has('nabla-prepared-v5'),
      stats: await m.mapCacheStats(),
    }
  })
  expect(result).toMatchObject({
    text: 'prepared',
    etag: 'test',
    old: false,
    stats: { bytes: 8, budget: 100_000_000 },
  })
})
test('serializes concurrent workers and applies lower/disabled budgets', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import(String('/map-cache.ts'))
    await m.setMapCacheBudget(0.0001)
    const url = URL.createObjectURL(
      new Blob(
        [
          `import {mapCache} from '${location.origin}/map-cache.ts';onmessage=async e=>{await mapCache('worker').put('/'+e.data,new Response('x'.repeat(60)));postMessage('done')}`,
        ],
        { type: 'text/javascript' },
      ),
    )
    await Promise.all(
      [1, 2, 3].map(
        (id) =>
          new Promise<void>((resolve, reject) => {
            const w = new Worker(url, { type: 'module' })
            w.onmessage = () => {
              w.terminate()
              resolve()
            }
            w.onerror = reject
            w.postMessage(id)
          }),
      ),
    )
    URL.revokeObjectURL(url)
    const before = await m.mapCacheStats()
    await m.setMapCacheBudget(0)
    await m.mapCache('worker').put('/new', new Response('x'))
    return { before, after: await m.mapCacheStats() }
  })
  expect(result.before.bytes).toBeLessThanOrEqual(100)
  expect(result.after).toMatchObject({ bytes: 0, entries: 0, budget: 0 })
})

test('speculative writes cannot evict useful zones when concurrent writers fill the budget', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const { mapCache, setMapCacheBudget, mapCacheStats } = await import(String('/map-cache.ts'))
    await setMapCacheBudget(0.0001)
    const cache = mapCache('prepared')
    await cache.put('/near', new Response('n'.repeat(60)))
    await Promise.all([
      cache.put('/ahead-a', new Response('a'.repeat(30)), false),
      cache.put('/ahead-b', new Response('b'.repeat(30)), false),
    ])
    return { near: !!(await cache.match('/near')), stats: await mapCacheStats() }
  })
  expect(result.near).toBe(true)
  expect(result.stats.bytes).toBe(90)
  expect(result.stats.entries).toBe(2)
})

test('persists a 10 GB budget without allocating it and rejects excessive values', async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const m = await import(String('/map-cache.ts'))
    await m.setMapCacheBudget(10000)
    let rejected = false
    try {
      await m.setMapCacheBudget(10001)
    } catch {
      rejected = true
    }
    return { ...(await m.mapCacheStats()), rejected }
  })
  expect(result).toMatchObject({ budget: 10_000_000_000, bytes: 0, entries: 0, rejected: true })
  await page.reload()
  expect(
    await page.evaluate(
      async () => (await (await import(String('/map-cache.ts'))).mapCacheStats()).budget,
    ),
  ).toBe(10_000_000_000)
})
