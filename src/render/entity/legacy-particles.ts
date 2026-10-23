import * as THREE from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
import { setWebGPUSubstitute } from '../webgpu-substitutes.js'
import { laserSmokePools } from './laser-smoke.js'
import { exhaustSmokeSprites, muzzleSmokeSprites, tireSmokeSprites } from './particle-nodes.js'
import { smokeDensity, smokeDensityFor } from './smoke-density.js'
import {
  SOFT_FRAGMENT_PARS,
  SOFT_VERTEX_PARS,
  softSmokeUniforms,
  softVertex,
} from './soft-smoke.js'
import type { ExhaustSmokeOptions } from './exhaust-smoke.js'
import type { SparkBurstOptions } from './shot-sparks.js'

/**
 * The per-frame CPU particle simulations as they were before the analytic GPU pools
 * (gpu-particles.ts). The WebGPU backend keeps using them: its TSL sprite substitutes
 * (particle-nodes.ts) read the CPU-integrated attributes. Behaviour is unchanged; do not edit
 * these without changing the analytic versions the same way.
 */

const LIFE_MS = 160
const MAX_BURSTS = 32
const PER_BURST = 10

type Burst = {
  birth: number
  origin: THREE.Vector3
  velocities: THREE.Vector3[]
}

export class LegacyExhaustSmoke {
  private smokePool?: Parameters<typeof laserSmokePools.add>[0]
  private readonly positions: Float32Array
  private readonly velocities: Float32Array
  private readonly life: Float32Array
  private readonly tints: Float32Array
  /** Spawn point of each puff: seeds its atlas tile and spin as the analytic `position` does. */
  private readonly origins: Float32Array
  private readonly geometry = new THREE.BufferGeometry()
  private readonly source = new THREE.Vector3()
  private readonly previous = new THREE.Vector3()
  private readonly direction = new THREE.Vector3()
  private readonly movement = new THREE.Vector3()
  private ready = false
  private carry = 0
  private next = 0
  private enabled = true
  private amount = 1
  private readonly color: THREE.Color
  private readonly clearColor: THREE.Color
  readonly root: THREE.Points

  constructor(
    private readonly outlet: THREE.Object3D,
    private readonly space: THREE.Object3D,
    private readonly options: ExhaustSmokeOptions = {},
  ) {
    const capacity = options.capacity ?? 48
    this.positions = new Float32Array(capacity * 3)
    this.velocities = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.tints = new Float32Array(capacity * 3)
    this.origins = new Float32Array(capacity * 3)
    this.carry = -THREE.MathUtils.clamp(options.emissionPhase ?? 0, 0, 1)
    this.color = new THREE.Color(options.color ?? '#fafbfc')
    this.clearColor = new THREE.Color(options.clearColor ?? options.color ?? '#fafbfc')
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.life, 1))
    this.geometry.setAttribute('tint', new THREE.BufferAttribute(this.tints, 3))
    this.geometry.setAttribute('origin', new THREE.BufferAttribute(this.origins, 3))
    this.root = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          smokeDensity: smokeDensityFor(space),
          lifetime: { value: options.lifetime ?? 1.4 },
          size: { value: options.size ?? 550 },
          ...softSmokeUniforms(),
        },
        // Same procedural puff as the analytic ExhaustSmoke (2679074b), seeded by the spawn point.
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float life; attribute vec3 tint; attribute vec3 origin; varying vec3 smokeTint; varying float age; varying float smokeSeed; uniform float size; uniform float lifetime;
        ${SOFT_VERTEX_PARS}
        void main(){age=life; smokeTint=tint; vec4 p=modelViewMatrix*vec4(position,1.0);
          smokeSeed=fract(sin(dot(origin,vec3(12.9898,78.233,37.719)))*43758.5453);
          gl_Position=projectionMatrix*p;
          ${softVertex('p')}
          gl_PointSize=life>0.0?clamp((1.0-life/lifetime)*1.4*size/max(1.0,-p.z),1.0,240.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        uniform float smokeDensity; uniform float lifetime;
        #include <logdepthbuf_pars_fragment>
        varying float age; varying vec3 smokeTint; varying float smokeSeed;
        ${SOFT_FRAGMENT_PARS}
        void main(){
          #include <logdepthbuf_fragment>
          if(age<=0.0)discard;
          float k=1.0-age/lifetime;
          vec4 c=nablaSmoke(smokeTint,(age/lifetime)*0.4*smokeDensity,k,smokeSeed,k*(smokeSeed-0.5)*1.5,0.35);
          if(c.a<0.002)discard;
          gl_FragColor=c;
        }`,
      }),
    )
    this.smokePool = {
      root: this.root,
      positions: this.positions,
      life: this.life,
      lifetime: options.lifetime ?? 1.4,
      size: options.size ?? 550,
    }
    laserSmokePools.add(this.smokePool)
    this.root.name = 'Engine exhaust smoke'
    setWebGPUSubstitute(this.root, exhaustSmokeSprites(this.root))
    this.root.frustumCulled = false
    this.root.visible = false
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.life.fill(0)
      this.carry = -THREE.MathUtils.clamp(this.options.emissionPhase ?? 0, 0, 1)
      this.root.visible = false
    }
  }

  /** Scale particle emission without changing the size or lifetime of each puff. */
  setAmount(amount: number): void {
    this.amount = THREE.MathUtils.clamp(amount, 0, 2)
  }

  update(dt: number, running: boolean, load: number, speedKmh = 0): void {
    if (!this.enabled) return
    dt = Math.min(0.05, Math.max(0, Number.isFinite(dt) ? dt : 0))
    this.outlet.updateWorldMatrix(true, true)
    const bounds = new THREE.Box3().setFromObject(this.outlet)
    if (bounds.isEmpty()) this.outlet.getWorldPosition(this.source)
    else bounds.getCenter(this.source)
    this.space.worldToLocal(this.source)
    this.direction
      .fromArray(this.options.direction ?? [0, 0.559, 0.829])
      .transformDirection(this.outlet.matrixWorld)
    this.direction.transformDirection(this.space.matrixWorld.clone().invert())
    this.source.addScaledVector(this.direction, 0.03)
    this.movement.copy(this.source).sub(this.previous)
    if (this.ready && dt > 0 && this.movement.length() < 3) this.movement.multiplyScalar(0.8 / dt)
    else this.movement.set(0, 0, 0)
    this.previous.copy(this.source)
    this.ready = true
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt)
      if (!this.life[i]) continue
      for (let j = 0; j < 3; j++) this.positions[i * 3 + j] += this.velocities[i * 3 + j] * dt
      this.velocities[i * 3 + 1] += dt * 0.2
    }
    this.carry = running
      ? this.carry +
        dt *
          (this.options.emissionRate ?? 10 + 22 * THREE.MathUtils.clamp(load, 0, 1)) *
          this.amount
      : -THREE.MathUtils.clamp(this.options.emissionPhase ?? 0, 0, 1)
    while (this.carry >= 1) {
      this.carry--
      const i = this.next++ % this.life.length
      this.color
        .clone()
        .lerp(
          this.clearColor,
          THREE.MathUtils.clamp(Math.abs(speedKmh) / (this.options.clearAtKmh ?? 60), 0, 1),
        )
        .toArray(this.tints, i * 3)
      this.source.toArray(this.positions, i * 3)
      this.source.toArray(this.origins, i * 3)
      const jet = this.options.riseSpeed ?? 0.4 + 0.3 * THREE.MathUtils.clamp(load, 0, 1)
      this.direction
        .clone()
        .multiplyScalar(jet)
        .add(this.movement)
        .add(new THREE.Vector3(Math.sin(i * 2.4) * 0.18, 0.08, Math.cos(i * 2.4) * 0.18))
        .toArray(this.velocities, i * 3)
      this.life[i] = this.options.lifetime ?? 1.4
    }
    this.root.visible = this.life.some((v) => v > 0)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.life.needsUpdate = true
    this.geometry.attributes.tint.needsUpdate = true
    this.geometry.attributes.origin.needsUpdate = true
  }

  dispose(): void {
    if (this.smokePool) laserSmokePools.delete(this.smokePool)
    this.root.removeFromParent()
    this.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}

export class LegacyTireSmoke {
  private readonly positions = new Float32Array(96 * 3)
  private readonly life = new Float32Array(96)
  private readonly geometry = new THREE.BufferGeometry()
  private next = 0
  private carry = 0
  readonly root: THREE.Points
  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('life', new THREE.BufferAttribute(this.life, 1))
    this.root = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { smokeDensity, pixelRatio: { value: 1 } },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float life; varying float age; uniform float pixelRatio;
        void main(){ age=life; vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p; gl_PointSize=life>0.0 ? clamp((1.8-life)*160.0*pixelRatio/max(1.0,-p.z),1.0,80.0) : 0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        uniform float smokeDensity;
        #include <logdepthbuf_pars_fragment>
        varying float age; void main(){
        #include <logdepthbuf_fragment>
 float d=length(gl_PointCoord-0.5)*2.0;
        if(d>1.0 || age<=0.0) discard; gl_FragColor=vec4(0.65,0.67,0.69,(1.0-d)*(1.0-d)*age*0.24*smokeDensity); }`,
      }),
    )
    setWebGPUSubstitute(this.root, tireSmokeSprites(this.root))
    this.root.frustumCulled = false
    this.root.visible = false
  }
  update(dt: number, contacts: Vec3Tuple[], slip: number, origin: THREE.Vector3): void {
    dt = Math.min(0.05, Math.max(0, dt))
    for (let i = 0; i < this.life.length; i++) {
      this.life[i] = Math.max(0, this.life[i] - dt)
      if (this.life[i] > 0) this.positions[i * 3 + 1] += dt * 0.4
    }
    this.carry = contacts.length && slip > 0.2 ? this.carry + dt * 30 * slip : 0
    while (this.carry >= 1) {
      this.carry--
      const i = this.next++ % this.life.length
      const p = contacts[i % contacts.length]
      this.positions.set([p[0], p[1] + 0.08, p[2]], i * 3)
      this.life[i] = 1.2
    }
    this.root.position.copy(origin).negate()
    this.root.visible = this.life.some((v) => v > 0)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.life.needsUpdate = true
  }
  clear(): void {
    this.life.fill(0)
    this.carry = 0
    this.root.visible = false
  }
  dispose(): void {
    this.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
}

export class LegacyMuzzleSmoke {
  private readonly births = new Float64Array(32).fill(-Infinity)
  private readonly origins = new Float32Array(96)
  private readonly positions = new Float32Array(96)
  private readonly ages = new Float32Array(32).fill(-1)
  private next = 0
  private readonly geometry = new THREE.BufferGeometry()
  readonly root: THREE.Points
  constructor() {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('age', new THREE.BufferAttribute(this.ages, 1))
    this.root = new THREE.Points(
      this.geometry,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { smokeDensity, height: { value: 750 } },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float age; varying float t; uniform float height;
        void main(){t=age;vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p;
          gl_PointSize=age>=0.0?clamp((0.009+age*0.06)*height*projectionMatrix[1][1]/max(0.05,-p.z),1.0,100.0):0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        uniform float smokeDensity;
        #include <logdepthbuf_pars_fragment>
        varying float t;
        void main(){float d=length(gl_PointCoord-0.5)*2.0;
          if(t<0.0||d>1.0)discard;
          gl_FragColor=vec4(0.85,0.87,0.89,pow(1.0-d,2.0)*(1.0-t/0.7)*0.32*smokeDensity);
          #include <logdepthbuf_fragment>
        }`,
      }),
    )
    this.root.name = 'Muzzle powder smoke'
    setWebGPUSubstitute(this.root, muzzleSmokeSprites(this.root))
    this.root.visible = false
    this.root.frustumCulled = false
  }
  burst(now: number, muzzle: readonly number[]): void {
    for (let n = 0; n < 6; n++) {
      const i = this.next++ % 32
      this.births[i] = now - n * 8
      this.origins.set(muzzle, i * 3)
    }
    this.update(now)
  }
  update(now: number, height = 750): void {
    for (let i = 0; i < 32; i++) {
      const age = (now - this.births[i]) / 1000
      this.ages[i] = age >= 0 && age < 0.7 ? age : -1
      if (this.ages[i] < 0) continue
      this.positions[i * 3] = this.origins[i * 3] + Math.sin(i * 2.4) * age * 0.025
      this.positions[i * 3 + 1] = this.origins[i * 3 + 1] + age * 0.07
      this.positions[i * 3 + 2] = this.origins[i * 3 + 2] - age * 0.14
    }
    this.root.visible = this.ages.some((age) => age >= 0)
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.age.needsUpdate = true
    ;(this.root.material as THREE.ShaderMaterial).uniforms.height.value = height
  }
  dispose(): void {
    this.root.removeFromParent()
    this.geometry.dispose()
    ;(this.root.material as THREE.ShaderMaterial).dispose()
  }
  clear(): void {
    this.births.fill(-Infinity)
    this.update(0)
  }
}

export class LegacyShotSparks {
  enabled = true
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
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
  private readonly positions = new Float32Array(MAX_BURSTS * PER_BURST * 3)
  private readonly bursts: Burst[] = []
  private disposed = false

  constructor() {
    this.root.name = 'Shot sparks'
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setDrawRange(0, 0)
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
    this.root.add(this.points)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, now: number, normal?: Vec3Tuple, options: SparkBurstOptions = {}): void {
    if (!this.enabled) return
    if (this.disposed || !Number.isFinite(now)) return
    if (this.bursts.length === MAX_BURSTS) this.bursts.shift()
    const n = normal ? new THREE.Vector3(...normal).normalize() : new THREE.Vector3(0, 1, 0)
    const tangent = Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const bitangent = new THREE.Vector3().crossVectors(n, tangent).normalize()
    tangent.crossVectors(bitangent, n).normalize()
    const velocities: THREE.Vector3[] = []
    const count = Math.max(1, Math.min(PER_BURST, Math.round(options.count ?? PER_BURST)))
    const drift = options.drift ? new THREE.Vector3(...options.drift) : null
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1
      const v = Math.random() * 2 - 1
      const speed = (1.2 + Math.random() * 2.4) * (options.speed ?? 1)
      velocities.push(
        n
          .clone()
          .multiplyScalar(0.55 + Math.random() * 0.9)
          .addScaledVector(tangent, u)
          .addScaledVector(bitangent, v)
          .normalize()
          .multiplyScalar(speed)
          .add(drift ?? new THREE.Vector3()),
      )
    }
    this.bursts.push({ birth: now, origin: new THREE.Vector3(...origin), velocities })
  }

  update(now: number): void {
    if (!this.enabled) {
      this.clear()
      return
    }
    if (this.disposed) return
    const live = this.bursts.filter((b) => now - b.birth <= LIFE_MS)
    this.bursts.length = 0
    this.bursts.push(...live)
    let write = 0
    let newest = -Infinity
    for (const burst of this.bursts) {
      const age = (now - burst.birth) / 1000
      newest = Math.max(newest, burst.birth)
      for (const velocity of burst.velocities) {
        const o = write * 3
        this.positions[o] = burst.origin.x + velocity.x * age
        this.positions[o + 1] = burst.origin.y + velocity.y * age - 4.5 * age * age
        this.positions[o + 2] = burst.origin.z + velocity.z * age
        write++
      }
    }
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, write)
    if (write) this.geometry.computeBoundingSphere()
    this.material.opacity = this.bursts.length ? Math.max(0, 1 - (now - newest) / LIFE_MS) : 0
  }

  clear(): void {
    this.bursts.length = 0
    this.geometry.setDrawRange(0, 0)
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
}

const TRACER_LIFE_MS = 160
/** Peak opacity of the faint grey air thread (matches shot-tracers.ts). */
const TRACER_ALPHA = 0.1
const TRACER_MAX = 24

/** CPU air threads (a faint grey 1 px line, fading opacity), kept for WebGPU where ShaderMaterial does not apply. */
export class LegacyShotTracers {
  readonly root = new THREE.Group()
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.LineBasicMaterial({
    color: '#dbe0e6',
    transparent: true,
    opacity: TRACER_ALPHA,
    depthWrite: false,
    toneMapped: false,
  })
  private readonly line: THREE.LineSegments
  private readonly positions = new Float32Array(TRACER_MAX * 6)
  private readonly births = new Float64Array(TRACER_MAX)
  private count = 0
  private disposed = false

  constructor() {
    this.root.name = 'Shot tracers'
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.geometry.setDrawRange(0, 0)
    this.line = new THREE.LineSegments(this.geometry, this.material)
    this.line.frustumCulled = false
    this.line.renderOrder = 4
    this.root.add(this.line)
    this.root.raycast = () => undefined
  }

  add(origin: Vec3Tuple, end: Vec3Tuple, now: number): void {
    if (this.disposed || !Number.isFinite(now)) return
    if (this.count === TRACER_MAX) {
      this.positions.copyWithin(0, 6)
      this.births.copyWithin(0, 1)
      this.count = TRACER_MAX - 1
    }
    const o = this.count * 6
    this.positions[o] = origin[0]
    this.positions[o + 1] = origin[1]
    this.positions[o + 2] = origin[2]
    this.positions[o + 3] = end[0]
    this.positions[o + 4] = end[1]
    this.positions[o + 5] = end[2]
    this.births[this.count] = now
    this.count++
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.setDrawRange(0, this.count * 2)
    this.geometry.computeBoundingSphere()
  }

  update(now: number): void {
    if (this.disposed || this.count === 0) return
    let write = 0
    let newest = -Infinity
    for (let i = 0; i < this.count; i++) {
      if (now - this.births[i] > TRACER_LIFE_MS) continue
      if (write !== i) {
        this.positions.copyWithin(write * 6, i * 6, i * 6 + 6)
        this.births[write] = this.births[i]
      }
      newest = Math.max(newest, this.births[write]!)
      write++
    }
    if (write !== this.count) {
      this.count = write
      this.geometry.attributes.position.needsUpdate = true
      this.geometry.setDrawRange(0, this.count * 2)
    }
    this.material.opacity = this.count
      ? Math.max(0, 1 - (now - newest) / TRACER_LIFE_MS) ** 2 * TRACER_ALPHA
      : TRACER_ALPHA
  }

  clear(): void {
    this.count = 0
    this.geometry.setDrawRange(0, 0)
    this.material.opacity = TRACER_ALPHA
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.root.removeFromParent()
    this.geometry.dispose()
    this.material.dispose()
  }
}
