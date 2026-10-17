import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  SurfaceImages,
  applyOpacity,
  listNodes,
  matchNodes,
  meshesUnder,
  setNodesVisible,
  visibleThrough,
} from '../src/viewer/asset-ops.js'

function mesh(name: string, options: { uv?: boolean; extras?: Record<string, unknown> } = {}) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3),
  )
  if (options.uv ?? true)
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1]), 2))
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#336699' }))
  object.name = name
  Object.assign(object.userData, options.extras)
  return object
}

/** Scene > Terrain(Surfaces(Grass, Asphalt), Roads(Centre line), Bare[no uv]) */
function glb() {
  const root = new THREE.Group()
  root.name = 'Scene'
  const terrain = new THREE.Group()
  terrain.name = 'Terrain'
  const surfaces = new THREE.Group()
  surfaces.name = 'Surfaces'
  surfaces.add(mesh('Grass'), mesh('Asphalt', { extras: { layer: 'road', lane: 2 } }))
  const roads = new THREE.Group()
  roads.name = 'Roads'
  roads.add(mesh('Centre_line'))
  terrain.add(surfaces, roads, mesh('Bare', { uv: false }))
  root.add(terrain)
  return root
}
const canvas = {} as HTMLCanvasElement

describe('viewer node listing and selection', () => {
  it('lists nodes parents-first with path, kind and mesh details', () => {
    const nodes = listNodes(glb())
    expect(nodes.map((node) => node.path)).toEqual([
      'Terrain',
      'Terrain/Surfaces',
      'Terrain/Surfaces/Grass',
      'Terrain/Surfaces/Asphalt',
      'Terrain/Roads',
      'Terrain/Roads/Centre_line',
      'Terrain/Bare',
    ])
    const grass = nodes.find((node) => node.name === 'Grass')!
    expect(grass).toMatchObject({ kind: 'mesh', depth: 2, hasUv: true, vertices: 3, triangles: 1 })
    expect(nodes.find((node) => node.name === 'Bare')!.hasUv).toBe(false)
    expect(nodes.find((node) => node.name === 'Surfaces')).toMatchObject({
      kind: 'group',
      children: 2,
    })
    expect(nodes.find((node) => node.name === 'Asphalt')!.extras).toEqual({
      layer: 'road',
      lane: 2,
    })
  })

  it('selects by exact name, RegExp, path, kind, extras or predicate', () => {
    const root = glb()
    const names = (selector: Parameters<typeof matchNodes>[1]) =>
      matchNodes(root, selector).map((node) => node.name)
    expect(names('Grass')).toEqual(['Grass'])
    expect(names('Gras')).toEqual([]) // exact, not substring
    expect(names(/^(Grass|Asphalt)$/)).toEqual(['Grass', 'Asphalt'])
    expect(names({ path: 'Terrain/Roads/Centre_line' })).toEqual(['Centre_line'])
    expect(names({ path: /^Terrain\/Surfaces\// })).toEqual(['Grass', 'Asphalt'])
    expect(names({ kind: 'group' })).toEqual(['Terrain', 'Surfaces', 'Roads'])
    expect(names({ kind: 'mesh', name: /a/ })).toEqual(['Grass', 'Asphalt', 'Bare'])
    expect(names({ extras: { layer: 'road' } })).toEqual(['Asphalt'])
    expect(names({ extras: { layer: 'road', lane: 3 } })).toEqual([])
    expect(names((node) => node.depth === 0)).toEqual(['Terrain'])
  })

  it('is not confused by a global RegExp', () => {
    expect(matchNodes(glb(), /a/g).map((node) => node.name)).toEqual([
      'Terrain',
      'Surfaces',
      'Grass',
      'Asphalt',
      'Roads',
      'Bare',
    ])
  })

  it('also matches the name written in the GLB when the loader changed it', () => {
    const root = new THREE.Group()
    const node = mesh('Centre_line', { extras: { name: 'Centre line' } })
    root.add(node)
    expect(listNodes(root)[0]!.sourceName).toBe('Centre line')
    expect(matchNodes(root, 'Centre line')).toEqual([node])
    expect(matchNodes(root, 'Centre_line')).toEqual([node])
  })

  it('rejects an empty selector instead of matching everything', () => {
    expect(() => matchNodes(glb(), {})).toThrow('matches nothing')
  })

  it('returns meshes at or under matched nodes, each once', () => {
    const root = glb()
    expect(meshesUnder(root, 'Surfaces').map((m) => m.name)).toEqual(['Grass', 'Asphalt'])
    expect(meshesUnder(root, /^(Surfaces|Grass)$/).map((m) => m.name)).toEqual(['Grass', 'Asphalt'])
    expect(meshesUnder(root).map((m) => m.name)).toEqual([
      'Grass',
      'Asphalt',
      'Centre_line',
      'Bare',
    ])
  })
})

describe('node visibility', () => {
  it('shows and hides matched nodes and returns the match count', () => {
    const root = glb()
    expect(setNodesVisible(root, /^(Roads|Grass)$/, false)).toBe(2)
    expect(root.getObjectByName('Roads')!.visible).toBe(false)
    expect(root.getObjectByName('Grass')!.visible).toBe(false)
    expect(root.getObjectByName('Asphalt')!.visible).toBe(true)
    expect(setNodesVisible(root, 'Nope', false)).toBe(0)
    expect(setNodesVisible(root, /^(Roads|Grass)$/, true)).toBe(2)
    expect(root.getObjectByName('Roads')!.visible).toBe(true)
  })

  it('treats a node under a hidden ancestor as hidden for hit tests', () => {
    const root = glb()
    const line = root.getObjectByName('Centre_line')!
    expect(visibleThrough(line, root)).toBe(true)
    setNodesVisible(root, 'Roads', false)
    expect(line.visible).toBe(true)
    expect(visibleThrough(line, root)).toBe(false)
  })
})

describe('surface images', () => {
  it('drapes meshes with UVs, skips the rest, and restores the original materials', () => {
    const root = glb()
    const originals = new Map(meshesUnder(root).map((m) => [m, m.material]))
    const images = new SurfaceImages()
    expect(images.set(meshesUnder(root), canvas)).toBe(3) // Bare has no UV
    const grass = root.getObjectByName('Grass') as THREE.Mesh
    expect(grass.material).not.toBe(originals.get(grass))
    const map = (grass.material as THREE.MeshStandardMaterial).map as THREE.CanvasTexture
    expect(map.flipY).toBe(false)
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace)
    expect((grass.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff)
    expect((root.getObjectByName('Bare') as THREE.Mesh).material).toBe(
      originals.get(root.getObjectByName('Bare') as THREE.Mesh),
    )
    // The loaded material is never edited.
    expect((originals.get(grass) as THREE.MeshStandardMaterial).map).toBeNull()
    expect(images.clear()).toBe(3)
    for (const [m, material] of originals) expect(m.material).toBe(material)
    expect(images.size).toBe(0)
  })

  it('applies options and shares one texture per call, disposed with its last mesh', () => {
    const root = glb()
    const images = new SurfaceImages()
    const grass = root.getObjectByName('Grass') as THREE.Mesh
    const asphalt = root.getObjectByName('Asphalt') as THREE.Mesh
    images.set([grass, asphalt], canvas, {
      flipY: true,
      colorSpace: 'linear',
      anisotropy: 16,
      maxAnisotropy: 4,
    })
    const texture = (grass.material as THREE.MeshStandardMaterial).map as THREE.CanvasTexture
    expect(texture).toBe((asphalt.material as THREE.MeshStandardMaterial).map)
    expect(texture.flipY).toBe(true)
    expect(texture.colorSpace).toBe(THREE.NoColorSpace)
    expect(texture.anisotropy).toBe(4)
    let disposed = 0
    texture.addEventListener('dispose', () => disposed++)
    images.clear([grass])
    expect(disposed).toBe(0) // asphalt still uses it
    images.clear([asphalt])
    expect(disposed).toBe(1)
  })

  it('replaces an earlier image only on the meshes it touches', () => {
    const root = glb()
    const images = new SurfaceImages()
    const grass = root.getObjectByName('Grass') as THREE.Mesh
    const asphalt = root.getObjectByName('Asphalt') as THREE.Mesh
    images.set([grass, asphalt], canvas)
    const first = (grass.material as THREE.MeshStandardMaterial).map
    images.set([asphalt], canvas)
    expect((grass.material as THREE.MeshStandardMaterial).map).toBe(first)
    expect((asphalt.material as THREE.MeshStandardMaterial).map).not.toBe(first)
    expect(images.size).toBe(2)
    expect(images.clear([asphalt])).toBe(1)
    expect(images.clear([asphalt])).toBe(0)
    expect(images.size).toBe(1)
  })
})

describe('asset opacity', () => {
  it('fades materials, multiplies their own opacity, and restores them exactly at 1', () => {
    const root = glb()
    const grass = root.getObjectByName('Grass') as THREE.Mesh
    const material = grass.material as THREE.MeshStandardMaterial
    material.opacity = 0.8
    applyOpacity(root, 0.5)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
    expect(material.opacity).toBeCloseTo(0.4)
    applyOpacity(root, 0.25)
    expect(material.opacity).toBeCloseTo(0.2)
    applyOpacity(root, 1)
    expect(material).toMatchObject({ transparent: false, depthWrite: true })
    expect(material.opacity).toBeCloseTo(0.8)
  })

  it('does nothing to materials that were never faded when set to 1', () => {
    const root = glb()
    const material = (root.getObjectByName('Grass') as THREE.Mesh).material as THREE.Material
    const version = material.version
    applyOpacity(root, 1)
    expect(material.version).toBe(version)
  })

  it('keeps an already transparent material transparent at 1', () => {
    const root = glb()
    const material = (root.getObjectByName('Grass') as THREE.Mesh).material as THREE.Material
    material.transparent = true
    applyOpacity(root, 0.5)
    applyOpacity(root, 1)
    expect(material.transparent).toBe(true)
  })

  it('carries the fade to image overrides and back', () => {
    const root = glb()
    const grass = root.getObjectByName('Grass') as THREE.Mesh
    const images = new SurfaceImages()
    applyOpacity(root, 0.5)
    images.set([grass], canvas)
    applyOpacity(root, 0.5)
    const clone = grass.material as THREE.MeshStandardMaterial
    expect(clone.opacity).toBeCloseTo(0.5)
    applyOpacity(root, 1)
    expect(clone).toMatchObject({ opacity: 1, transparent: false })
  })
})
