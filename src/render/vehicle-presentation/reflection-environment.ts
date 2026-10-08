/**
 * Procedural reflection environment for polished metal. The scene has no environment map, so a
 * metallic PBR material (chrome exhaust, mirror glass) reflects nothing and renders black. This
 * gives such materials a small shared sky-over-ground gradient (three.js prefilters it), so
 * chrome reads as bright polished metal. Matte and painted materials are left alone.
 */
import * as THREE from 'three'

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
  { minMetalness = 0.9, intensity = 1 }: { minMetalness?: number; intensity?: number } = {},
): ReflectionEnvironment {
  const materials = new Set<THREE.MeshStandardMaterial>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    for (const material of [mesh.material].flat())
      if (
        (material as THREE.MeshStandardMaterial).isMeshStandardMaterial &&
        ((material as THREE.MeshStandardMaterial).metalness >= minMetalness ||
          (material.userData as { nabla?: { reflective?: boolean } }).nabla?.reflective)
      )
        materials.add(material as THREE.MeshStandardMaterial)
  })
  const texture = reflectionEnvironmentTexture()
  // Per-material multiplier from the GLB (`extras.nabla.envIntensity`, e.g. a windscreen's
  // slight reflection); 1 when omitted.
  const scale = (material: THREE.Material) => {
    const value = (material.userData as { nabla?: { envIntensity?: number } }).nabla?.envIntensity
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 1
  }
  for (const material of materials) {
    material.envMap = texture
    material.envMapIntensity = intensity * scale(material)
    material.needsUpdate = true
  }
  let current = intensity
  return {
    materials: [...materials],
    setLevel(level: number) {
      const next = intensity * Math.max(0, level)
      if (next === current) return
      current = next
      for (const material of materials) material.envMapIntensity = next * scale(material)
    },
  }
}
