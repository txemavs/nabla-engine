import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Mesh, Vector3 } from 'three'
import {
  FLAT_TEST_TILES,
  FLAT_TEST_ORIGIN,
  createFlatTestScene,
} from '../../src/examples/flat-tile.js'
import { validatePlanetManifest } from '../../src/planet/contract.js'
import { localToGeo, geoToLocal } from '../../src/math/geo/sphere.js'
import { mapTileBounds, mapTileId } from '../../src/scene/mercator.js'
import { planetCollisionChunks } from '../../src/planet/collisions/chunks.js'
import { PlaySession } from '../../src/runtime/session.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'

test('four reproducible Z15 fixtures have valid checksums and planetary sea-level geometry', async () => {
  expect(new Set(FLAT_TEST_TILES.map(mapTileId)).size).toBe(4)
  let totalBytes = 0
  const corners: number[][] = []
  for (const tile of FLAT_TEST_TILES) {
    const base = new URL(
      `../../assets/examples/flat-z15/z/${tile.z}/${tile.x}/${tile.y}/`,
      import.meta.url,
    )
    const manifest = validatePlanetManifest(
      JSON.parse(fs.readFileSync(new URL('manifest.json', base), 'utf8')),
      tile,
    )
    expect(manifest.bounds).toEqual(mapTileBounds(tile))
    for (const layer of ['terrain', 'buildings-osm'] as const) {
      const file = manifest.files[layer],
        bytes = fs.readFileSync(new URL(file.path, base))
      totalBytes += bytes.length
      expect(bytes.length).toBe(file.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256)
      const gltf = await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        '',
      )
      gltf.scene.traverse((object) => {
        if (!(object instanceof Mesh)) return
        const position = object.geometry.getAttribute('position')
        for (let i = 0; i < position.count; i++) {
          const local = new Vector3().fromBufferAttribute(position, i).toArray()
          const geo = localToGeo(manifest.anchor, local)
          expect(Math.abs(geo.altitude)).toBeLessThan(0.0001)
          if ([0, 32, 32 * 33, 1088].includes(i)) corners.push(geoToLocal(FLAT_TEST_ORIGIN, geo))
        }
        const chunks = planetCollisionChunks([
          {
            name: object.name,
            position: new Float32Array(position.array),
            normal: new Float32Array(object.geometry.getAttribute('normal').array),
            index: new Uint32Array(object.geometry.index!.array),
            tint: '#666666',
            side: 0,
            metadata: object.userData,
          },
        ])
        expect(chunks.length).toBeGreaterThan(0)
        object.geometry.dispose()
        object.material.dispose()
      })
    }
  }
  expect(totalBytes).toBeLessThan(200000)
  // All four corners meet at the planetary origin to much better than 1 mm.
  expect(corners.filter((p) => new Vector3(...p).length() < 0.001)).toHaveLength(4)
  expect(
    Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0])),
  ).toBeGreaterThan(2400)
})

test('the example keeps the planet origin at zero and does not mutate the supplied vehicle', async () => {
  const vehicle = presetVehicle('car', 'test-car', [100, 50, 200])
  const scene = createFlatTestScene(vehicle)
  expect(scene.geography).toEqual({ ...FLAT_TEST_ORIGIN, imagery: 'offline', planetary: true })
  expect(scene.entities.find((e) => e.id === 'test-car')!.transform.position).toEqual([0, 2, 0])
  expect(vehicle.transform.position).toEqual([100, 50, 200])
  const session = new PlaySession()
  await session.play(scene, { planetaryTerrain: true, vehicleId: 'test-car' })
  expect(session.simulation?.player.vehicleId).toBe('test-car')
  session.dispose()
})
