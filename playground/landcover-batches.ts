import * as THREE from 'three'
import type { Entity } from '../src/scene.js'
import type { SurfaceType } from '../src/landcover.js'
import { SURFACE_COLORS } from '../src/landcover.js'
import { triangles } from '../src/solid.js'

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

    const current = new Map<string, Entity>()
    for (const e of entities) {
      if (!e.landcover || !e.geometry) continue
      current.set(e.id, e)
    }

    // Remove deleted entities
    for (const [id, cellKey] of this.entities) {
      if (!current.has(id)) {
        const cell = this.cells.get(cellKey)
        if (cell) {
          cell.entities.delete(id)
          this.rebuildCell(cellKey)
        }
        this.entities.delete(id)
      }
    }

    // Add/update entities
    for (const [id, entity] of current) {
      const surfaceType = entity.landcover!.surface
      const pos = entity.transform.position
      const newKey = this.cellKey(pos[0], pos[2], surfaceType)
      const oldKey = this.entities.get(id)

      if (oldKey !== newKey) {
        if (oldKey) {
          const oldCell = this.cells.get(oldKey)
          if (oldCell) {
            oldCell.entities.delete(id)
            this.rebuildCell(oldKey)
          }
        }

        let cell = this.cells.get(newKey)
        if (!cell) {
          cell = { surfaceType, entities: new Map() }
          this.cells.set(newKey, cell)
        }

        const vertices = triangles(entity.geometry!).flatMap((face) =>
          face.flatMap((i) => {
            const v = entity.geometry!.vertices[i]
            return [v[0] + pos[0], v[1], v[2] + pos[2]]
          }),
        )
        cell.entities.set(id, new Float32Array(vertices))
        this.entities.set(id, newKey)
        this.rebuildCell(newKey)
      }

      // Hide individual entity meshes when batched
      const obj = objects.get(id)
      if (obj) obj.visible = !enabled
    }

    // Visibility based on distance
    for (const [key, cell] of this.cells) {
      if (!cell.mesh) continue
      const [cx, cz] = key.split('_').map(Number)
      const centerX = cx * 256 + 128
      const centerZ = cz * 256 + 128
      const dist = Math.hypot(position.x - centerX, position.z - centerZ)
      cell.mesh.visible = enabled && dist <= distance + 256
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
    this.waterMaterial.dispose()
    this.waterTexture.dispose()
    for (const material of this.landMaterials.values()) material.dispose()
    this.landMaterials.clear()
  }
}
