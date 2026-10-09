/**
 * Procedural reflection environment for polished metal. The scene has no environment map, so a
 * metallic PBR material (chrome exhaust, mirror glass) reflects nothing and renders black. This
 * gives such materials a small shared sky-over-ground gradient (three.js prefilters it), so
 * chrome reads as bright polished metal. Matte and painted materials are left alone.
 */
import * as THREE from 'three'
import { lightingDefaults } from '../../config/lighting.js'

/**
 * Environment reflections do not pass through the lighting. A studio env map stays bright in
 * shade and at night, so chrome reads as self-lit. Three r186 no longer has
 * `#include <emissive_fragment>`, and a metal's diffuse term is ~0 even in full sun, so the
 * reflection has to be scaled by the light that actually arrives: shadowed direct light
 * (NdotL * light color, after the shadow map) plus ambient irradiance. That is ~1 on a sunlit
 * face (bright whitish chrome) and only the small night/shade fill otherwise. No emissive,
 * and the env is not left as a fixed specular.
 *
 * `nablaIncident` is accumulated in the shared lighting chunk (see `patchChromeIncidentLight`,
 * re-applied after the CSM splice). Chrome materials then scale `indirectSpecular` by it.
 */
const DIRECT_CALL =
  'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'

export function patchChromeIncidentLight(): void {
  let source = THREE.ShaderChunk.lights_fragment_begin
  if (!source.includes('vec3 nablaIncident')) {
    if (!source.includes('vec3 geometryPosition'))
      throw new Error('Unsupported Three.js lighting chunk (no geometryPosition)')
    source = source.replace(
      'vec3 geometryPosition',
      'vec3 nablaIncident = vec3( 0.0 );\nvec3 geometryPosition',
    )
  }
  if (!source.includes('nablaIncident += directLight.color')) {
    if (!source.includes(DIRECT_CALL))
      throw new Error('Unsupported Three.js lighting chunk (no RE_Direct)')
    source = source.replaceAll(
      DIRECT_CALL,
      'nablaIncident += directLight.color * saturate( dot( geometryNormal, directLight.direction ) );\n\t\t' +
        DIRECT_CALL,
    )
  }
  if (!source.includes('nablaIncident += irradiance')) {
    const marker = '#if defined( RE_IndirectSpecular )'
    if (!source.includes(marker))
      throw new Error('Unsupported Three.js lighting chunk (no indirect specular)')
    source = source.replace(
      marker,
      '#if defined( RE_IndirectDiffuse )\n\tnablaIncident += irradiance;\n#endif\n\n' + marker,
    )
  }
  THREE.ShaderChunk.lights_fragment_begin = source
}

const SPECULAR_SUM =
  'vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;'

/**
 * Reflection kept in full shade, as a fraction of the sunlit one. Shade is lit by the sky, which
 * a shadow does not remove: scaling the reflection by the shadowed sun alone (only the ~0.22
 * ambient left) turned shaded chrome, glass and exhausts pure black, and a shadow map flickering
 * while driving flashed them back to their real colour. Night still dims it through
 * `reflectionLevel` (`setLevel`). TODO(unverified): 0.5 is a look choice, not a measurement.
 */
export const shadeReflectionFloor = 0.5

const shaded = new WeakSet<THREE.Material>()

function shadeEnvironment(material: THREE.MeshStandardMaterial): void {
  patchChromeIncidentLight()
  // Once per material: a material shared by two vehicles must not scale its reflection twice.
  if (shaded.has(material)) return
  shaded.add(material)
  const previous = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer)
    if (!shader.fragmentShader.includes(SPECULAR_SUM)) return
    shader.fragmentShader = shader.fragmentShader.replace(
      SPECULAR_SUM,
      `reflectedLight.indirectSpecular *= max( saturate( nablaIncident ), vec3( ${shadeReflectionFloor.toFixed(2)} ) );\n\t` +
        SPECULAR_SUM,
    )
  }
  const key = material.customProgramCacheKey?.bind(material)
  material.customProgramCacheKey = () => (key ? key() : '') + ' nabla-shaded-env-floor'
}

let shared: THREE.DataTexture | null = null

/**
 * Equirectangular neutral studio gradient (light grey overhead, bright horizon band, dark grey
 * ground), shared by every model. Deliberately colourless: a blue sky in the reflection tinted the
 * chrome blue.
 */
export function reflectionEnvironmentTexture(): THREE.DataTexture {
  if (shared) return shared
  const width = 128,
    height = 64,
    data = new Uint8Array(width * height * 4)
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
  const zenith = [170, 170, 170],
    horizon = [245, 245, 245],
    ground = [92, 92, 92],
    earth = [48, 48, 48]
  for (let y = 0; y < height; y++) {
    // A DataTexture is not flipped: row 0 is v = 0, which three's equirectangular lookup
    // (v = asin(dir.y) / π + 0.5) maps straight DOWN. So rows run from the ground (row 0) up to
    // the zenith (last row); writing the zenith first lit chrome from below (sky under it).
    const elevation = ((y + 0.5) / height - 0.5) * Math.PI
    const c =
      elevation >= 0
        ? mix(horizon, zenith, Math.pow(Math.sin(elevation), 0.6))
        : mix(ground, earth, Math.min(1, -elevation / 0.6))
    for (let x = 0; x < width; x++) data.set([c[0], c[1], c[2], 255], (y * width + x) * 4)
  }
  const texture = new THREE.DataTexture(data, width, height)
  texture.mapping = THREE.EquirectangularReflectionMapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return (shared = texture)
}

/**
 * Cars: materials tagged `reflective` (by the presentation adapter or the GLB) take the full
 * environment, a little stronger than on the motorcycles so thin chrome trim reads at a distance.
 * Every other lit material gets it at `fill`: the sky light a shaded or far (zenithal) car
 * receives besides the sun. Without it the shadow side of the body, the cabin and dark trim had
 * only the 0.22 ambient and read black. TODO(unverified): `fill` is a look choice.
 */
export const carReflectionOptions = Object.freeze({
  minMetalness: Infinity,
  intensity: 0.8,
  fill: 0.25,
})

/**
 * Reflection level for the atmosphere's daylight factor `day` (0 night .. 1 full day; 1 without a
 * sky): `reflectionNightLevel` up to the night threshold, eased up to 1 at `reflectionFullDay`.
 * The environment is a fixed studio gradient, so it must fade with the light it stands for.
 */
export function reflectionLevel(day: number, lighting = lightingDefaults): number {
  if (!Number.isFinite(day)) return 1
  const t = THREE.MathUtils.smoothstep(day, lighting.nightThreshold, lighting.reflectionFullDay)
  return lighting.reflectionNightLevel + (1 - lighting.reflectionNightLevel) * t
}

/** Materials that took the environment; `setLevel` dims the reflections (night). */
export interface ReflectionEnvironment {
  readonly materials: readonly THREE.MeshStandardMaterial[]
  setLevel(level: number): void
}

/**
 * Give every standard material under `root` with `metalness >= minMetalness`, or tagged
 * `extras.nabla.reflective` in the GLB (glossy glass such as a windscreen), the shared reflection
 * environment. Returns the materials touched.
 */
export function applyReflectionEnvironment(
  root: THREE.Object3D,
  {
    minMetalness = 0.9,
    intensity = 1,
    fill = 0,
  }: { minMetalness?: number; intensity?: number; fill?: number } = {},
): ReflectionEnvironment {
  const materials = new Set<THREE.MeshStandardMaterial>()
  /** Base intensity per material before the daylight level. */
  const base = new Map<THREE.MeshStandardMaterial, number>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of [mesh.material].flat()) {
      const standard = material as THREE.MeshStandardMaterial
      if (!standard.isMeshStandardMaterial || materials.has(standard)) continue
      if (
        standard.metalness >= minMetalness ||
        (material.userData as { nabla?: { reflective?: boolean } }).nabla?.reflective
      ) {
        materials.add(standard)
        base.set(standard, intensity * scale(standard))
      } else if (
        fill > 0 &&
        (!standard.envMap || standard.envMap === reflectionEnvironmentTexture())
      ) {
        materials.add(standard)
        // Sky fill, not a mirror: on a metallic paint the env is a coloured reflection of the bright
        // studio sky and turned light grey paint near white. Scale it down with the metalness.
        base.set(standard, fill * (1 - THREE.MathUtils.clamp(standard.metalness, 0, 1)))
      }
    }
  })
  const texture = reflectionEnvironmentTexture()
  for (const material of materials) {
    material.envMap = texture
    material.envMapIntensity = base.get(material)!
    // Nothing may glow: chrome reads bright from its base colour and reflection, never emissive.
    material.emissive.set(0, 0, 0)
    material.emissiveIntensity = 0
    shadeEnvironment(material)
    material.needsUpdate = true
  }
  let current = 1
  return {
    materials: [...materials],
    setLevel(level: number) {
      const next = Math.max(0, level)
      if (next === current) return
      current = next
      for (const material of materials) material.envMapIntensity = base.get(material)! * next
    },
  }
}

/** Per-material multiplier from the GLB (`extras.nabla.envIntensity`, e.g. a windscreen's
 * slight reflection); 1 when omitted. */
function scale(material: THREE.Material): number {
  const value = (material.userData as { nabla?: { envIntensity?: number } }).nabla?.envIntensity
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 1
}
