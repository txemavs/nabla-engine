import { test, expect } from '@playwright/test'
import { IRUN_VENTAS } from '../src/real-world.js'

test('loads cached neighboring terrain during driving and preserves it when saving', async ({
  page,
}) => {
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 30000,
  })
  await page.evaluate(async (origin) => {
    const cache = await caches.open('nabla-world-v1')
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        if (x || z) {
          const key = new URL(
            `/__world-cache/${origin.latitude}/${origin.longitude}/${origin.altitude}/${x}_${z}`,
            location.origin,
          ).href
          await cache.put(
            key,
            new Response(
              JSON.stringify({
                name: 'Cached terrain',
                origin,
                terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
                features: [],
                source: { retrievedAt: '2026-09-21T12:00:00Z' },
              }),
              { headers: { 'x-cached-at': String(Date.now()) } },
            ),
          )
        }
  }, IRUN_VENTAS)
  const failures: string[] = []
  page.on('pageerror', (e) => failures.push(e.message))
  await page.locator('#play').click()
  await expect(page.locator('#interaction')).toContainText('E para entrar', { timeout: 15000 })
  await page.keyboard.press('KeyE')
  await page.keyboard.down('KeyW')
  await expect
    .poll(
      async () => Number(await page.locator('#viewport > canvas').getAttribute('data-world-zones')),
      {
        timeout: 15000,
      },
    )
    .toBeGreaterThanOrEqual(2)
  await page.keyboard.up('KeyW')
  await expect(page.locator('#player-mode')).toHaveText('AUDI A3 CABRIO')
  await expect
    .poll(
      async () => Number(await page.locator('#viewport > canvas').getAttribute('data-world-zones')),
      {
        timeout: 20000,
      },
    )
    .toBeGreaterThanOrEqual(3)
  await page.locator('#play').click()
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await expect(page.locator('#status')).toHaveText('Guardado local')
  await page.reload()
  await expect(page.locator('#world-note')).toBeVisible()
  expect(await page.locator('[data-entity-id^="world-terrain"]').count()).toBeGreaterThanOrEqual(3)
  expect(failures).toEqual([])
})

test('reports a provider failure and stopping cancels the streaming session', async ({ page }) => {
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) =>
    route.fulfill({
      status: 503,
      body: 'Unavailable',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) => route.abort())
  await page.goto('/')
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-assets', 'loaded', {
    timeout: 30000,
  })
  await page.locator('#play').click()
  await expect(page.locator('#stream-status')).toContainText('reintento en 60 s', {
    timeout: 15000,
  })
  await page.locator('#play').click()
  await expect(page.locator('#stream-status')).toHaveText(
    'Exploración conectada · precarga al jugar',
  )
  expect(await page.locator('[data-entity-id^="world-terrain"]').count()).toBe(1)
})

test('falls back to IndexedDB when a scene exceeds localStorage quota', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const saved = await page.evaluate(async () => {
    const path = '/scene-storage.ts'
    const { writeScene, readScene } = await import(path)
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'quota-test' && value.length > 1000)
        throw new DOMException('Full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
    const payload = 'x'.repeat(2000)
    try {
      await writeScene('quota-test', payload)
      return {
        marker: localStorage.getItem('quota-test'),
        roundtrip: (await readScene('quota-test')) === payload,
      }
    } finally {
      Storage.prototype.setItem = original
    }
  })
  expect(saved).toEqual({ marker: '{"storage":"indexeddb"}', roundtrip: true })
})

test('loads terrain around a player twelve kilometres away from the starting district', async ({
  page,
}) => {
  await page.route(/WorldElevation3D|\/world-cache\/elevation/, (route) =>
    route.fulfill({
      path: 'tests/fixtures/terrain.lerc',
      contentType: 'application/octet-stream',
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.route(/overpass-api\.de\/|\/world-cache\/osm/, (route) =>
    route.fulfill({
      json: { elements: [] },
      headers: { 'access-control-allow-origin': '*' },
    }),
  )
  await page.goto('/')
  await expect(page.locator('#world-loading')).toBeHidden({ timeout: 30000 })
  const doc = await page.evaluate(async () => {
    // Resolve through the same Vite module URL used by the playground.
    const modules = performance.getEntriesByType('resource').map((r) => r.name)
    const moduleUrl = modules.find((url) => url.includes('/src/real-world.ts'))!
    const { createRealWorld } = await import(moduleUrl)
    const d = createRealWorld(await (await fetch('/geography/irun-ventas.json')).json())
    d.entities.find((e: { kind: string }) => e.kind === 'spawn').transform.position = [
      12000, 500, 0,
    ]
    return d
  })
  await page.locator('#file').setInputFiles({
    name: 'far.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await page.locator('#play').click()
  await expect(page.locator('[data-entity-id="world-terrain-10_0"]')).toHaveCount(1, {
    timeout: 30000,
  })
  await expect(page.locator('#stream-status')).toContainText('zonas disponibles', {
    timeout: 30000,
  })
})
