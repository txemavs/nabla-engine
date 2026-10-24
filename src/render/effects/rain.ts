import * as THREE from 'three'
import { CLOUD_NOISE } from '../planet/artistic-clouds.js'
import { weatherWind, weatherHours, type RainWeather } from '../planet/weather.js'
import { RainCurtains } from './rain-curtains.js'

/** Analytic rain: immutable instance seeds, one draw, no per-drop CPU simulation. */
export class GpuRain {
  readonly scene = new THREE.Scene()
  readonly curtains = new RainCurtains()
  readonly geometry = new THREE.InstancedBufferGeometry()
  readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: true,
    depthWrite: false,
    uniforms: {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(weatherWind.x, -15, weatherWind.z) },
      eyeWorld: { value: new THREE.Vector3() },
      hours: { value: 12 },
      linked: { value: 0 },
      cover: { value: 0 },
      storm: { value: 0 },
      eyePhase: { value: new THREE.Vector3() },
      eyeLocal: { value: new THREE.Vector3() },
      brightness: { value: 1 },
    },
    vertexShader: `
      attribute vec4 seed;
      uniform float time;
      uniform vec3 wind;
      uniform vec3 eyeWorld;
      uniform float hours;
      uniform float linked;
      uniform float cover;
      uniform float storm;
      ${CLOUD_NOISE}
      uniform vec3 eyePhase;
      uniform vec3 eyeLocal;
      varying vec2 rainUv;
      varying float fade;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec3 size = vec3(48.0, 32.0, 48.0);
        vec3 velocity = wind;
        vec3 relative = mod(seed.xyz * size + velocity * time - eyePhase + size * 0.5, size) - size * 0.5;
        float distanceToEye = length(relative);
        fade = smoothstep(1.2, 3.0, distanceToEye) * (1.0 - smoothstep(16.0, 23.0, distanceToEye));
        if (linked > 0.5) {
          float thresh = clamp(mix(0.94, 0.15, cover) - storm * 0.08, 0.05, 0.97);
          float cloud = cumulus((eyeWorld + relative).xz, hours, thresh);
          fade *= smoothstep(0.12, 0.7, cloud) * smoothstep(0.08, 0.65, storm) * step(0.001, cover);
        }
        vec4 mvPosition = viewMatrix * vec4(eyeLocal + relative, 1.0);
        vec3 falling = mat3(viewMatrix) * velocity;
        vec2 direction = falling.xy / max(length(falling.xy), 0.001);
        vec2 across = vec2(direction.y, -direction.x);
        mvPosition.xy += across * position.x * (0.018 + seed.w * 0.016)
          + direction * position.y * (0.5 + seed.w * 0.45);
        rainUv = uv;
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform float brightness;
      varying vec2 rainUv;
      varying float fade;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        float width = 1.0 - abs(rainUv.x * 2.0 - 1.0);
        float ends = sin(rainUv.y * 3.14159265);
        float alpha = width * ends * fade * 0.42;
        if (alpha < 0.005) discard;
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(vec3(0.65, 0.73, 0.8) * brightness, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  readonly mesh = new THREE.Mesh(this.geometry, this.material)

  constructor() {
    const quad = new THREE.PlaneGeometry(1, 1)
    this.geometry.setIndex(quad.index!.clone())
    this.geometry.setAttribute('position', quad.getAttribute('position').clone())
    this.geometry.setAttribute('uv', quad.getAttribute('uv').clone())
    quad.dispose()
    const seeds = new Float32Array(6000 * 4)
    let state = 731
    for (let i = 0; i < seeds.length; i++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      seeds[i] = state / 4294967296
    }
    this.geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4))
    this.geometry.instanceCount = 0
    this.mesh.name = 'GPU rain'
    this.mesh.renderOrder = 2
    this.scene.add(this.curtains.mesh)
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  update(
    timeSeconds: number,
    eye: THREE.Vector3,
    origin: THREE.Vector3,
    amount: number,
    day: number,
    weather?: RainWeather,
  ): void {
    const wind = weather?.wind ?? weatherWind
    this.material.uniforms.wind.value.set(wind.x, -15, wind.z)
    this.material.uniforms.eyeWorld.value.copy(eye)
    this.material.uniforms.eyeWorld.value.x += weather?.offset?.x ?? 0
    this.material.uniforms.eyeWorld.value.z += weather?.offset?.z ?? 0
    this.material.uniforms.hours.value = weatherHours(timeSeconds)
    this.material.uniforms.linked.value = weather?.linked ? 1 : 0
    this.material.uniforms.cover.value = weather?.clouds ? weather.amount : 0
    this.material.uniforms.storm.value = weather?.storm ?? 0
    this.curtains.mesh.visible = false
    if (weather) this.curtains.update(timeSeconds, eye, origin, amount, day, weather)
    this.geometry.instanceCount = Math.round(6000 * THREE.MathUtils.clamp(amount, 0, 1))
    // The default wind traverses whole periods in 480 s; observed wind has arbitrary velocity.
    this.material.uniforms.time.value = weather?.wind ? timeSeconds : timeSeconds % 480
    this.material.uniforms.eyePhase.value.set(eye.x % 48, eye.y % 32, eye.z % 48)
    this.material.uniforms.eyeLocal.value.copy(eye).sub(origin)
    this.material.uniforms.brightness.value = 0.06 + THREE.MathUtils.clamp(day, 0, 1) * 0.94
  }

  dispose(): void {
    this.curtains.dispose()
    this.geometry.dispose()
    this.material.dispose()
    this.scene.clear()
  }
}
