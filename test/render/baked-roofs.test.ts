import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  adaptAtlasManifest,
  atlasFile,
  validateAtlasZ15Package,
} from '../../src/planet/atlas-z15.js'
import type { PlanetManifest } from '../../src/planet/contract.js'
import { bakedDrapeLayers, buildDrapes, type DrapeSource } from '../../src/render/planet/drape.js'
import { dressSatelliteRoofs } from '../../src/render/planet/world.js'
import type { MapTile } from '../../src/scene/mercator.js'

// Atlas `roof_bake`: roof faces move from the vertex-coloured Buildings node to a `Roofs` node
// (category Buildings) with UVs into the lean-corrected roof photo, embedded once in the GLB.
const box = (y: number): DrapeSource => ({
  name: 'Buildings',
  // One flat roof triangle (normal +Y) and one wall triangle.
  position: new Float32Array([0, y, 0, 10, y, 0, 0, y, 10, 0, 0, 0, 0, y, 0, 0, 0, 10]),
  normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]),
  metadata: { category: 'Buildings' },
})
const roofs = (y: number): DrapeSource => ({
  ...box(y),
  name: 'Roofs',
  metadata: { category: 'Buildings', roofBake: { schema: 'nabla-roof-bake/1' } },
})
const layers = new Set(['roofs', 'terrain'])

describe('baked roofs (Atlas roof_bake)', () => {
  it('a Buildings mesh with its own map marks roofs as baked; a plain one does not', () => {
    expect(bakedDrapeLayers([{ ...box(8), hasMap: false }]).has('roofs')).toBe(false)
    expect(
      bakedDrapeLayers([
        { ...box(8), hasMap: false },
        { ...roofs(8), hasMap: true },
      ]),
    ).toEqual(new Set(['roofs']))
    // The old engine-baked roof drape node keeps working.
    expect(
      bakedDrapeLayers([{ name: 'Drape', metadata: { drape: 'roofs' }, hasMap: true }]),
    ).toEqual(new Set(['roofs']))
  })

  it('skips the runtime roofs drape (and its 15 cm lift) when roofs are baked', () => {
    const meshes = [box(8), roofs(8)]
    const baked = bakedDrapeLayers(meshes.map((m) => ({ ...m, hasMap: m.name === 'Roofs' })))
    const drapes = buildDrapes(meshes, { width: 800, layers, baked })
    expect(drapes.find((d) => d.id === 'roofs')).toBeUndefined()
  })

  it('older cells (no baked roofs) keep the runtime roofs drape as a fallback', () => {
    const meshes = [box(8)]
    const baked = bakedDrapeLayers(meshes.map((m) => ({ ...m, hasMap: false })))
    expect(buildDrapes(meshes, { width: 800, layers, baked }).map((d) => d.id)).toEqual(['roofs'])
  })

  it('never drapes a baked Roofs mesh even if a caller forgets the baked set', () => {
    expect(buildDrapes([roofs(8)], { width: 800, layers })).toEqual([])
  })

  it('dressSatelliteRoofs shows no roofs drape for a cell with a textured Roofs mesh', () => {
    const tile: MapTile = { z: 15, x: 16211, y: 12003 }
    const dir = new URL('../planet/fixtures/atlas-16211-12003/', import.meta.url)
    const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir)).toString())
    const pkg = validateAtlasZ15Package(
      JSON.parse(readFileSync(new URL('z15-059a2665959db8a9.json', dir)).toString()),
      tile,
    )
    const m = adaptAtlasManifest(manifest as PlanetManifest, pkg)
    // Ground and roads still use the roofless lots photo, never the composite.
    expect(m.photo?.path).toBe(atlasFile(pkg, 'ground.lots')!.path)
    expect(m.photo?.path).not.toBe(atlasFile(pkg, 'ground.composite')!.path)
    const group = new THREE.Group()
    const roofMap = new THREE.Texture({ width: 4, height: 4 } as unknown as ImageBitmap)
    const r = roofs(8)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(r.position, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(r.normal, 3))
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: roofMap }))
    mesh.name = 'Roofs'
    mesh.userData = r.metadata
    group.add(mesh)
    const b = box(8)
    const wall = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())
    wall.geometry.setAttribute('position', new THREE.BufferAttribute(b.position, 3))
    wall.geometry.setAttribute('normal', new THREE.BufferAttribute(b.normal, 3))
    wall.name = 'Buildings'
    wall.userData = b.metadata
    group.add(wall)
    dressSatelliteRoofs(
      group,
      { ...m, tile } as PlanetManifest,
      () => {},
      () => {},
      'package',
      'cell/' + m.photo!.path,
      undefined,
      undefined,
    )
    const drapes = group.children.filter((n) => n.name === 'Drape').map((n) => n.userData.drape)
    expect(drapes).not.toContain('roofs')
    // The baked roof keeps its own texture (not black, not replaced by the ground photo).
    expect((mesh.material as THREE.MeshStandardMaterial).map).toBe(roofMap)
  })
})
