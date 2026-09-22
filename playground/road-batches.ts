import { withinMapDistance } from './map-visibility.js'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import type { Entity } from '../src/scene.js'

type Part = { mesh: THREE.Mesh; matrix: THREE.Matrix4 }
type Road = { entity: Entity; group: THREE.Group; parts: Map<string, Part[]> }
type Cell = {
  color: string
  roads: Map<string, Part[]>
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}
/** Render-only cells. Streaming preserves buffers outside the changed cells. */
export class RoadBatches {
  onMaterial?: (material: THREE.Material) => void
  readonly root = new THREE.Group()
  private source: Entity[] | null = null
  private readonly roads = new Map<string, Road>()
  private readonly cells = new Map<string, Cell>()
  update(
    entities: Entity[],
    objects: Map<string, THREE.Group>,
    playing: boolean,
    eye: THREE.Vector3,
    distance: number,
  ): void {
    this.root.visible = playing && distance > 0
    // Defer even the initial preparation while road detail is disabled.
    if (!this.root.visible) return
    if (entities !== this.source) {
      const dirty = new Set<string>()
      const next = new Map(entities.filter((e) => e.road && e.source).map((e) => [e.id, e]))
      for (const [id, road] of this.roads) {
        if (next.get(id) === road.entity && objects.get(id) === road.group) continue
        for (const key of road.parts.keys()) {
          this.cells.get(key)!.roads.delete(id)
          dirty.add(key)
        }
        this.roads.delete(id)
      }
      for (const [id, entity] of next) {
        if (this.roads.has(id)) continue
        const group = objects.get(id)
        if (!group) continue
        group.updateMatrix()
        const parts = new Map<string, Part[]>()
        for (const child of group.children) {
          if (!(child instanceof THREE.Mesh) || !child.geometry.getAttribute('position')?.count)
            continue
          child.updateMatrix()
          const matrix = new THREE.Matrix4().multiplyMatrices(group.matrix, child.matrix)
          if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere()
          const center = child.geometry.boundingSphere!.center.clone().applyMatrix4(matrix)
          const key = `${Math.floor(center.x / 256)}:${Math.floor(center.z / 256)}:${entity.color}`
          const list = parts.get(key) ?? []
          list.push({ mesh: child, matrix })
          parts.set(key, list)
        }
        for (const [key, list] of parts) {
          let cell = this.cells.get(key)
          if (!cell) {
            cell = { color: entity.color, roads: new Map() }
            this.cells.set(key, cell)
          }
          cell.roads.set(id, list)
          dirty.add(key)
        }
        this.roads.set(id, { entity, group, parts })
      }
      for (const key of dirty) this.rebuild(key)
      this.source = entities
    }
    for (const { mesh } of this.cells.values()) {
      if (!mesh) continue
      const bounds = mesh.geometry.boundingSphere!
      mesh.visible = withinMapDistance(bounds.center, eye, bounds.radius, distance)
    }
  }
  private rebuild(key: string): void {
    const cell = this.cells.get(key)!
    if (cell.mesh) {
      cell.mesh.removeFromParent()
      cell.mesh.geometry.dispose()
      cell.mesh.material.dispose()
    }
    if (!cell.roads.size) {
      this.cells.delete(key)
      return
    }
    const parts = [...cell.roads.values()].flat()
    const geometries = parts.map(({ mesh, matrix }) => mesh.geometry.clone().applyMatrix4(matrix))
    const geometry = mergeGeometries(geometries)!
    geometries.forEach((g) => g.dispose())
    geometry.computeBoundingSphere()
    cell.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: cell.color,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    )
    this.onMaterial?.(cell.mesh.material)
    cell.mesh.receiveShadow = true
    cell.mesh.matrixAutoUpdate = false
    this.root.add(cell.mesh)
  }
  dispose(): void {
    for (const { mesh } of this.cells.values()) {
      mesh?.geometry.dispose()
      mesh?.material.dispose()
    }
    this.cells.clear()
    this.roads.clear()
    this.source = null
    this.root.clear()
    this.root.removeFromParent()
  }
}
