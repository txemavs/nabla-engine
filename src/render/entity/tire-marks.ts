import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, ShaderMaterial, Vector3 } from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'
export type TireMarkContact = {
  contactPoint: Vec3Tuple | null
  contactNormal: Vec3Tuple | null
  slip: number
}
/** Fixed ring buffer: one draw, no textures, shader-based fading, floating-origin safe. */
export class TireMarks {
  readonly root: Mesh<BufferGeometry, ShaderMaterial>
  private readonly positions: Float32Array
  private readonly stamps: Float32Array
  private readonly strength: Float32Array
  private readonly anchor = new Vector3()
  private anchored = false
  private time = 0
  private next = 0
  private count = 0
  private lastEmission = -Infinity
  private lastMark = -Infinity
  private vehicle: string | null = null
  private previous = new Map<
    number,
    { point: Vector3; normal: Vector3; left?: Vector3; right?: Vector3 }
  >()
  constructor(
    readonly capacity = 2048,
    readonly lifetime = 20,
  ) {
    this.positions = new Float32Array(capacity * 18)
    this.stamps = new Float32Array(capacity * 6)
    this.strength = new Float32Array(capacity * 6)
    const uv = new Float32Array(capacity * 12)
    for (let i = 0; i < capacity; i++) uv.set([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1], i * 12)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    geometry.setAttribute('born', new BufferAttribute(this.stamps, 1))
    geometry.setAttribute('strength', new BufferAttribute(this.strength, 1))
    geometry.setAttribute('uv', new BufferAttribute(uv, 2))
    geometry.setDrawRange(0, 0)
    this.root = new Mesh(
      geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: { clock: { value: 0 }, lifetime: { value: lifetime } },
        vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float born; attribute float strength;
      varying vec2 markUv; varying float age; varying float opacity;
      uniform float clock;
      void main(){markUv=uv;age=clock-born;opacity=strength;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      #include <logdepthbuf_vertex>
      }`,
        fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec2 markUv; varying float age; varying float opacity;
      uniform float lifetime;
      void main(){
      #include <logdepthbuf_fragment>
      float fade=1.0-smoothstep(lifetime*0.65,lifetime,age);
      float edge=smoothstep(0.0,0.12,markUv.x)*smoothstep(0.0,0.12,1.0-markUv.x);
      float grooves=0.82+0.18*cos(markUv.x*38.0);
      float alpha=fade*edge*grooves*opacity*0.48;
      if(alpha<0.005)discard;gl_FragColor=vec4(0.025,0.022,0.02,alpha);
      }`,
      }),
    )
    this.root.frustumCulled = false
    this.root.visible = false
    this.root.name = 'Transient tyre marks'
  }
  update(dt: number, vehicle: string | null, contacts: TireMarkContact[], origin: Vector3): void {
    this.time += Number.isFinite(dt) ? Math.max(0, dt) : 0
    this.root.material.uniforms.clock.value = this.time
    if (vehicle !== this.vehicle) {
      this.previous.clear()
      this.vehicle = vehicle
    }
    this.root.position.copy(this.anchor).sub(origin)
    this.root.visible = this.time - this.lastMark < this.lifetime
    // Immediately break trails on loss of contact, even between emission ticks.
    contacts.forEach((c, i) => {
      if (!c.contactPoint || c.slip < 0.22) this.previous.delete(i)
    })
    if (this.time - this.lastEmission < 0.05) return
    this.lastEmission = this.time
    let changed = false
    contacts.forEach((c, i) => {
      if (!c.contactPoint || !c.contactNormal || c.slip < 0.22) return
      const point = new Vector3(...c.contactPoint),
        normal = new Vector3(...c.contactNormal).normalize()
      if (!this.anchored || point.distanceToSquared(this.anchor) > 4000000) {
        this.clear()
        this.anchor.copy(point)
        this.anchored = true
      }
      point.sub(this.anchor).addScaledVector(normal, 0.012)
      const previous = this.previous.get(i)
      if (!previous) {
        this.previous.set(i, { point, normal })
        return
      }
      const distance = previous.point.distanceTo(point)
      if (distance < 0.25) return
      if (distance > 6 || previous.normal.dot(normal) < 0.7) {
        this.previous.set(i, { point, normal })
        return
      }
      const direction = point.clone().sub(previous.point).normalize()
      const side = new Vector3().crossVectors(direction, normal).normalize().multiplyScalar(0.095)
      const left = point.clone().sub(side),
        right = point.clone().add(side)
      const a = previous.left ?? previous.point.clone().sub(side),
        b = previous.right ?? previous.point.clone().add(side)
      const slot = this.next++ % this.capacity
      ;[a, b, left, left, b, right].forEach((v, k) =>
        this.positions.set(v.toArray(), slot * 18 + k * 3),
      )
      this.stamps.fill(this.time, slot * 6, slot * 6 + 6)
      this.strength.fill(Math.min(1, c.slip), slot * 6, slot * 6 + 6)
      this.count = Math.min(this.capacity, this.count + 1)
      this.previous.set(i, { point, normal, left, right })
      this.lastMark = this.time
      changed = true
    })
    if (changed) {
      for (const key of ['position', 'born', 'strength'])
        this.root.geometry.attributes[key].needsUpdate = true
      this.root.geometry.setDrawRange(0, this.count * 6)
    }
    this.root.position.copy(this.anchor).sub(origin)
    this.root.visible = this.time - this.lastMark < this.lifetime
  }
  clear(): void {
    this.previous.clear()
    this.count = this.next = 0
    this.lastMark = -Infinity
    this.anchored = false
    this.root.visible = false
    this.root.geometry.setDrawRange(0, 0)
  }
  dispose(): void {
    this.root.geometry.dispose()
    this.root.material.dispose()
  }
}
