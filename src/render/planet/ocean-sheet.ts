import * as THREE from 'three'
import { EARTH_RADIUS, type GeoPoint } from '../../math/geo/sphere.js'
import { SURFACE_COLORS } from '../../planet/land/surface.js'
import { waterWaves } from './water-material.js'
import { groundCloudShade, groundCloudShadow } from './artistic-clouds.js'

export const SEA_ALTITUDE = 0
const UNDER_CLEARANCE = 0.3
/** Straight-line cap. The far root is the other side of the planet; the horizon from orbit is inside this. */
const MAX_HIT = 4_000_000
/**
 * Inward metres along the planet normal used only for the sea depth write.
 * Colour stays on the true sphere. A view-axis pull of ~1.4 m (clip.w - 1.4)
 * became a vertical error under look-down and walked the shoreline inland.
 */
export const SEA_DEPTH_INSET = 0.04

/**
 * World point written to the depth buffer for a sea hit.
 * A few centimetres inward keeps land at the waterline in front without a
 * camera-dependent shoreline. Offset is along `radial`, never the view axis.
 */
export function seaDepthPoint(
  hit: THREE.Vector3,
  radial: THREE.Vector3,
  inset = SEA_DEPTH_INSET,
): THREE.Vector3 {
  return hit.clone().addScaledVector(radial, -inset)
}

/** True once the eye has dropped through the sea surface. Above water stays opaque. */
export function seaSeenFromBelow(
  eye: THREE.Vector3,
  originAltitude: number,
  level: number,
): boolean {
  const eyeRadius = Math.hypot(eye.x, eye.y + EARTH_RADIUS + originAltitude, eye.z)
  return eyeRadius < EARTH_RADIUS + SEA_ALTITUDE + level - UNDER_CLEARANCE
}

/**
 * Metres along a ray to the sea sphere.
 * `altitude` is eye height above that sphere (negative underwater).
 * `rise` is dot(up, ray direction). Null when the ray misses.
 * The near root uses c / tFar so float32 does not cancel Earth-radius squares.
 */
export function seaRayDistance(
  altitude: number,
  rise: number,
  seaRadius = EARTH_RADIUS,
): number | null {
  const b = (seaRadius + altitude) * rise
  const c = altitude * (2 * seaRadius + altitude)
  const disc = b * b - c
  if (disc < 0) return null
  const s = Math.sqrt(disc)
  const near = -b - s
  const far = -b + s
  const eps = 0.05
  let t = Infinity
  if (near > eps) t = near
  if (far > eps && far < t) t = far
  return t < MAX_HIT ? t : null
}

function seaTriangle(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )
  geometry.computeBoundingSphere()
  return geometry
}

const seaShader = {
  vertex: `
    varying vec3 rayDir;
    void main() {
      vec4 clip = vec4(position.xy, 0.0, 1.0);
      vec4 view = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
      rayDir = mat3(inverse(viewMatrix)) * (view.xyz / view.w);
      gl_Position = clip;
    }
  `,
  fragment: `
    uniform vec3 earthRadial;
    uniform float altitude;
    uniform float seaRadius;
    uniform mat4 projectionMatrix;
    uniform vec3 waterOrigin;
    uniform float waterTime;
    uniform sampler2D waterNormal;
    uniform vec3 sunDir;
    uniform vec3 sunColor;
    uniform float sunIntensity;
    uniform float ambient;
    uniform vec3 waterColor;
    uniform float opacity;
    uniform float fogOn;
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    varying vec3 rayDir;
    ${groundCloudShade}
    #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
      uniform float logDepthBufFC;
    #endif
    void main() {
      if (opacity < 0.015) discard;
      vec3 rd = normalize(rayDir);
      float rise = dot(earthRadial, rd);
      float b = (seaRadius + altitude) * rise;
      float c = altitude * (2.0 * seaRadius + altitude);
      float disc = b * b - c;
      if (disc < 0.0) discard;
      float s = sqrt(disc);
      float near = -b - s;
      float far = -b + s;
      float t = 1e20;
      if (near > 0.05) t = near;
      if (far > 0.05 && far < t) t = far;
      if (t > 4000000.0) discard;
      vec3 hit = cameraPosition + rd * t;
      vec2 waveUV = (hit.xz + waterOrigin.xz) / 256.0;
      vec2 swellUV = (hit.xz + waterOrigin.xz) / 5200.0;
      float waveTime = waterTime / 256.0;
      vec3 ripples = texture2D(waterNormal, (waveUV + waveTime) * 3.0).xyz * 0.25
        + texture2D(waterNormal, (waveUV + waveTime) * 16.0).xyz * 0.25
        + texture2D(waterNormal, (waveUV - waveTime) * 8.0).xyz * 0.5;
      vec3 swell = texture2D(waterNormal, (swellUV + waveTime * 0.35) * 2.2).xyz * 0.35
        + texture2D(waterNormal, (swellUV - waveTime * 0.22) * 5.0).xyz * 0.65;
      vec3 waves = normalize(mix((ripples * 0.62 + swell * 0.38) * 2.0 - 1.0, vec3(0.0, 0.0, 1.0), 0.42).xzy);
      vec3 center = cameraPosition - earthRadial * (seaRadius + altitude);
      vec3 radial = normalize(hit - center);
      vec3 n = normalize(radial + vec3(waves.x, 0.0, waves.z));
      vec3 sun = normalize(sunDir);
      float ndotl = clamp(dot(n, sun), 0.0, 1.0);
      float strength = clamp(sunIntensity / 3.2, 0.0, 1.0);
      float rough = 0.3;
      float a2 = rough * rough;
      a2 *= a2;
      vec3 halfV = normalize(sun - rd);
      float nh = clamp(dot(n, halfV), 0.0, 1.0);
      float denom = nh * nh * (a2 - 1.0) + 1.0;
      float spec = a2 / (3.14159 * denom * denom + 0.0001);
      float fresnel = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 5.0);
      float elev = clamp(dot(sun, radial), 0.0, 1.0);
      float sunHigh = smoothstep(0.06, 0.38, elev);
      float alignment = clamp(dot(reflect(rd, radial), sun), 0.0, 1.0);
      float chop = clamp(length(vec2(waves.x, waves.z)) * 2.4, 0.0, 1.0);
      float glint = (pow(alignment, 720.0) * 1.35 + pow(alignment, 128.0) * 0.22) * mix(1.0, 0.42, chop);
      // Same Lambert body as rivers and coastal water (MeshStandardMaterial, metalness 0.15),
      // so the open sea and inland water share one colour. Specular and glint below unchanged.
      vec3 color = waterColor * 0.85 * (sunColor * sunIntensity * ndotl + vec3(ambient)) / 3.14159;
      color *= mix(1.0, 0.62, nablaGroundShade(hit.xz + waterOrigin.xz));
      color += sunColor * spec * fresnel * ndotl * strength * 0.42 * (1.0 - sunHigh);
      if (fogOn > 0.5 && fogFar > fogNear) {
        color = mix(color, fogColor, clamp(smoothstep(fogNear, fogFar, t), 0.0, 1.0));
      }
      color += sunColor * glint * elev * strength;
      vec3 depthHit = hit - radial * ${SEA_DEPTH_INSET};
      vec4 clipHit = projectionMatrix * viewMatrix * vec4(depthHit, 1.0);
      float w = max(clipHit.w, 0.0);
      #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
        gl_FragDepth = min(log2(1.0 + max(w, 0.0)) * logDepthBufFC * 0.5, 0.9999);
      #else
        gl_FragDepth = w > 0.0 ? min(clipHit.z / w * 0.5 + 0.5, 0.9999) : 1.0;
      #endif
      gl_FragColor = vec4(color, opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
}

/** One triangle. The fragment intersects the same sphere boat buoyancy uses, out to the horizon. */
export class OceanSheet {
  private readonly time = { value: 0 }
  private readonly uniforms: {
    earthRadial: { value: THREE.Vector3 }
    altitude: { value: number }
    seaRadius: { value: number }
    waterOrigin: { value: THREE.Vector3 }
    waterTime: { value: number }
    waterNormal: { value: THREE.Texture }
    sunDir: { value: THREE.Vector3 }
    sunColor: { value: THREE.Color }
    sunIntensity: { value: number }
    ambient: { value: number }
    waterColor: { value: THREE.Color }
    opacity: { value: number }
    fogOn: { value: number }
    fogColor: { value: THREE.Color }
    fogNear: { value: number }
    fogFar: { value: number }
    nablaCloudSun: { value: THREE.Vector3 }
    nablaCloudHours: { value: number }
    nablaCloudDay: { value: number }
    nablaCloudAmount: { value: number }
    nablaCloudStorm: { value: number }
    nablaCloudBase: { value: number }
    nablaCloudCover: { value: number }
  }
  private readonly texture: THREE.Texture
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  private level = 0
  private space = 0
  private cover = 1
  private seeThrough = false
  setLevel(metres: number): void {
    if (!Number.isFinite(metres)) return
    this.level = Math.max(-5, Math.min(50, metres))
  }
  /** Coastal water and rivers. Same clock and normal map as the horizon sheet. */
  surface(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: SURFACE_COLORS.water,
      roughness: 0.3,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
    waterWaves(material, this.texture, this.time, this.uniforms.waterOrigin)
    return material
  }
  constructor(changed: () => void = () => {}) {
    this.texture = new THREE.TextureLoader().load(
      new URL('../../../assets/geography/water-normal.png', import.meta.url).href,
      changed,
    )
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    this.uniforms = {
      earthRadial: { value: new THREE.Vector3(0, 1, 0) },
      altitude: { value: 0 },
      seaRadius: { value: EARTH_RADIUS },
      waterOrigin: { value: new THREE.Vector3() },
      waterTime: this.time,
      waterNormal: { value: this.texture },
      sunDir: { value: new THREE.Vector3(0.35, 0.85, 0.2).normalize() },
      sunColor: { value: new THREE.Color('#fff0d8') },
      sunIntensity: { value: 3.2 },
      ambient: { value: 0.22 },
      waterColor: { value: new THREE.Color(SURFACE_COLORS.water) },
      opacity: { value: 1 },
      fogOn: { value: 0 },
      fogColor: { value: new THREE.Color('#a6bbd5') },
      fogNear: { value: 1 },
      fogFar: { value: 1000 },
      nablaCloudSun: groundCloudShadow.sun,
      nablaCloudHours: groundCloudShadow.dayHours,
      nablaCloudDay: groundCloudShadow.day,
      nablaCloudAmount: groundCloudShadow.amount,
      nablaCloudStorm: groundCloudShadow.storm,
      nablaCloudBase: groundCloudShadow.cumBase,
      nablaCloudCover: groundCloudShadow.coverage,
    }
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: seaShader.vertex,
      fragmentShader: seaShader.fragment,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      fog: false,
      toneMapped: true,
    })
    this.mesh = new THREE.Mesh(seaTriangle(), material)
    this.mesh.name = 'Sea'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -1
  }
  setLight(direction: THREE.Vector3, intensity: number, color: THREE.Color, ambient: number): void {
    if (direction.lengthSq() > 1e-8) this.uniforms.sunDir.value.copy(direction).normalize()
    this.uniforms.sunIntensity.value = intensity
    this.uniforms.sunColor.value.copy(color)
    this.uniforms.ambient.value = ambient
  }
  /** Same fade as the sky going black. Hides the sheet so the globe texture shows. */
  fadeWithSky(space: number): void {
    this.space = Math.min(1, Math.max(0, space))
    this.paint()
    if (this.space > 0.97) this.mesh.visible = false
  }
  private paint(): void {
    const alpha = this.cover * (1 - this.space)
    this.uniforms.opacity.value = alpha
    const veil = this.seeThrough || this.space > 0.02
    const material = this.mesh.material
    if (material.transparent !== veil) {
      material.transparent = veil
      material.depthWrite = !veil
      material.needsUpdate = true
    }
    this.mesh.renderOrder = veil ? 10 : -1
  }
  followFog(fog: THREE.Fog | null): void {
    if (!fog) {
      this.uniforms.fogOn.value = 0
      return
    }
    this.uniforms.fogOn.value = 1
    this.uniforms.fogColor.value.copy(fog.color)
    this.uniforms.fogNear.value = fog.near
    this.uniforms.fogFar.value = fog.far
  }
  update(
    origin: GeoPoint,
    eye: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    _distance: number,
    now: number,
    revealFloor = false,
  ): void {
    this.time.value = now / 1000
    this.uniforms.waterOrigin.value.copy(renderOrigin)
    const seaRadius = EARTH_RADIUS + SEA_ALTITUDE + this.level
    const center = new THREE.Vector3(0, -EARTH_RADIUS - origin.altitude, 0)
    const radial = eye.clone().sub(center)
    const dist = radial.length()
    if (dist < 1) return
    radial.multiplyScalar(1 / dist)
    this.uniforms.earthRadial.value.copy(radial)
    this.uniforms.seaRadius.value = seaRadius
    this.uniforms.altitude.value = dist - seaRadius
    const below = seaSeenFromBelow(eye, origin.altitude, this.level)
    this.seeThrough = below || revealFloor
    this.cover = below ? 0.4 : revealFloor ? 0.62 : 1
    this.paint()
    this.mesh.position.copy(center).addScaledVector(radial, seaRadius).sub(renderOrigin)
  }
  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}
