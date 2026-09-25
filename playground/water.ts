import * as THREE from 'three'
import {
  geoToLocal,
  localFrame,
  localToGeo,
  tileCoordinate,
  type GeoPoint,
} from '../src/math/geo/sphere.js'
import { planetTileFrame } from '../src/planet/tiles.js'
import type { MapTile } from '../src/scene/mercator.js'
/** Coastline tiles render independently of building/road arrivals. */
export class SeaWater {
  readonly root = new THREE.Group()
  private readonly worker = new Worker(new URL('./water-worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly coast = new Map<string, THREE.Mesh>()
  private readonly cells = new Map<string, Uint8Array>()
  private readonly ready = new Set<string>()
  private readonly failed = new Map<string, number>()
  private readonly plane = new THREE.PlaneGeometry(1, 1)
  private readonly sea: THREE.InstancedMesh
  private ocean: MapTile[] = []
  private oceanStamp = ''
  private wanted: string[] = []
  private busy = false
  private next = 0
  private disposed = false
  private readonly solarDirection = { value: new THREE.Vector3(0, 1, 0) }
  private readonly solarStrength = { value: 0 }
  private readonly time = { value: 0 }
  private readonly texture = new THREE.TextureLoader().load('/geography/water-normal.png')
  private readonly material = new THREE.MeshStandardMaterial({
    color: '#102f43',
    roughness: 0.3,
    metalness: 0.03,
    envMapIntensity: 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
  constructor(private readonly origin: GeoPoint) {
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    // Adapted from Streets GL (StrandedKitty, MIT): three drifting normal samples.
    // License: assets/licenses/streets-gl-MIT.txt. No reflection camera or wave physics.
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.waterSunDirection = this.solarDirection
      shader.uniforms.waterSunStrength = this.solarStrength
      shader.uniforms.waterTime = this.time
      shader.uniforms.waterNormal = { value: this.texture }
      shader.vertexShader =
        'varying vec2 waterXZ;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nwaterXZ = transformed.xz;',
        )
      shader.fragmentShader =
        'varying vec2 waterXZ; uniform float waterTime; uniform sampler2D waterNormal; uniform vec3 waterSunDirection; uniform float waterSunStrength;\n' +
        shader.fragmentShader
          .replace(
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
          .replace(
            '#include <opaque_fragment>',
            `
        vec3 reflectedEye = reflect(-normalize(vViewPosition), normal);
        vec3 solarView = normalize(mat3(viewMatrix) * waterSunDirection);
        float alignment = max(0.0, dot(reflectedEye, solarView));
        float glint = pow(alignment, 350.0) * 8.0 + pow(alignment, 35.0) * 0.12;
        // This material does not use the cascade shader: suppress its repeated
        // directional specular lobes and keep one astronomical solar reflection.
        outgoingLight = diffuseColor.rgb * waterSunStrength * 0.8 + vec3(glint * waterSunStrength);
        #include <opaque_fragment>`,
          )
    }
    this.plane.rotateX(-Math.PI / 2)
    this.sea = new THREE.InstancedMesh(this.plane, this.material, 441)
    this.sea.count = 0
    this.sea.frustumCulled = false
    this.sea.name = 'Sea'
    this.root.add(this.sea)
    this.worker.onmessage = (
      event: MessageEvent<{
        key: string
        positions?: Float32Array
        cells?: Uint8Array
        error?: string
      }>,
    ) => {
      this.busy = false
      const { key, positions, cells } = event.data
      if (positions && cells && this.wanted.includes(key)) {
        this.ready.add(key)
        this.cells.set(key, cells)
        this.oceanStamp = ''
        if (cells.every((cell) => cell === 0xff)) this.layoutSea()
        else if (positions.length) this.addCoast(key, positions)
      } else if (event.data.error) this.failed.set(key, performance.now() + 60000)
    }
    this.worker.onerror = () => {
      this.busy = false
      for (const key of this.wanted) this.failed.set(key, performance.now() + 60000)
    }
  }
  setSun(direction: THREE.Vector3, daylight: number): void {
    this.solarDirection.value.copy(direction).normalize()
    this.solarStrength.value = direction.y > 0 ? daylight : 0
  }
  get tiles(): number {
    return this.ready.size
  }
  /** Same surface as the loaded sea, including the shared solar shader. */
  surface(): THREE.MeshStandardMaterial {
    const material = this.material.clone()
    material.onBeforeCompile = this.material.onBeforeCompile
    return material
  }
  /** z15 cells known to be ocean. The horizon drops these so the relief never covers the sea. */
  oceanBlocks(): MapTile[] {
    const stamp = [...this.cells.keys()].sort().join('|')
    if (stamp === this.oceanStamp) return this.ocean
    this.oceanStamp = stamp
    const blocks: MapTile[] = []
    for (const [key, mask] of this.cells) {
      const [, x, y] = key.split('/').map(Number)
      for (let bit = 0; bit < 64; bit++)
        if (mask[bit >> 3] & (1 << (bit & 7)))
          blocks.push({ z: 15, x: x * 8 + (bit & 7), y: y * 8 + (bit >> 3) })
    }
    this.ocean = blocks
    return blocks
  }
  update(
    position: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    distance: number,
    now: number,
    relief = 2,
  ): void {
    if (this.disposed) return
    this.root.position.copy(renderOrigin).negate()
    this.root.visible = true
    this.time.value = now / 1000
    if (now < this.next) return
    this.next = now + 500
    const point = localToGeo(this.origin, position.toArray())
    const center = tileCoordinate(point.latitude, point.longitude, 12)
    const tileMeters = (40075016 * Math.cos((point.latitude * Math.PI) / 180)) / 4096
    const byView = Math.ceil(Math.max(distance, position.y) / tileMeters)
    const radius = Math.min(10, Math.max(1, byView, Math.ceil(relief / 2) + 1))
    this.wanted = []
    for (let dx = -radius; dx <= radius; dx++)
      for (let dy = -radius; dy <= radius; dy++) {
        const y = Math.floor(center.y) + dy
        if (y >= 0 && y < 4096)
          this.wanted.push(`12/${(((Math.floor(center.x) + dx) % 4096) + 4096) % 4096}/${y}`)
      }
    this.wanted.sort((a, b) => {
      const [, ax, ay] = a.split('/').map(Number),
        [, bx, by] = b.split('/').map(Number)
      return (
        Math.hypot(ax + 0.5 - center.x, ay + 0.5 - center.y) -
        Math.hypot(bx + 0.5 - center.x, by + 0.5 - center.y)
      )
    })
    let dropped = false
    for (const key of [...this.ready])
      if (!this.wanted.includes(key)) {
        this.ready.delete(key)
        this.cells.delete(key)
        this.oceanStamp = ''
        const mesh = this.coast.get(key)
        if (mesh) {
          mesh.geometry.dispose()
          ;(mesh.material as THREE.Material).dispose()
          mesh.removeFromParent()
          this.coast.delete(key)
        } else dropped = true
      }
    if (dropped) this.layoutSea()
    for (const key of this.failed.keys()) if (!this.wanted.includes(key)) this.failed.delete(key)
    if (this.busy) return
    const key = this.wanted.find(
      (key) => !this.ready.has(key) && now >= (this.failed.get(key) ?? 0),
    )
    if (key) {
      this.busy = true
      this.worker.postMessage({ key, origin: this.origin })
    }
  }
  private addCoast(key: string, positions: Float32Array): void {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const normals = new Float32Array(positions.length)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    const material = this.material.clone()
    material.onBeforeCompile = this.material.onBeforeCompile
    const mesh = new THREE.Mesh(geometry, material)
    mesh.matrixAutoUpdate = false
    mesh.name = 'Coast'
    this.coast.set(key, mesh)
    this.root.add(mesh)
  }
  /** One plane, instanced on every z12 tile that is entirely ocean. */
  private layoutSea(): void {
    const keys = [...this.cells.keys()].filter((key) =>
      this.cells.get(key)!.every((cell) => cell === 0xff),
    )
    this.sea.count = keys.length
    const matrix = new THREE.Matrix4()
    keys.forEach((key, index) => {
      const [, x, y] = key.split('/').map(Number)
      const frame = planetTileFrame({ z: 12, x, y })
      const rotation = localFrame(this.origin).invert().multiply(localFrame(frame.anchor))
      const lift = new THREE.Vector3(0, 0.08, 0).applyQuaternion(rotation)
      matrix.compose(
        new THREE.Vector3(...geoToLocal(this.origin, frame.anchor)).add(lift),
        rotation,
        new THREE.Vector3(frame.width, 1, frame.width),
      )
      this.sea.setMatrixAt(index, matrix)
    })
    this.sea.instanceMatrix.needsUpdate = true
  }
  dispose(): void {
    this.disposed = true
    this.worker.terminate()
    for (const mesh of this.coast.values()) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
    this.plane.dispose()
    this.material.dispose()
    this.texture.dispose()
    this.root.removeFromParent()
  }
}
