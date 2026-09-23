import { test, expect } from './studio-test.js'

test('split GLBs preserve buffers and fail safely on missing or mismatched layers', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const sceneModule = `/@fs${root}/src/scene.ts`
    const tileModule = '/tile-asset.ts',
      worldModule = '/glb-world.ts'
    const { createEntity } = await import(sceneModule)
    const { tileAsset } = await import(tileModule)
    const { loadGlbWorld } = await import(worldModule)
    const { GLTFExporter } = await import(
      `/@fs${root}/node_modules/three/examples/jsm/exporters/GLTFExporter.js`
    )
    const entities = [createEntity('grass', 'solid'), createEntity('building', 'solid')]
    entities[0].landcover = { surface: 'grass', isWater: false }
    entities[0].transform.position = [1210, 20, -1195]
    const geometry = Object.fromEntries(
      entities.map((e: any) => [
        e.id,
        {
          position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer,
          normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]).buffer,
        },
      ]),
    )
    const data = {
      version: 5,
      origin: { latitude: 43, longitude: -2, altitude: 30 },
      key: '1_-1',
      entities,
      geometry,
    }
    const tile = tileAsset(data)
    const payloads: Record<string, ArrayBuffer> = {},
      hashes: Record<string, string> = {}
    for (const [name, buildings] of [
      ['terrain', false],
      ['buildings-osm', true],
    ]) {
      const group = tile.clone(true)
      for (const child of [...group.children])
        if ((child.name === 'Buildings') !== buildings) group.remove(child)
      const bytes = (await new GLTFExporter().parseAsync(group, { binary: true })) as ArrayBuffer
      payloads[name as string] = bytes
      hashes[name as string] = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    }
    const manifest = {
      ...data,
      geometry: undefined,
      geometryIds: Object.keys(geometry),
      format: 'nabla-tile-glb-v1',
      files: { terrain: 'terrain.glb', 'buildings-osm': 'buildings-osm.glb' },
      hashes,
    }
    const originalFetch = window.fetch
    let missing = false
    window.fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('manifest.json')) return Response.json(manifest)
      const name = url.includes('buildings-osm') ? 'buildings-osm' : 'terrain'
      return missing && name === 'buildings-osm'
        ? new Response(null, { status: 404 })
        : new Response(payloads[name])
    }
    try {
      const load = () =>
        loadGlbWorld(data.origin, data.key, new AbortController().signal, '/fixture')
      const loaded = await load()
      missing = true
      const absent = await load()
      missing = false
      hashes.terrain = 'wrong'
      const corrupt = await load()
      return {
        count: loaded?.entities.length,
        position: loaded?.entities[0].transform.position,
        vertices: Array.from(loaded?.geometry.grass.position ?? []),
        absent: absent === undefined,
        corrupt: corrupt === undefined,
      }
    } finally {
      window.fetch = originalFetch
    }
  }, process.cwd())
  expect(result.count).toBe(2)
  expect(result.position).toEqual([1210, 20, -1195])
  expect(result.vertices).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0])
  expect(result.absent).toBe(true)
  expect(result.corrupt).toBe(true)
})
