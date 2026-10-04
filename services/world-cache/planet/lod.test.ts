import { expect, it } from 'vitest'
import { PlaneGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { simplifyGeometry, simplifyTile } from './lod.js'
it('reduces terrain indices and vertex storage while retaining shared boundary positions', async () => {
  const source = new PlaneGeometry(100, 100, 32, 32)
  const original = source.getAttribute('position')
  const boundary = []
  for (let i = 0; i < original.count; i++)
    if (Math.abs(original.getX(i)) === 50 || Math.abs(original.getY(i)) === 50)
      boundary.push([original.getX(i), original.getY(i), original.getZ(i)].join(','))
  const { geometry, error } = await simplifyGeometry(source, 0.2, 1)
  expect(geometry.index!.count).toBeLessThan(source.index!.count * 0.5)
  expect(geometry.getAttribute('position').count).toBeLessThan(original.count)
  const retained = new Set(
    Array.from({ length: geometry.getAttribute('position').count }, (_, i) =>
      [
        geometry.getAttribute('position').getX(i),
        geometry.getAttribute('position').getY(i),
        geometry.getAttribute('position').getZ(i),
      ].join(','),
    ),
  )
  for (const p of boundary) expect(retained.has(p)).toBe(true)
  expect(error).toBeLessThanOrEqual(1)
  source.dispose()
  geometry.dispose()
})
it('never changes a Z15 mesh and records actual coarse reduction', async () => {
  const root = new Group(),
    mesh = new Mesh(new PlaneGeometry(100, 100, 32, 32), new MeshBasicMaterial())
  root.add(mesh)
  const original = mesh.geometry
  expect(await simplifyTile(root, 15)).toBeUndefined()
  expect(mesh.geometry).toBe(original)
  const report = await simplifyTile(root, 14)
  expect(report!.outputTriangles).toBeLessThan(report!.inputTriangles)
  expect(report!.revision).toBe('mesh-lod-v1')
  mesh.geometry.dispose()
  mesh.material.dispose()
})

it('composes only four complete verified children in the parent geographic frame', async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { createHash } = await import('node:crypto')
  const { groundGlb } = await import('../../../test/browser/e2e/planet-fixture.js')
  const { mapTileChildren, mapTilePath, mapTileId, mapTileBounds, mapTileSample } =
    await import('../../../src/scene/mercator.js')
  const { composeChildMeshes } = await import('./lod.js')
  const root = await mkdtemp(join(tmpdir(), 'nabla-lod-'))
  const parent = { z: 14, x: 8109, y: 5998 }
  try {
    expect(await composeChildMeshes(root, parent)).toBeUndefined()
    for (const tile of mapTileChildren(parent)) {
      const directory = join(root, mapTilePath(tile))
      await mkdir(directory, { recursive: true })
      const files: Record<string, unknown> = {}
      for (const layer of ['terrain', 'buildings-osm']) {
        const bytes = groundGlb(layer === 'buildings-osm')
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const path = layer + '-' + sha256.slice(0, 16) + '.glb'
        await writeFile(join(directory, path), bytes)
        files[layer] = { path, sha256, bytes: bytes.length, download: path }
      }
      await writeFile(
        join(directory, 'manifest.json'),
        JSON.stringify({
          format: 'nabla-planet-tile-v1',
          generator: 'native-xyz-v2',
          id: mapTileId(tile),
          tile,
          anchor: mapTileSample(tile, 1, 1, 2),
          bounds: mapTileBounds(tile),
          files,
        }),
      )
    }
    const result = await composeChildMeshes(root, parent)
    expect(result?.sources).toHaveLength(4)
    expect(result?.root.children).toHaveLength(4)
    const centers = result!.root.children.map((node) => {
      const g = (node as Mesh).geometry
      g.computeBoundingBox()
      return g.boundingBox!.min.x
    })
    expect(Math.max(...centers) - Math.min(...centers)).toBeGreaterThan(800)
    result!.root.traverse((n) => {
      if (n instanceof Mesh) {
        n.geometry.dispose()
        ;(n.material as MeshBasicMaterial).dispose()
      }
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
