import { test, expect } from '@playwright/test'
import Pbf from 'pbf'
import { createEntity } from '../src/scene.js'

function oceanTile(): Buffer {
  const pbf = new Pbf()
  pbf.writeMessage(
    3,
    (_, layer) => {
      layer.writeStringField(1, 'water')
      layer.writeMessage(
        2,
        (_, feature) => {
          feature.writePackedVarint(2, [0, 0])
          feature.writeVarintField(3, 3)
          feature.writePackedVarint(4, [9, 0, 0, 26, 8192, 0, 0, 8192, 8191, 0, 15])
        },
        null,
      )
      layer.writeStringField(3, 'class')
      layer.writeMessage(4, (_, value) => value.writeStringField(1, 'ocean'), null)
      layer.writeVarintField(5, 4096)
      layer.writeVarintField(15, 2)
    },
    null,
  )
  return Buffer.from(pbf.finish())
}

test('renders cached vector ocean and solar shader without shader errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|WebGLProgram/i.test(m.text())) errors.push(m.text())
  })
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill(
      route.request().url().endsWith('.pbf')
        ? {
            body: oceanTile(),
            contentType: 'application/x-protobuf',
            headers: { 'access-control-allow-origin': '*' },
          }
        : {
            json: { tiles: ['https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf'] },
            headers: { 'access-control-allow-origin': '*' },
          },
    ),
  )
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'ocean.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        version: 1,
        name: 'Coast',
        geography: { latitude: 43.37, longitude: -1.8, altitude: 0, imagery: 'offline' },
        sky: { mode: 'fixed', at: '2026-06-21T12:00:00Z' },
        entities: [createEntity('spawn', 'spawn', [0, 10, 0])],
      }),
    ),
  })
  await expect
    .poll(
      async () => Number(await page.locator('#viewport > canvas').getAttribute('data-water-tiles')),
      { timeout: 30000 },
    )
    .toBeGreaterThan(0)
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/vector-ocean.png' })
  expect(errors).toEqual([])
})
