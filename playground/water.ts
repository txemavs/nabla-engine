import * as THREE from 'three'
import { localToGeo, tileCoordinate, type GeoPoint } from '../src/geography.js'
/** Coastline tiles render independently of building/road arrivals. */
export class SeaWater {
  readonly root = new THREE.Group()
  private readonly worker = new Worker(new URL('./water-worker.ts', import.meta.url), {
    type: 'module',
  })
  private readonly meshes = new Map<string, THREE.Mesh>()
  private readonly failed = new Map<string, number>()
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
          '#include <begin_vertex>\nwaterXZ = position.xz;',
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
    this.worker.onmessage = (
      event: MessageEvent<{ key: string; positions?: Float32Array; error?: string }>,
    ) => {
      this.busy = false
      const { key, positions } = event.data
      if (positions && this.wanted.includes(key)) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        const normals = new Float32Array(positions.length)
        for (let i = 1; i < normals.length; i += 3) normals[i] = 1
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
        const mesh = new THREE.Mesh(geometry, this.material)
        mesh.matrixAutoUpdate = false
        this.meshes.set(key, mesh)
        this.root.add(mesh)
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
    return this.meshes.size
  }
  update(
    position: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    distance: number,
    now: number,
  ): void {
    if (this.disposed) return
    this.root.position.copy(renderOrigin).negate()
    this.root.visible = position.y < 12000
    if (!this.root.visible) return
    this.time.value = now / 1000
    if (now < this.next) return
    this.next = now + 500
    const point = localToGeo(this.origin, position.toArray())
    const center = tileCoordinate(point.latitude, point.longitude, 12)
    const tileMeters = (40075016 * Math.cos((point.latitude * Math.PI) / 180)) / 4096
    const radius = Math.min(3, Math.max(1, Math.ceil(distance / tileMeters)))
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
    for (const [key, mesh] of this.meshes)
      if (!this.wanted.includes(key)) {
        mesh.geometry.dispose()
        mesh.removeFromParent()
        this.meshes.delete(key)
      }
    for (const key of this.failed.keys()) if (!this.wanted.includes(key)) this.failed.delete(key)
    if (this.busy) return
    const key = this.wanted.find(
      (key) => !this.meshes.has(key) && now >= (this.failed.get(key) ?? 0),
    )
    if (key) {
      this.busy = true
      this.worker.postMessage({ key, origin: this.origin })
    }
  }
  dispose(): void {
    this.disposed = true
    this.worker.terminate()
    for (const mesh of this.meshes.values()) mesh.geometry.dispose()
    this.material.dispose()
    this.texture.dispose()
    this.root.removeFromParent()
  }
}
