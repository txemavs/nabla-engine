import { test, expect } from '@playwright/test'

test('S3 GPS casing retracts and stops map uploads while the speedometer remains powered', async ({
  page,
}) => {
  await page.route('**/gps-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/gps-preview')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs${root}/src/presentation/scene-view.ts`)
    const { createA3 } = await import(`/@fs${root}/src/catalog/vehicles/a3.ts`)
    const { createEntity } = await import(`/@fs${root}/src/entity/schema.ts`)
    const car = createA3('car')
    const doc = { version: 1, name: 'GPS', entities: [car, createEntity('spawn', 'spawn')] }
    const view = new SceneView(doc)
    await view.ready
    const instruments = view.instruments.get('car')
    const body = view.objects.get('car')
    const mount = body.getObjectByName('A3 retractable GPS')
    const casing = mount.children.filter((n: { name: string }) => n.name === 'A3 GPS casing')
    const triangles = casing.reduce(
      (n: number, m: { geometry: { index: { count: number } } }) => n + m.geometry.index.count / 3,
      0,
    )
    instruments.setPowered(true)
    instruments.update(doc, car.transform, 50, 0)
    const initiallyClosed = !instruments.gpsState.open && !mount.visible
    instruments.toggleGps(-1800)
    instruments.update(doc, car.transform, 50, 0)
    instruments.toggleGps(100)
    const version = instruments.gpsState.mapVersion
    instruments.update(doc, car.transform, 60, 1000)
    const middle = instruments.gpsState.progress
    instruments.toggleGps(1000)
    instruments.update(doc, car.transform, 60, 2800)
    const raised = instruments.gpsState.progress
    instruments.toggleGps(3000)
    instruments.update(doc, car.transform, 80, 4800)
    const hidden = !mount.visible
    const offVersion = instruments.gpsState.mapVersion
    for (let i = 0; i < 10; i++)
      instruments.update(doc, { ...car.transform, position: [i, 1, 0] }, 90, 5000 + i * 1000)
    const quiet = instruments.gpsState.mapVersion === offVersion
    const digits = body.getObjectByName('A3 speed readout').visible
    const black = body.getObjectByName('A3 navigator').material.color.getHex() === 0
    const refreshed = offVersion > version
    instruments.toggleGps(16000)
    instruments.update(doc, car.transform, 0, 18000)
    instruments.setPowered(false)
    instruments.setPowered(true)
    const closedOnReentry = !instruments.gpsState.open && !mount.visible
    view.dispose()
    return {
      closedOnReentry,
      initiallyClosed,
      triangles,
      middle,
      raised,
      hidden,
      quiet,
      digits,
      black,
      refreshed,
    }
  }, process.cwd())
  expect(result.closedOnReentry).toBe(true)
  expect(result.initiallyClosed).toBe(true)
  expect(result.triangles).toBe(62)
  expect(result.middle).toBeCloseTo(0.5)
  expect(result.raised).toBe(1)
  expect(result.hidden).toBe(true)
  expect(result.quiet).toBe(true)
  expect(result.digits).toBe(true)
  expect(result.black).toBe(true)
  expect(result.refreshed).toBe(true)
})
