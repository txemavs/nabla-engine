import { BufferAttribute, BufferGeometry, Points, ShaderMaterial, Vector3 } from 'three'
import type { Vec3Tuple } from '../../entity/schema.js'

/** Bounded particle pool, one draw call. World positions stay independent of the floating origin. */
export class TireSmoke {
  private readonly positions = new Float32Array(96 * 3)
  private readonly life = new Float32Array(96)
  private readonly geometry = new BufferGeometry()
  private next = 0
  private carry = 0
  readonly root: Points
  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3))
    this.geometry.setAttribute('life', new BufferAttribute(this.life, 1))
    this.root = new Points(
      this.geometry,
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { pixelRatio: { value: 1 } },
        vertexShader: `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute float life; varying float age; uniform float pixelRatio;
        void main(){ age=life; vec4 p=modelViewMatrix*vec4(position,1.0);
          gl_Position=projectionMatrix*p; gl_PointSize=life>0.0 ? clamp((1.8-life)*160.0*pixelRatio/max(1.0,-p.z),1.0,80.0) : 0.0;
          #include <logdepthbuf_vertex>
        }`,
        fragmentShader: `
        #include <logdepthbuf_pars_fragment>
        varying float age; void main(){
        #include <logdepthbuf_fragment>
 float d=length(gl_PointCoord-0.5)*2.0;
        if(d>1.0 || age<=0.0) discard; gl_FragColor=vec4(0.65,0.67,0.69,(1.0-d)*(1.0-d)*age*0.24); }`,
      }),
    )
    this.root.frustumCulled = false
    this.root.visible = false
  }
  update(dt: number, contacts: Vec3Tuple[], slip: number, origin: Vector3): void {
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
    ;(this.root.material as ShaderMaterial).dispose()
  }
}
