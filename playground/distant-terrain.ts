import * as THREE from 'three'
import type { GeoPoint } from '../src/geography.js'
import { terrainVertices, terrainIndices, type TerrainData } from '../src/terrain.js'
import type { SceneDocument, Vec3Tuple } from '../src/scene.js'

/** Visual-only low resolution surroundings; detailed tiles own their visible/physical surface. */
export class DistantTerrain {
  readonly root = new THREE.Group()
  private readonly worker = new Worker(new URL('./world-worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly material = new THREE.MeshStandardMaterial({ color: '#7c927b', roughness: 1 })
  private readonly regions = { value: Array.from({ length: 64 }, () => new THREE.Vector4()) }
  private readonly regionCount = { value: 0 }
  private mesh: THREE.Mesh | null = null
  private center: [number, number] | null = null
  status: 'loading' | 'ready' | 'unavailable' = 'loading'
  private pendingCenter: [number, number] = [0, 0]
  private pending = false
  private nextAttempt = 0
  private id = 0
  constructor(
    private readonly origin: GeoPoint,
    private readonly changed: () => void,
  ) {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.nablaRegions = this.regions
      shader.uniforms.nablaRegionCount = this.regionCount
      shader.vertexShader =
        'varying vec2 nablaXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nnablaXZ=position.xz;',
        )
      shader.fragmentShader =
        'varying vec2 nablaXZ; uniform vec4 nablaRegions[64]; uniform int nablaRegionCount;\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
        for(int i=0;i<64;i++) {
          if(i>=nablaRegionCount)break;
          vec4 r=nablaRegions[i];
          if(nablaXZ.x>=r.x && nablaXZ.x<=r.z && nablaXZ.y>=r.y && nablaXZ.y<=r.w)discard;
        }`,
        )
    }
    this.worker.onmessage = (
      event: MessageEvent<{ id: number; terrain?: TerrainData; error?: string }>,
    ) => {
      if (event.data.id !== this.id) return
      this.pending = false
      if (!event.data.terrain) {
        this.nextAttempt = Date.now() + 60000
        this.status = 'unavailable'
        this.changed()
        return
      }
      this.center = this.pendingCenter
      const t = event.data.terrain,
        geometry = new THREE.BufferGeometry()
      const vertices = terrainVertices(t).flat()
      for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] += this.center![0]
        vertices[i + 2] += this.center![1]
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
      geometry.setIndex(terrainIndices(t))
      geometry.computeVertexNormals()
      if (this.mesh) {
        this.mesh.geometry.dispose()
        this.mesh.removeFromParent()
      }
      this.mesh = new THREE.Mesh(geometry, this.material)
      this.root.add(this.mesh)
      this.status = 'ready'
      this.changed()
    }
    this.worker.onerror = () => {
      this.pending = false
      this.nextAttempt = Date.now() + 60000
      this.status = 'unavailable'
      this.changed()
    }
  }
  setDocument(doc: SceneDocument): void {
    const terrain = doc.entities.filter((e) => e.terrain).slice(0, 64)
    this.regionCount.value = terrain.length
    terrain.forEach((e, i) => {
      const hx = ((e.terrain!.columns - 1) * e.terrain!.spacing) / 2,
        hz = ((e.terrain!.rows - 1) * e.terrain!.spacing) / 2
      this.regions.value[i].set(
        e.transform.position[0] - hx,
        e.transform.position[2] - hz,
        e.transform.position[0] + hx,
        e.transform.position[2] + hz,
      )
    })
  }
  update(position: Vec3Tuple): void {
    if (this.pending || Date.now() < this.nextAttempt || position[1] > 12000) return
    const center: [number, number] = [
      Math.round(position[0] / 2400) * 2400,
      Math.round(position[2] / 2400) * 2400,
    ]
    if (this.mesh && this.center?.[0] === center[0] && this.center[1] === center[1]) return
    this.pendingCenter = center
    this.pending = true
    this.status = 'loading'
    this.changed()
    this.worker.postMessage({ id: ++this.id, origin: this.origin, far: center })
  }
  dispose(): void {
    this.worker.terminate()
    this.mesh?.geometry.dispose()
    this.material.dispose()
    this.root.removeFromParent()
  }
}
