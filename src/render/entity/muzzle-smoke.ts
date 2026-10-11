/** Small bounded powder-smoke bursts, in the pistol presentation's local space. */
import * as THREE from 'three'
export class MuzzleSmoke {
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
        uniforms: { height: { value: 750 } },
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
        #include <logdepthbuf_pars_fragment>
        varying float t;
        void main(){float d=length(gl_PointCoord-0.5)*2.0;
          if(t<0.0||d>1.0)discard;
          gl_FragColor=vec4(0.85,0.87,0.89,pow(1.0-d,2.0)*(1.0-t/0.7)*0.32);
          #include <logdepthbuf_fragment>
        }`,
      }),
    )
    this.root.name = 'Muzzle powder smoke'
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
