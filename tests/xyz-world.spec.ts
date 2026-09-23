import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mapTileAt, mapTileId, mapTileBounds } from '../src/map-tiles.js'
import { triangleGlb } from './xyz-fixture.js'

test('game XYZ replaces complete generated ground only, preserves edits, and restores on exit', async ({
  page,
}) => {
  const bytes = triangleGlb(),
    hash = createHash('sha256').update(bytes).digest('hex'),
    rad = Math.PI / 180,
    r = 6378137,
    earth = 6371000
  const origin = { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 }
  const lat = (z: number) => origin.latitude - z / earth / rad,
    lon = (x: number) => origin.longitude + x / (earth * Math.cos(origin.latitude * rad)) / rad
  const source = {
    west: r * lon(-600) * rad,
    east: r * lon(600) * rad,
    north: -r * Math.asinh(Math.tan(lat(-600) * rad)),
    south: -r * Math.asinh(Math.tan(lat(600) * rad)),
  }
  const first = mapTileAt(lat(-600), lon(-600), 13),
    last = mapTileAt(lat(600), lon(600), 13)
  const tiles: Record<string, unknown>[] = []
  for (let x = first.x; x <= last.x; x++)
    for (let y = first.y; y <= last.y; y++) {
      const tile = { z: 13, x, y },
        b = mapTileBounds(tile)
      tiles.push({
        ...tile,
        id: mapTileId(tile),
        projectedCenter: [
          ((r * (b.west + b.east)) / 2) * rad,
          (-r * (Math.asinh(Math.tan(b.north * rad)) + Math.asinh(Math.tan(b.south * rad)))) / 2,
        ],
        files: Object.fromEntries(
          ['terrain', 'buildings-osm'].map((name) => [
            name,
            {
              path: `z/13/${x}/${y}/${name}-${hash.slice(0, 16)}.glb`,
              bytes: bytes.length,
              sha256: hash,
            },
          ]),
        ),
      })
    }
  await page.route('**/experiments/xyz-flight/catalog.json', (route) =>
    route.fulfill({ json: { format: 'nabla-xyz-pilot-v1', tiles, sourceBounds: [source] } }),
  )
  await page.route('**/experiments/xyz-flight/z/**/*.glb', (route) =>
    route.fulfill({ body: bytes, contentType: 'model/gltf-binary' }),
  )
  await page.goto('/?scene=circuit')
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|WebGL|THREE/.test(m.text())) errors.push(m.text())
  })
  const result = await page.evaluate(
    async ({ root, origin }) => {
      const csmPath = '/csm.ts',
        performancePath = '/performance.ts'
      const { ShadowManager } = await import(csmPath),
        { shadowTiers } = await import(performancePath)
      const shadows = new ShadowManager()
      const xyzPath = '/xyz-world.ts',
        viewPath = '/view.ts'
      const { XyzWorld } = await import(xyzPath),
        T = await import(`/@fs${root}/node_modules/three/build/three.module.js`),
        { createEntity } = await import(`/@fs${root}/src/scene.ts`),
        { SceneView } = await import(viewPath)
      const terrain = {
        ...createEntity('world-terrain', 'terrain'),
        terrain: { columns: 13, rows: 13, spacing: 100, heights: Array(169).fill(0) },
      }
      const doc = {
        version: 1,
        name: 'XYZ test',
        geography: { ...origin, imagery: 'offline' },
        entities: [terrain, createEntity('spawn', 'spawn')],
      }
      const xyz = new XyzWorld(
          origin,
          () => {},
          undefined,
          (material: any) => shadows.setupMaterial(material),
        ),
        view = new SceneView(doc)
      while (view.pendingMapInstall) view.flushMapInstall(1000, 24)
      const offset = new T.Vector3()
      const update = (document = doc, playing = true) =>
        xyz.update([0, 4000, 0], 4000, 8000, document, playing, true, offset)
      for (let i = 0; i < 80; i++) {
        update()
        if (xyz.omitted.has('world-terrain')) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      const covered = xyz.omitted.has('world-terrain')
      view.setMapRenderOmissions(xyz.omitted)
      view.limitDrawDistance(new T.Vector3(), 8000, true)
      const ground = view.objects.get('world-terrain')!,
        hidden = ground.children.filter((c: any) => c.isMesh).every((m: any) => !m.visible)
      const renderer = new T.WebGLRenderer(),
        scene = new T.Scene(),
        camera = new T.PerspectiveCamera(60, 1, 1, 10000)
      renderer.setSize(128, 128)
      camera.position.set(0, 4000, 1)
      camera.lookAt(0, 0, 0)
      scene.add(xyz.root, new T.HemisphereLight(0xffffff, 0x888888, 2))
      renderer.shadowMap.enabled = true
      shadows.init({
        camera,
        scene,
        lightDirection: new T.Vector3(-1, -1, -1).normalize(),
        tier: shadowTiers[512],
      })
      shadows.update(camera, offset)
      renderer.render(scene, camera)
      shadows.dispose()
      let maskRetained = false
      xyz.root.traverse((node: any) => {
        if (!node.isMesh || maskRetained) return
        const shader = {
          uniforms: {},
          vertexShader: '#include <project_vertex>',
          fragmentShader: '#include <clipping_planes_fragment>',
        }
        node.material.onBeforeCompile(shader, renderer)
        maskRetained = shader.fragmentShader.includes('xyzRects')
      })
      const edited = { ...doc, entities: [{ ...terrain, mapEditable: true }, doc.entities[1]] }
      update(edited)
      const editPreserved = xyz.omitted.size === 0 && xyz.coverage.count.value === 0
      update(doc, false)
      view.setMapRenderOmissions(xyz.omitted)
      view.limitDrawDistance(new T.Vector3(), 8000, false)
      const restored = ground.children.filter((c: any) => c.isMesh).some((m: any) => m.visible)
      xyz.dispose()
      view.dispose()
      renderer.dispose()
      return { covered, hidden, editPreserved, restored, maskRetained }
    },
    { root: process.cwd(), origin },
  )
  expect(result).toEqual({
    covered: true,
    hidden: true,
    editPreserved: true,
    restored: true,
    maskRetained: true,
  })
  expect(errors).toEqual([])
})
