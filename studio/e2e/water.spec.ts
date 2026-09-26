import { test, expect } from './studio-test.js'
import { createEntity } from '../../src/stage/scene.js'

test('fills the published sea hole with one sheet and does not fetch ocean tiles', async ({
  page,
}) => {
  const ocean: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('openfreemap.org')) ocean.push(request.url())
  })
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
  await expect(page.locator('#viewport > canvas')).toHaveAttribute('data-sea', 'sheet')
  expect(ocean).toEqual([])
})
