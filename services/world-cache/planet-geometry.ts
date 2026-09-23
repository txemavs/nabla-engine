import {
  BufferAttribute,
  BufferGeometry,
  Matrix4,
  Quaternion,
  Vector3,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { createRealWorld } from '../../src/real-world.js'
import { SceneGraph } from '../../src/scene.js'
import { prepareMapGeometry } from '../../playground/map-geometry.js'
import { entityTileAsset } from '../../playground/tile-asset.js'
import { mapTileId } from '../../src/map-tiles.js'
import {
  planetTileFrame,
  validatePlanetTileSource,
  type PlanetTileSource,
} from '../../src/planet-tile.js'

/** Native XYZ generation. No old prepared tile, local grid or scene origin is an input. */
export function planetTileAsset(source: PlanetTileSource) {
  validatePlanetTileSource(source)
  const frame = planetTileFrame(source.tile)
  const segments = source.elevation.segments
  const document = createRealWorld(
    {
      name: mapTileId(source.tile),
      origin: frame.anchor,
      terrain: {
        columns: segments + 1,
        rows: segments + 1,
        spacing: frame.width / segments,
        heights: source.elevation.heights,
      },
      features: source.features,
      source: { retrievedAt: source.retrievedAt },
    },
    {
      tileId: mapTileId(source.tile),
      project: frame.project,
      preservePrecision: true,
      halfOpenOwnership: true,
      experimentalLargeScene: true,
    },
  )
  const entities = document.entities.filter((e) => e.kind !== 'vehicle' && e.kind !== 'spawn')
  const geometry = prepareMapGeometry(entities)
  const graph = SceneGraph.fromValidated({ version: 1, name: document.name, entities })
  const vegetation = entities
    .filter((e) => e.sprite)
    .map((e) => ({
      position: frame.local(graph.worldTransform(e.id).position),
      size: [e.size[0], e.size[1]],
    }))
  // Warp every vertex (not just each tile's centre). Shared edges therefore coincide
  // after placement in any ECEF/ENU scene, including cells generated independently.
  for (const e of entities) {
    const g = geometry[e.id]
    if (!g) continue
    const pose = graph.worldTransform(e.id)
    const matrix = new Matrix4().compose(
      new Vector3(...pose.position),
      new Quaternion(...pose.rotation),
      new Vector3(1, 1, 1),
    )
    for (let i = 0; i < g.position.length; i += 3) {
      const p = new Vector3().fromArray(g.position, i).applyMatrix4(matrix)
      g.position.set(frame.local(p.toArray()), i)
    }
    const mesh = new BufferGeometry()
    mesh.setAttribute('position', new BufferAttribute(g.position, 3))
    if (g.index) mesh.setIndex(new BufferAttribute(g.index, 1))
    mesh.computeVertexNormals()
    g.normal = mesh.getAttribute('normal').array as Float32Array
    mesh.dispose()
  }
  // Geometry is now entirely in the tile's own geographic frame, with identity poses.
  for (const e of entities) {
    e.parentId = null
    e.transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] }
  }
  const buffers = Object.fromEntries(
    Object.entries(geometry).map(([id, g]) => [
      id,
      Object.fromEntries(
        Object.entries(g)
          .filter(([, a]) => a)
          .map(([key, a]) => [key, a!.buffer.slice(a!.byteOffset, a!.byteOffset + a!.byteLength)]),
      ),
    ]),
  )
  const root = entityTileAsset(
    { entities, geometry: buffers as Parameters<typeof entityTileAsset>[0]['geometry'] },
    `Earth ${mapTileId(source.tile)}`,
    {
      format: 'nabla-planet-tile-v1',
      id: mapTileId(source.tile),
      tile: source.tile,
      anchor: frame.anchor,
      units: 'metres',
      axes: '+X east, +Y up, +Z south',
      attribution: '© OpenStreetMap contributors; elevation: Esri',
      collision: 'render-triangle-prisms-v1',
      vegetation,
    },
  )
  // Vertical edge skirts hide coarse/fine T-junctions. They never enter physics.
  const terrain = Object.entries(geometry).find(([id]) => id.startsWith('world-terrain'))?.[1]
  if (terrain) {
    const count = segments + 1,
      edge: number[] = []
    for (let x = 0; x < segments; x++) edge.push(x)
    for (let y = 0; y < segments; y++) edge.push(y * count + segments)
    for (let x = segments; x > 0; x--) edge.push(segments * count + x)
    for (let y = segments; y > 0; y--) edge.push(y * count)
    const vertices: number[] = []
    for (let i = 0; i < edge.length; i++) {
      const a = Array.from(terrain.position.subarray(edge[i] * 3, edge[i] * 3 + 3))
      const j = edge[(i + 1) % edge.length],
        b = Array.from(terrain.position.subarray(j * 3, j * 3 + 3))
      const c = [b[0], b[1] - 40, b[2]],
        d = [a[0], a[1] - 40, a[2]]
      vertices.push(...a, ...b, ...c, ...a, ...c, ...d)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    g.computeVertexNormals()
    const first = root.children
      .flatMap((c) => c.children)
      .find((m) => m.userData.category === 'Terrain') as Mesh | undefined
    const m = new MeshStandardMaterial({
      color: first ? (first.material as MeshStandardMaterial).color : 0x77936a,
      roughness: 1,
    })
    const skirt = new Mesh(g, m)
    skirt.name = 'Tile edge'
    skirt.userData = { category: 'Skirt', skirt: true, groundLayer: 0 }
    root.add(skirt)
  }
  return { root, frame, geometry }
}
