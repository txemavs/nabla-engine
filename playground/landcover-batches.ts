import * as THREE from 'three'
import type { Entity } from '../src/scene.js'
import type { SurfaceType } from '../src/landcover.js'
import { SURFACE_COLORS, SURFACE_LAYERS } from '../src/landcover.js'
import { withinMapDistance } from './map-visibility.js'

type LandcoverCell = {
  surfaceType: SurfaceType
  entities: Map<string, Float32Array>
  mesh?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

/**
 * Batches landcover surfaces by 256m cell and surface type.
 * Similar to RoadBatches but for landcover polygons.
 * Water surfaces use a separate animated material.
 */
export class LandcoverBatches {
  onMaterial?: (material: THREE.Material) => void
  private source?: Entity[]
  private readonly references = new Map<string, { entity: Entity; group: THREE.Group }>()
  readonly root = new THREE.Group()
  private readonly cells = new Map<string, LandcoverCell>()
  private readonly entities = new Map<string, string>()
  private readonly waterMaterial: THREE.MeshStandardMaterial
  private readonly landMaterials = new Map<SurfaceType, THREE.MeshStandardMaterial>()
  private readonly time = { value: 0 }
  private readonly waterTexture: THREE.Texture

  constructor() {
    this.waterTexture = new THREE.TextureLoader().load('/geography/water-normal.png')
    this.waterTexture.wrapS = this.waterTexture.wrapT = THREE.RepeatWrapping

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: SURFACE_COLORS.water,
      roughness: 0.3,
      metalness: 0.15,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -0.5,
      polygonOffsetUnits: -0.5,
    })

    this.waterMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.waterTime = this.time
      shader.uniforms.waterNormal = { value: this.waterTexture }
      shader.vertexShader =
        'varying vec2 waterXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nwaterXZ = position.xz;',
        )
      shader.fragmentShader =
        'varying vec2 waterXZ; uniform float waterTime; uniform sampler2D waterNormal;\n' +
        shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          vec2 waveUV = waterXZ / 256.0;
          float waveTime = waterTime / 256.0;
          vec3 waves = (texture2D(waterNormal, (waveUV+waveTime)*3.0).xyz * 0.25
            + texture2D(waterNormal, (waveUV+waveTime)*16.0).xyz * 0.25
            + texture2D(waterNormal, (waveUV-waveTime)*8.0).xyz * 0.5) * 2.0 - 1.0;
          waves = normalize(mix(waves, vec3(0.0,0.0,1.0),0.9).xzy);
          normal = normalize(mat3(viewMatrix) * waves);`,
        )
    }
  }

  private getMaterial(surfaceType: SurfaceType): THREE.MeshStandardMaterial {
    if (surfaceType === 'water') return this.waterMaterial

    let material = this.landMaterials.get(surfaceType)
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: SURFACE_COLORS[surfaceType],
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -0.5,
      })
      this.landMaterials.set(surfaceType, material)
    }
    return material
  }

  private cellKey(x: number, z: number, surfaceType: SurfaceType): string {
    return `${Math.floor(x / 256)}_${Math.floor(z / 256)}_${surfaceType}`
  }

  update(
    entities: Entity[],
    objects: Map<string, THREE.Group>,
    enabled: boolean,
    position: THREE.Vector3,
    distance: number,
    now: number,
  ): void {
    this.time.value = now / 1000

    this.root.visible = enabled && distance > 0
    if (!this.root.visible) return
    if (this.source !== entities) {
      const dirty = new Set<string>()
      const current = new Map(
        entities.filter((e) => e.landcover && e.geometry).map((e) => [e.id, e]),
      )
      for (const [id, key] of this.entities) {
        const ref = this.references.get(id)!
        if (current.get(id) === ref.entity && objects.get(id) === ref.group) continue
        this.cells.get(key)?.entities.delete(id)
        dirty.add(key)
        this.entities.delete(id)
        this.references.delete(id)
      }
      this.root.updateWorldMatrix(true, false)
      const inverse = this.root.matrixWorld.clone().invert()
      for (const [id, entity] of current) {
        if (this.entities.has(id)) continue
        const group = objects.get(id)
        if (!group || group.userData.mapPending) continue
        group.updateWorldMatrix(true, true)
        // Reuse worker-prepared geometry and include all parent transforms.
        const vertices: number[] = []
        group.traverse((mesh) => {
          if (!(mesh instanceof THREE.Mesh)) return
          const attr = mesh.geometry.getAttribute('position')
          if (!attr) return
          const matrix = inverse.clone().multiply(mesh.matrixWorld)
          const index = mesh.geometry.index
          const p = new THREE.Vector3()
          for (let i = 0; i < (index?.count ?? attr.count); i++) {
            p.fromBufferAttribute(attr, index ? index.getX(i) : i).applyMatrix4(matrix)
            vertices.push(p.x, p.y, p.z)
          }
        })
        if (!vertices.length) continue
        const bounds = new THREE.Box3().setFromArray(vertices)
        const center = bounds.getCenter(new THREE.Vector3())
        const surfaceType = entity.landcover!.surface
        const key = this.cellKey(center.x, center.z, surfaceType)
        let cell = this.cells.get(key)
        if (!cell) {
          cell = { surfaceType, entities: new Map() }
          this.cells.set(key, cell)
        }
        cell.entities.set(id, new Float32Array(vertices))
        this.entities.set(id, key)
        this.references.set(id, { entity, group })
        dirty.add(key)
      }
      // A cell is uploaded once per scene revision, never once per polygon/frame.
      for (const key of dirty) this.rebuildCell(key)
      this.source = entities
    }
    for (const cell of this.cells.values()) {
      if (!cell.mesh) continue
      const bounds = cell.mesh.geometry.boundingSphere!
      cell.mesh.visible = withinMapDistance(bounds.center, position, bounds.radius, distance)
    }
  }

  private rebuildCell(key: string): void {
    const cell = this.cells.get(key)
    if (!cell) return

    if (cell.mesh) {
      cell.mesh.removeFromParent()
      cell.mesh.geometry.dispose()
    }

    if (!cell.entities.size) {
      this.cells.delete(key)
      return
    }

    const allVertices: number[] = []
    for (const vertices of cell.entities.values()) {
      for (const v of vertices) allVertices.push(v)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(allVertices, 3))
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    cell.mesh = new THREE.Mesh(geometry, this.getMaterial(cell.surfaceType))
    this.onMaterial?.(cell.mesh.material)
    const layer = SURFACE_LAYERS[cell.surfaceType]
    cell.mesh.renderOrder = layer
    cell.mesh.material.polygonOffsetFactor = -layer
    cell.mesh.material.polygonOffsetUnits = -layer
    cell.mesh.castShadow = false
    cell.mesh.receiveShadow = true
    this.root.add(cell.mesh)
  }

  dispose(): void {
    for (const { mesh } of this.cells.values()) {
      mesh?.geometry.dispose()
    }
    this.cells.clear()
    this.entities.clear()
    this.references.clear()
    this.source = undefined
    this.root.clear()
    this.root.removeFromParent()
    this.waterMaterial.dispose()
    this.waterTexture.dispose()
    for (const material of this.landMaterials.values()) material.dispose()
    this.landMaterials.clear()
  }
}
