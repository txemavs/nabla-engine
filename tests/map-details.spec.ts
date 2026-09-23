import { test, expect } from '@playwright/test'
test('shows settlement labels and batched railway ribbons above terrain', async ({ page }) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { createRealWorld } = await import('/@fs' + root + '/src/real-world.ts')
    const { localToGeo } = await import('/@fs' + root + '/src/geography.ts')
    const viewModule = '/view.ts'
    const { SceneView } = await import(viewModule)
    const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
    const coords = (points: number[][]) =>
      points.map(([x, z]) => {
        const p = localToGeo(origin, [x, 0, z])
        return [p.longitude, p.latitude]
      })
    const doc = createRealWorld({
      name: 'Terrain acceptance',
      origin,
      terrain: { columns: 121, rows: 121, spacing: 10, heights: Array(14641).fill(0) },
      source: { retrievedAt: '2026-09-23' },
      features: [
        {
          id: 'way/1',
          tags: { railway: 'rail', gauge: '1668' },
          rings: [
            {
              role: 'outer',
              coordinates: coords([
                [-150, 0],
                [150, 0],
              ]),
            },
          ],
        },
        {
          id: 'node/2',
          tags: { place: 'city', name: 'Irún / Irun' },
          rings: [{ role: 'point', coordinates: coords([[0, 30]]) }],
        },
        {
          id: 'way/3',
          tags: { natural: 'water' },
          rings: [
            {
              role: 'outer',
              coordinates: coords([
                [-150, 60],
                [150, 60],
                [150, 120],
                [-150, 120],
                [-150, 60],
              ]),
            },
          ],
        },
      ],
    })
    doc.entities = doc.entities.filter((e: any) => e.kind !== 'vehicle')
    const view = new SceneView(doc)
    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setSize(960, 600)
    const scene = new T.Scene()
    scene.background = new T.Color('#263846')
    scene.add(view.root, new T.HemisphereLight(0xffffff, 0x334422, 2))
    const sun = new T.DirectionalLight(0xffffff, 2)
    sun.position.set(0, 100, 20)
    scene.add(sun)
    const camera = new T.PerspectiveCamera(48, 960 / 600, 0.1, 5000)
    camera.position.set(70, 130, 190)
    camera.lookAt(0, 0, 20)
    view.setPlaying(true)
    view.limitDrawDistance(camera.position, 1000, true, false, 1000)
    renderer.render(scene, camera)
    const label = view.objects.get('osm-node-2')
    const railOriginals = doc.entities
      .filter((e: any) => e.railway)
      .map((e: any) => view.objects.get(e.id).visible)
    document.body.replaceChildren(renderer.domElement)
    return {
      labelVisible: label.visible,
      text: doc.entities.find((e: any) => e.placeLabel).placeLabel.text,
      railOriginals,
      calls: renderer.info.render.calls,
    }
  }, process.cwd())
  expect(result.labelVisible).toBe(true)
  expect(result.text).toBe('Irún / Irun')
  expect(result.railOriginals.length).toBeGreaterThan(0)
  expect(result.railOriginals.every((v: boolean) => !v)).toBe(true)
  expect(result.calls).toBeLessThan(25)
  await page.screenshot({ path: '/tmp/map-details.png' })
})
