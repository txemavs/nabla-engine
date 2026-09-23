import * as THREE from 'three'
import { SceneGraph, type Entity } from '../src/scene.js'
import { mapSurfaceColor, SURFACE_LAYERS } from '../src/landcover.js'
import { roadDepthBias } from './ground-material.js'

export interface TileArtifact {
  version: number
  origin: { latitude: number; longitude: number; altitude: number }
  key: string
  entities: Entity[]
  geometry: Record<
    string,
    { position: ArrayBuffer; normal: ArrayBuffer; index?: ArrayBuffer; color?: ArrayBuffer }
  >
}

/** A render-only editable tile. One named mesh per source entity, coordinates in metres. */
export function tileAsset(data: TileArtifact): THREE.Group {
  if (data.version !== 5 || !data.entities || !data.origin) throw Error('Expected prepared tile v5')
  const root = new THREE.Group()
  root.name = `Nabla tile ${data.key}`
  const [x, z] = data.key.split('_').map(Number)
  if (![x, z].every(Number.isFinite)) throw Error('Invalid tile key')
  root.userData = {
    nablaTile: {
      version: 1,
      origin: data.origin,
      key: data.key,
      localOffset: [x * 1200, 0, z * 1200],
      units: 'metres',
      axes: '+Y up, -Z north',
      attribution: '© OpenStreetMap contributors; elevation: Esri',
      renderOnly: true,
    },
  }
  const graph = SceneGraph.fromValidated({ version: 1, name: root.name, entities: data.entities })
  const groups = new Map<string, THREE.Group>()
  for (const e of data.entities) {
    const buffers = data.geometry[e.id]
    if (!buffers) continue
    const category = e.terrain
      ? 'Terrain'
      : e.road || e.railway
        ? 'Roads'
        : e.landcover
          ? 'Surfaces'
          : 'Buildings'
    let group = groups.get(category)
    if (!group) {
      group = new THREE.Group()
      group.name = category
      groups.set(category, group)
      root.add(group)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(buffers.position), 3),
    )
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buffers.normal), 3))
    if (buffers.index)
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(buffers.index), 1))
    if (buffers.color)
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(buffers.color), 3))
    const material = new THREE.MeshStandardMaterial({
      color: buffers.color
        ? '#ffffff'
        : e.landcover
          ? mapSurfaceColor(e.landcover.surface, e.color)
          : e.color,
      vertexColors: !!buffers.color,
      roughness: 1,
      metalness: 0,
      side: e.road ? THREE.DoubleSide : THREE.FrontSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = e.id
    mesh.userData = {
      entityId: e.id,
      label: e.name,
      source: e.source,
      category,
      groundLayer:
        e.road || e.railway
          ? -roadDepthBias.polygonOffsetFactor
          : e.landcover
            ? SURFACE_LAYERS[e.landcover.surface]
            : 0,
    }
    const pose = graph.worldTransform(e.id)
    mesh.position.fromArray(pose.position).sub(new THREE.Vector3(x * 1200, 0, z * 1200))
    mesh.quaternion.fromArray(pose.rotation)
    group.add(mesh)
  }
  return root
}

/** glTF does not encode polygon offset; Nabla restores its rendering convention from extras. */
export function restoreTileLayers(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    const layer = Number(object.userData.groundLayer || 0)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.polygonOffset = layer > 0
      material.polygonOffsetFactor = material.polygonOffsetUnits = -layer
    }
    object.renderOrder = layer
  })
}
