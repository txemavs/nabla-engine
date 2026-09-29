import { test, expect } from '@playwright/test'

test('boat readings reuse glyph layers without repainting the horizon texture and release resources once', async ({
  page,
}) => {
  await page.route('**/navigation-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/navigation-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { ShipHud } = await import(`/@fs${root}/src/render/entity/ship-hud.ts`)
    const hud = new ShipHud(true)
    const camera = new T.PerspectiveCamera()
    camera.position.z = 3
    const texture = hud.mesh.material.map
    const version = texture.version
    const parent = new T.Group()
    parent.add(hud.mesh)
    let disposals = 0
    texture.addEventListener('dispose', () => disposals++)
    hud.update(camera, new T.Vector3(), 0, { speedKmh: 12, altitude: 2 })
    const layers = hud.mesh.children.length
    const active = hud.mesh.visible
    hud.update(camera, new T.Vector3(), 120, { speedKmh: 45, altitude: 3 })
    const unchanged = texture.version === version
    hud.update(camera, new T.Vector3(), 240, null)
    const hidden = !hud.mesh.visible
    hud.dispose()
    hud.dispose()
    hud.update(camera, new T.Vector3(), 360, { speedKmh: 99, altitude: 4 })
    return { unchanged, layers, active, hidden, disposals, detached: parent.children.length === 0 }
  }, process.cwd())
  expect(result).toEqual({
    unchanged: true,
    layers: 1,
    active: true,
    hidden: true,
    disposals: 1,
    detached: true,
  })
})
