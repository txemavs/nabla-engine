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
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#304d25',
    roughness: 1,
  })
  private readonly maskData = new Uint8Array(64 * 64)
  private readonly mask = new THREE.DataTexture(this.maskData, 64, 64, THREE.RedFormat)
  private readonly maskOrigin = { value: new THREE.Vector2(-32, -32) }
  private document?: SceneDocument
  private mesh: THREE.Mesh | null = null
  private center: [number, number] | null = null
  status: 'loading' | 'ready' | 'unavailable' = 'loading'
  private pendingCenter: [number, number] = [0, 0]
  private spacing = 100
  private requestedSpacing = 100
  private pending = false
  private nextAttempt = 0
  private id = 0
  constructor(
    private readonly origin: GeoPoint,
    private readonly changed: () => void,
  ) {
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.nablaMask = { value: this.mask }
      shader.uniforms.nablaMaskOrigin = this.maskOrigin
      shader.vertexShader =
        'varying vec2 nablaXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nnablaXZ=position.xz;',
        )
      shader.fragmentShader =
        'varying vec2 nablaXZ; uniform sampler2D nablaMask; uniform vec2 nablaMaskOrigin;\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
        vec2 cell = floor((nablaXZ + 600.0) / 1200.0) - nablaMaskOrigin;
        if(all(greaterThanEqual(cell, vec2(0.0))) && all(lessThan(cell, vec2(64.0)))) {
          if(texture2D(nablaMask, (cell + 0.5) / 64.0).r > 0.5) discard;
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
      this.spacing = this.requestedSpacing
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
    this.document = doc
    this.refreshMask()
  }
  private refreshMask(): void {
    this.maskData.fill(0)
    for (const e of this.document?.entities ?? []) {
      if (!e.terrain || !e.id.startsWith('world-terrain')) continue
      const x = Math.round(e.transform.position[0] / 1200) - this.maskOrigin.value.x
      const z = Math.round(e.transform.position[2] / 1200) - this.maskOrigin.value.y
      if (x >= 0 && x < 64 && z >= 0 && z < 64) this.maskData[z * 64 + x] = 255
    }
    this.mask.needsUpdate = true
  }
  update(position: Vec3Tuple, distance = 4000): void {
    const mx = Math.floor((position[0] + 600) / 1200) - 32
    const mz = Math.floor((position[2] + 600) / 1200) - 32
    if (this.maskOrigin.value.x !== mx || this.maskOrigin.value.y !== mz) {
      this.maskOrigin.value.set(mx, mz)
      this.refreshMask()
    }
    const spacing = Math.max(50, Math.ceil((distance + 2400) / 60 / 50) * 50)
    if (this.pending || Date.now() < this.nextAttempt || position[1] > 12000) return
    const center: [number, number] = [
      Math.round(position[0] / 2400) * 2400,
      Math.round(position[2] / 2400) * 2400,
    ]
    if (
      this.mesh &&
      this.spacing === spacing &&
      this.center?.[0] === center[0] &&
      this.center[1] === center[1]
    )
      return
    this.requestedSpacing = spacing
    this.pendingCenter = center
    this.pending = true
    this.status = 'loading'
    this.changed()
    this.worker.postMessage({ id: ++this.id, origin: this.origin, far: center, spacing })
  }
  dispose(): void {
    this.worker.terminate()
    this.mesh?.geometry.dispose()
    this.mask.dispose()
    this.material.dispose()
    this.root.removeFromParent()
  }
}
