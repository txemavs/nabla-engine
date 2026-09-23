import { test, expect } from '@playwright/test'

test('speculative binary download is reused and validates when installed', async ({ page }) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
  const result = await page.evaluate(async () => {
    const { prefetchPrepared, loadPrepared } = await import(String('/prepared-world.ts'))
    const { mapCacheStats } = await import(String('/map-cache.ts'))
    const origin = { latitude: 43, longitude: -1, altitude: 0 }
    const header = new TextEncoder().encode(
      JSON.stringify({ version: 5, origin, key: '0_0', entities: [], geometry: {} }),
    )
    const bytes = new ArrayBuffer(Math.ceil((8 + header.length) / 4) * 4)
    new DataView(bytes).setUint32(0, 0x315a424e, true)
    new DataView(bytes).setUint32(4, header.length, true)
    new Uint8Array(bytes, 8, header.length).set(header)
    const originalFetch = window.fetch
    let requests = 0
    window.fetch = async () => {
      requests++
      return new Response(bytes, {
        headers: { 'content-type': 'application/octet-stream', etag: 'binary-1' },
      })
    }
    try {
      const warmed = await prefetchPrepared(
        origin,
        '0_0',
        new AbortController().signal,
        '/test-prepared',
      )
      const afterWarm = await mapCacheStats()
      const loaded = await loadPrepared(
        origin,
        '0_0',
        new AbortController().signal,
        '/test-prepared',
      )
      return { warmed, bytes: afterWarm.bytes, requests, entities: loaded?.entities.length }
    } finally {
      window.fetch = originalFetch
    }
  })
  expect(result.warmed).toBe(true)
  expect(result.bytes).toBeGreaterThan(0)
  expect(result.requests).toBe(1)
  expect(result.entities).toBe(0)
})

test('missing binary uses legacy JSON and aborted speculation stops before fallback', async ({
  page,
}) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
  const result = await page.evaluate(async () => {
    const { prefetchPrepared, loadPrepared } = await import(String('/prepared-world.ts'))
    const origin = { latitude: 43, longitude: -1, altitude: 0 }
    const originalFetch = window.fetch
    const requests: string[] = []
    window.fetch = async (url) => {
      requests.push(String(url))
      return String(url).endsWith('.bin')
        ? new Response('', { status: 404 })
        : Response.json({ version: 5, origin, key: '1_0', entities: [], geometry: {} })
    }
    try {
      const loaded = await loadPrepared(
        origin,
        '1_0',
        new AbortController().signal,
        '/test-prepared',
      )
      const controller = new AbortController()
      controller.abort()
      let aborted = false
      try {
        await prefetchPrepared(origin, '2_0', controller.signal, '/test-prepared')
      } catch {
        aborted = true
      }
      return { entities: loaded?.entities.length, requests, aborted }
    } finally {
      window.fetch = originalFetch
    }
  })
  expect(result.entities).toBe(0)
  expect(result.requests).toHaveLength(2)
  expect(result.requests[0]).toMatch(/\.bin$/)
  expect(result.requests[1]).toMatch(/\.json$/)
  expect(result.aborted).toBe(true)
})

test('installs even scene placeholders in bounded batches with terrain first', async ({ page }) => {
  await page.goto('/geography/geoeuskadi-pilot/manifest.json')
  const result = await page.evaluate(
    async (sceneModule) => {
      const { createEntity } = await import(sceneModule)
      const { SceneView } = await import(String('/view.ts'))
      const view = new SceneView({
        version: 1,
        name: 'Batched',
        entities: [createEntity('spawn', 'spawn')],
      })
      const additions = Array.from({ length: 40 }, (_, i) =>
        createEntity(`block-${i}`, 'block', [i * 5, 0, 0]),
      )
      const terrain = createEntity('world-terrain', 'terrain')
      terrain.terrain = { columns: 2, rows: 2, spacing: 10, heights: [0, 0, 0, 0] }
      additions[0].kind = 'group'
      terrain.source = {
        provider: 'openstreetmap',
        id: 'way/1',
        retrievedAt: '2026-09-23',
        tags: {},
      }
      additions.push(terrain)
      view.replaceMapEntities(new Set(), additions)
      view.setPlaying(true)
      view.limitDrawDistance(view.root.position, 1000, true)
      const before = {
        pending: view.pendingMapInstall,
        objects: additions.filter((e) => view.objects.has(e.id)).length,
      }
      const installed = view.flushMapInstall(1000, 3)
      const after = {
        pending: view.pendingMapInstall,
        objects: additions.filter((e) => view.objects.has(e.id)).length,
        terrain: view.objects.has('world-terrain'),
      }
      view.dispose()
      return { before, installed, after }
    },
    '/@fs' + process.cwd() + '/src/scene.ts',
  )
  expect(result.before).toEqual({ pending: 41, objects: 0 })
  expect(result.installed).toBe(3)
  expect(result.after).toEqual({ pending: 38, objects: 3, terrain: true })
})
