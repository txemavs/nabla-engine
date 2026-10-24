import * as THREE from 'three'
import { CLOUD_NOISE } from '../planet/artistic-clouds.js'
import { weatherHours, type RainWeather } from '../planet/weather.js'

/** Distant precipitation banks, one instanced draw; opaque world depth occludes the sheets. */
export class RainCurtains {
  readonly geometry = new THREE.InstancedBufferGeometry()
  readonly material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      eye: { value: new THREE.Vector3() },
      origin: { value: new THREE.Vector3() },
      offset: { value: new THREE.Vector2() },
      hours: { value: 12 },
      amount: { value: 0 },
      cover: { value: 0 },
      storm: { value: 0 },
      linked: { value: 0 },
      daylight: { value: 1 },
    },
    vertexShader: `
      attribute vec2 cell;
      uniform vec3 eye;
      uniform vec3 origin;
      uniform float storm;
      varying vec2 curtainUv;
      varying vec3 curtainWorld;
      varying float distanceFade;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec2 center = (floor(eye.xz / 1400.0) + cell) * 1400.0 + 700.0;
        vec2 delta = eye.xz - center;
        float distanceToEye = length(delta);
        vec2 right = vec2(delta.y, -delta.x) / max(distanceToEye, 1.0);
        float top = 1100.0 - storm * 500.0;
        float bottom = min(-180.0, eye.y - 400.0);
        vec2 xz = center + right * position.x * 2100.0;
        curtainWorld = vec3(xz.x, mix(bottom, top, uv.y), xz.y);
        curtainUv = uv;
        distanceFade = smoothstep(180.0, 900.0, distanceToEye)
          * (1.0 - smoothstep(4800.0, 6800.0, distanceToEye));
        vec4 mvPosition = viewMatrix * vec4(curtainWorld - origin, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: `
      uniform float hours;
      uniform float amount;
      uniform float cover;
      uniform float storm;
      uniform float linked;
      uniform float daylight;
      uniform vec2 offset;
      varying vec2 curtainUv;
      varying vec3 curtainWorld;
      varying float distanceFade;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${CLOUD_NOISE}
      void main() {
        float thresh = clamp(mix(0.94, 0.15, cover) - storm * 0.08, 0.05, 0.97);
        float cloud = cumulus(curtainWorld.xz + offset, hours, thresh);
        float precipitation = mix(1.0, smoothstep(0.12, 0.7, cloud)
          * smoothstep(0.08, 0.65, storm) * step(0.001, cover), linked);
        vec2 advected = curtainWorld.xz + offset + vec2(hours * 28800.0, hours * 9000.0);
        float streak = noise(advected * vec2(0.012, 0.012) + vec2(curtainUv.y * 0.6));
        float edge = smoothstep(0.0, 0.22, curtainUv.x) * (1.0 - smoothstep(0.78, 1.0, curtainUv.x));
        float vertical = smoothstep(0.0, 0.12, curtainUv.y) * (1.0 - smoothstep(0.86, 1.0, curtainUv.y));
        float alpha = amount * precipitation * distanceFade * edge * vertical * mix(0.07, 0.2, streak);
        if (alpha < 0.003) discard;
        #include <logdepthbuf_fragment>
        vec3 color = mix(vec3(0.025, 0.035, 0.05), vec3(0.30, 0.37, 0.43), daylight);
        gl_FragColor = vec4(color, alpha);
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
    const cells: number[] = []
    // Far-to-near rings; blending uses low-opacity sheets, no per-frame CPU sort.
    for (let ring = 4; ring >= 0; ring--)
      for (let x = -ring; x <= ring; x++)
        for (let z = -ring; z <= ring; z++)
          if (Math.max(Math.abs(x), Math.abs(z)) === ring) cells.push(x, z)
    this.geometry.setAttribute(
      'cell',
      new THREE.InstancedBufferAttribute(new Float32Array(cells), 2),
    )
    this.geometry.instanceCount = cells.length / 2
    this.mesh.name = 'Distant rain curtains'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.visible = false
  }
  update(
    seconds: number,
    eye: THREE.Vector3,
    origin: THREE.Vector3,
    amount: number,
    day: number,
    weather: RainWeather,
  ): void {
    const u = this.material.uniforms
    u.offset.value.set(weather.offset?.x ?? 0, weather.offset?.z ?? 0)
    u.eye.value.copy(eye)
    u.origin.value.copy(origin)
    u.hours.value = weatherHours(seconds)
    u.amount.value = amount
    u.cover.value = weather.clouds ? weather.amount : 0
    u.storm.value = weather.storm
    u.linked.value = weather.linked ? 1 : 0
    u.daylight.value = day
    this.mesh.visible =
      amount > 0 &&
      (!weather.linked || (weather.clouds && weather.amount > 0 && weather.storm > 0.08))
  }
  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }
}
