import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import {
  analyticParticles,
  EPOCH_MS,
  NEVER,
  PARTICLE_MOTION_GLSL,
  SPARK_DROP,
} from './gpu-particles.js'
import { LegacyShotSparks } from './legacy-particles.js'

const LIFE_MS = 160
const MAX_BURSTS = 32
const PER_BURST = 10

/** Optional shaping of one burst (e.g. a footpeg scrape): spark count, carried velocity, spread. */
export interface SparkBurstOptions {
  /** Sparks in the burst, 1…`PER_BURST` (default all). */
  count?: number
  /** World velocity every spark carries, m/s (e.g. part of the vehicle's, so they trail). */
  drift?: Vec3Tuple
  /** Scales the random spark speed (default 1). */
  speed?: number
}

/**
 * Analytic GPU sparks: each burst writes its origin, velocities and birth once into a ring of
 * `MAX_BURSTS` × `PER_BURST` slots; the vertex shader evaluates the ballistic path. All sparks
 * share one colour and opacity, so their draw order does not change the blend.
 */
class AnalyticShotSparks {
  enabled = true
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
  private readonly now = { value: 0 }
  private readonly material = new THREE.PointsMaterial({
    color: '#ffe7ac',
    size: 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly points: THREE.Points
  private readonly origins = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly velocities = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  /** Birth in ms relative to {@link epoch}; unused slots never live. */
  private readonly relativeBirths = new Float32Array(MAX_BURSTS * PER_BURST).fill(NEVER)
  private readonly births = new Float64Array(MAX_BURSTS).fill(-Infinity)
  private epoch = 0
  private next = 0
  private disposed = false

  constructor() {
    this.root.name = 'Shot sparks'
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.origins, 3))
    this.geometry.setAttribute('sparkVelocity', new THREE.BufferAttribute(this.velocities, 3))
    this.geometry.setAttribute('sparkBirth', new THREE.BufferAttribute(this.relativeBirths, 1))
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity)
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.sparkNow = this.now
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          ${PARTICLE_MOTION_GLSL}
          attribute vec3 sparkVelocity; attribute float sparkBirth; uniform float sparkNow;`,
        )
        .replace(
          '#include <begin_vertex>',
          `float sparkAge=(sparkNow-sparkBirth)/1000.0;
          vec3 transformed=nablaSparkPosition(position,sparkVelocity,sparkAge);`,
        )
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          if(sparkNow-sparkBirth>${LIFE_MS.toFixed(1)}) gl_Position=vec4(2.0,2.0,2.0,1.0);`,
        )
    }
    this.material.customProgramCacheKey = () => 'nabla-analytic-shot-sparks'
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    this.points.visible = false
    this.root.add(this.points)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple, options: SparkBurstOptions = {}): void {
    if (!this.enabled) return
    if (this.disposed || !Number.isFinite(now)) return
    const n = normal ? new THREE.Vector3(...normal).normalize() : new THREE.Vector3(0, 1, 0)
    const tangent = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
    tangent.crossVectors(bitangent, n).normalize()
    const count = Math.max(1, Math.min(PER_BURST, Math.round(options.count ?? PER_BURST)))
    const drift = options.drift ? new THREE.Vector3(...options.drift) : null
    // Overwriting the oldest slot is what the former `bursts.shift()` at capacity did.
    const burst = this.next++ % MAX_BURSTS
    if (now - this.epoch > EPOCH_MS || !this.live(now)) this.rebase(now)
    this.births[burst] = now
    const velocity = new THREE.Vector3()
    for (let i = 0; i < PER_BURST; i++) {
      const s = burst * PER_BURST + i
      if (i >= count) {
        this.relativeBirths[s] = NEVER
        continue
      }
      const u = Math.random() * 2 - 1
      const v = Math.random() * 2 - 1
      const speed = (1.2 + Math.random() * 2.4) * (options.speed ?? 1)
      velocity
        .copy(n)
        .multiplyScalar(0.55 + Math.random() * 0.9)
        .addScaledVector(tangent, u)
        .addScaledVector(bitangent, v)
        .normalize()
        .multiplyScalar(speed)
        .add(drift ?? new THREE.Vector3())
      velocity.toArray(this.velocities, s * 3)
      this.origins.set(origin, s * 3)
      this.relativeBirths[s] = now - this.epoch
    }
    const start = burst * PER_BURST
    for (const [name, size] of [
      ['position', 3],
      ['sparkVelocity', 3],
      ['sparkBirth', 1],
    ] as const) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute
      attribute.addUpdateRange(start * size, PER_BURST * size)
      attribute.needsUpdate = true
    }
  }

  update(now: number): void {
    if (!this.enabled) {
      this.clear()
      return
    }
    if (this.disposed) return
    let newest = -Infinity
    for (const birth of this.births) if (now - birth <= LIFE_MS) newest = Math.max(newest, birth)
    this.now.value = now - this.epoch
    this.points.visible = newest > -Infinity
    this.material.opacity = this.points.visible ? Math.max(0, 1 - (now - newest) / LIFE_MS) : 0
  }

  clear(): void {
    this.births.fill(-Infinity)
    this.points.visible = false
    this.material.opacity = 1
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }

  /** Positions of the live sparks at `now`, oldest burst first (the shader's maths). */
  livePositions(now: number): Float32Array {
    const out: number[] = []
    const order = [...this.births.keys()]
      .filter((b) => now - this.births[b] <= LIFE_MS)
      .sort((a, b) => this.births[a] - this.births[b])
    for (const b of order)
      for (let s = b * PER_BURST; s < (b + 1) * PER_BURST; s++) {
        if (this.relativeBirths[s] === NEVER) continue
        const age = (now - this.births[b]) / 1000
        out.push(
          this.origins[s * 3] + this.velocities[s * 3] * age,
          this.origins[s * 3 + 1] + this.velocities[s * 3 + 1] * age - SPARK_DROP * age * age,
          this.origins[s * 3 + 2] + this.velocities[s * 3 + 2] * age,
        )
      }
    return Float32Array.from(out)
  }

  private live(now: number): boolean {
    return this.births.some((birth) => now - birth <= LIFE_MS)
  }

  /** Start a new float epoch at `now`: rewrite every slot's birth against it (rare, 1.3 KB). */
  private rebase(now: number): void {
    const previous = this.epoch
    this.epoch = now
    for (let s = 0; s < this.relativeBirths.length; s++)
      if (this.relativeBirths[s] !== NEVER) this.relativeBirths[s] += previous - now
    const attribute = this.geometry.getAttribute('sparkBirth') as THREE.BufferAttribute
    attribute.clearUpdateRanges()
    attribute.needsUpdate = true
  }
}

/**
 * Brief pin-spark bursts at bullet impact points (also footpeg scrapes, via `options`). Under
 * WebGL the paths are analytic on the GPU (gpu-particles.ts); under WebGPU the former CPU update
 * runs (legacy-particles.ts), because `onBeforeCompile` does not apply there.
 */
export class ShotSparks {
  private readonly impl = analyticParticles() ? new AnalyticShotSparks() : new LegacyShotSparks()
  readonly root: THREE.Group = this.impl.root
  get enabled(): boolean {
    return this.impl.enabled
  }
  set enabled(enabled: boolean) {
    this.impl.enabled = enabled
  }
  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple, options: SparkBurstOptions = {}): void {
    this.impl.add(origin, now, normal, options)
  }
  update(now: number): void {
    this.impl.update(now)
  }
  /** Positions of the live sparks at `now` (after `update(now)`). */
  livePositions(now: number): Float32Array {
    if (this.impl instanceof AnalyticShotSparks) return this.impl.livePositions(now)
    const points = this.root.children[0] as THREE.Points
    const array = points.geometry.getAttribute('position').array as Float32Array
    return array.slice(0, points.geometry.drawRange.count * 3)
  }
  clear(): void {
    this.impl.clear()
  }
  dispose(): void {
    this.impl.dispose()
  }
}
