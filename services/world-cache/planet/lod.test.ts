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

it('supports genuine Z12 reduction with a report while leaving fine tiles intact', async () => {
  const root = new Group(),
    mesh = new Mesh(new PlaneGeometry(1000, 1000, 64, 64), new MeshBasicMaterial())
  root.add(mesh)
  const report = await simplifyTile(root, 12)
  expect(report!.outputTriangles).toBeLessThan(report!.inputTriangles * 0.3)
  expect(report!.revision).toBe('mesh-lod-v1')
  expect(report!.maxErrorMeters).toBeLessThanOrEqual(12)
  mesh.geometry.dispose()
  mesh.material.dispose()
})

it('composes Atlas v4 unified ground through the Engine adapter instead of reading the obsolete terrain file', async () => {
  const { mkdtemp, writeFile, mkdir, rm } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const { createHash } = await import('node:crypto')
  const { groundGlb } = await import('../../../test/browser/e2e/planet-fixture.js')
  const { mapTileChildren, mapTilePath, mapTileId, mapTileBounds, mapTileSample } =
    await import('../../../src/scene/mercator.js')
  const { composeChildMeshes } = await import('./lod.js')
  const output = await mkdtemp(join(tmpdir(), 'nabla-atlas-lod-'))
  try {
    const parent = { z: 14, x: 8109, y: 5998 }
    for (const tile of mapTileChildren(parent)) {
      const path = join(output, mapTilePath(tile))
      await mkdir(path, { recursive: true })
      const bytes = groundGlb(false),
        hash = createHash('sha256').update(bytes).digest('hex')
      const terrain = `terrain-lidar-${hash.slice(0, 16)}.glb`,
        buildings = `buildings-osm-${hash.slice(0, 16)}.glb`
      await writeFile(join(path, terrain), bytes)
      await writeFile(join(path, buildings), bytes)
      const obsolete = 'terrain-' + 'a'.repeat(16) + '.glb'
      const pkg = {
        schema: 'nabla-z15-package/1',
        packageVersion: 1,
        cellVersion: 4,
        cell: { id: mapTileId(tile), ...tile },
        terrain: { engine: obsolete, lidar: terrain },
        files: [
          { path: obsolete, role: 'engine.terrain', bytes: 20, sha256: 'a'.repeat(64) },
          { path: terrain, role: 'terrain.lidar', bytes: bytes.length, sha256: hash },
          { path: buildings, role: 'engine.buildings', bytes: bytes.length, sha256: hash },
        ],
      }
      const json = Buffer.from(JSON.stringify(pkg)),
        pkgHash = createHash('sha256').update(json).digest('hex'),
        pkgFile = `z15-${pkgHash.slice(0, 16)}.json`
      await writeFile(join(path, pkgFile), json)
      await writeFile(
        join(path, 'manifest.json'),
        JSON.stringify({
          format: 'nabla-planet-tile-v1',
          generator: 'native-xyz-v2',
          id: mapTileId(tile),
          tile,
          cellVersion: 4,
          anchor: mapTileSample(tile, 1, 1, 2),
          bounds: mapTileBounds(tile),
          z15Package: {
            schema: 'nabla-z15-package/1',
            file: pkgFile,
            sha256: pkgHash,
            bytes: json.length,
            packageVersion: 1,
          },
          files: {
            terrain: { path: obsolete, download: obsolete, bytes: 20, sha256: 'a'.repeat(64) },
            'buildings-osm': {
              path: buildings,
              download: buildings,
              bytes: bytes.length,
              sha256: hash,
            },
          },
        }),
      )
    }
    const composed = await composeChildMeshes(output, parent)
    expect(composed).toBeDefined()
    expect(composed!.root.children.length).toBe(8)
    expect(composed!.sources.every((source) => !source.includes('a'.repeat(64)))).toBe(true)
    composed!.root.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose()
    })
    const { readFile } = await import('node:fs/promises')
    const directory = join(output, mapTilePath(mapTileChildren(parent)[0]))
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
    await writeFile(join(directory, manifest.z15Package.file), 'corrupt')
    await expect(composeChildMeshes(output, parent)).rejects.toThrow(/checksum/)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
