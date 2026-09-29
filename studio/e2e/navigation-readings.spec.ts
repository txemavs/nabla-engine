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

test('carrier horizon follows local planetary up, including a floating render origin', async ({
  page,
}) => {
  await page.route('**/horizon-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/horizon-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { ShipHud } = await import(`/@fs${root}/src/render/entity/ship-hud.ts`)
    const hud = new ShipHud()
    const ship = new T.Group()
    const world = new T.Group()
    world.add(ship)
    ship.add(hud.mesh)
    ship.rotation.set(0.3, 0.2, 0.5)
    ship.position.set(300000, -10000, 400000)
    const origin = ship.position.clone()
    world.position.copy(origin).negate()
    const camera = new T.PerspectiveCamera()
    camera.position.set(0, 1, 0).applyQuaternion(ship.quaternion).add(ship.position).sub(origin)
    const up = new T.Vector3(0, 1, 0).applyQuaternion(ship.quaternion)
    const context = hud.mesh.material.map.image.getContext('2d')
    let rotation = NaN
    let pitch = NaN
    const rotate = context.rotate.bind(context)
    const moveTo = context.moveTo.bind(context)
    context.rotate = (angle: number) => {
      rotation = angle
      rotate(angle)
    }
    context.moveTo = (x: number, y: number) => {
      pitch = y
      moveTo(x, y)
    }
    hud.update(camera, origin, 0, { speedKmh: 0, altitude: 10, up: up.toArray() })
    const level = { rotation, pitch }
    ship.rotateZ(0.2)
    hud.update(camera, origin, 200, { speedKmh: 0, altitude: 10, up: up.toArray() })
    const bank = rotation
    ship.rotateZ(-0.2)
    ship.rotateX(0.2) // Nose up: the horizon must move below the instrument centre.
    hud.update(camera, origin, 400, { speedKmh: 0, altitude: 10, up: up.toArray() })
    const noseUp = pitch
    ship.rotateX(-0.4)
    hud.update(camera, origin, 600, { speedKmh: 0, altitude: 10, up: up.toArray() })
    const noseDown = pitch
    hud.dispose()
    return { level, bank, noseUp, noseDown }
  }, process.cwd())
  expect(result.level.rotation).toBeCloseTo(0, 6)
  expect(result.level.pitch).toBeCloseTo(0, 6)
  expect(Math.abs(result.bank)).toBeCloseTo(0.2, 6)
  expect(result.noseUp).toBeCloseTo(30, 6)
  expect(result.noseDown).toBeCloseTo(-30, 6)
})
