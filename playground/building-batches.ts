import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { isMapBuilding, type Entity } from '../src/scene.js'
import { withinMapDistance } from './map-visibility.js'

type Building = { entity: Entity; object: THREE.Group; cell: string }
type Cell = { ids: Set<string>; mesh?: THREE.Mesh; dirty: boolean }

/** Render-only batches. Original meshes retain picking identity and collision ownership. */
export class BuildingBatches {
  readonly root = new THREE.Group()
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.72,
    side: THREE.FrontSide,
  })
  private readonly buildings = new Map<string, Building>()
  private readonly cells = new Map<string, Cell>()
  private source?: Entity[]
  private registered = false
  onMaterial?: (material: THREE.Material) => void

  get pending(): boolean {
    return this.root.visible && [...this.cells.values()].some((c) => c.dirty)
  }
  covers(id: string): boolean {
    const building = this.buildings.get(id)
    const cell = building && this.cells.get(building.cell)
    return this.root.visible && !!cell?.mesh && !cell.dirty
  }
  update(
    entities: Entity[],
    objects: Map<string, THREE.Group>,
    enabled: boolean,
    eye: THREE.Vector3,
    distance: number,
  ): void {
    this.root.visible = enabled
    if (!enabled) return
    if (!this.registered && this.onMaterial) {
      this.onMaterial(this.material)
      this.registered = true
    }
    if (this.source !== entities) {
      const next = new Map(
        entities
          .filter(
            (e) =>
              isMapBuilding(e) &&
              !!e.geometry?.faces.length &&
              !e.mapEditable &&
              e.motion === 'static',
          )
          .map((e) => [e.id, e]),
      )
      for (const [id, entry] of this.buildings) {
        if (next.get(id) === entry.entity && objects.get(id) === entry.object) continue
        const cell = this.cells.get(entry.cell)!
        cell.ids.delete(id)
        cell.dirty = true
        this.buildings.delete(id)
      }
      this.root.updateWorldMatrix(true, false)
      const inverse = this.root.matrixWorld.clone().invert()
      for (const [id, entity] of next) {
        if (this.buildings.has(id)) continue
        const object = objects.get(id)
        if (!object) continue
        object.updateWorldMatrix(true, true)
        const center = object.getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse)
        const key = `${Math.floor(center.x / 256)}:${Math.floor(center.z / 256)}`
        const cell = this.cells.get(key) ?? { ids: new Set<string>(), dirty: true }
        cell.ids.add(id)
        cell.dirty = true
        this.cells.set(key, cell)
        this.buildings.set(id, { entity, object, cell: key })
      }
      this.source = entities
    }
    // One cell per update: originals remain visible until their replacement is ready.
    const next = [...this.cells.entries()].find(([, cell]) => cell.dirty)
    if (next) this.rebuild(...next)
    for (const cell of this.cells.values()) {
      if (!cell.mesh) continue
      const sphere = cell.mesh.geometry.boundingSphere!
      cell.mesh.visible =
        !cell.dirty && withinMapDistance(sphere.center, eye, sphere.radius, distance)
    }
  }
  private rebuild(key: string, cell: Cell): void {
    cell.mesh?.removeFromParent()
    cell.mesh?.geometry.dispose()
    if (!cell.ids.size) {
      this.cells.delete(key)
      return
    }
    this.root.updateWorldMatrix(true, false)
    const inverse = this.root.matrixWorld.clone().invert()
    const parts: THREE.BufferGeometry[] = []
    for (const id of cell.ids) {
      const object = this.buildings.get(id)!.object
      object.updateWorldMatrix(true, true)
      object.traverse((child) => {
        if (
          !(child instanceof THREE.Mesh) ||
          !(child.material instanceof THREE.MeshStandardMaterial)
        )
          return
        const source = child.geometry
        const geometry = source.index ? source.toNonIndexed() : source.clone()
        for (const name of Object.keys(geometry.attributes))
          if (!['position', 'normal', 'color'].includes(name)) geometry.deleteAttribute(name)
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
        const material = child.material as THREE.MeshStandardMaterial
        const count = geometry.getAttribute('position').count
        const existing = geometry.getAttribute('color')
        const colors = new Float32Array(count * 3)
        for (let i = 0; i < count; i++) {
          colors[i * 3] = (existing ? existing.getX(i) : 1) * material.color.r
          colors[i * 3 + 1] = (existing ? existing.getY(i) : 1) * material.color.g
          colors[i * 3 + 2] = (existing ? existing.getZ(i) : 1) * material.color.b
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, child.matrixWorld))
        parts.push(geometry)
      })
    }
    const geometry = mergeGeometries(parts)!
    parts.forEach((part) => part.dispose())
    geometry.computeBoundingSphere()
    cell.mesh = new THREE.Mesh(geometry, this.material)
    cell.mesh.castShadow = cell.mesh.receiveShadow = true
    cell.mesh.matrixAutoUpdate = false
    this.root.add(cell.mesh)
    cell.dirty = false
  }
  dispose(): void {
    for (const cell of this.cells.values()) cell.mesh?.geometry.dispose()
    this.material.dispose()
    this.root.clear()
    this.root.removeFromParent()
    this.buildings.clear()
    this.cells.clear()
  }
}
