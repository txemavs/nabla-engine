/**
 * Procedural reflection environment for polished metal. The scene has no environment map, so a
 * metallic PBR material (chrome exhaust, mirror glass) reflects nothing and renders black. This
 * gives such materials a small shared sky-over-ground gradient (three.js prefilters it), so
 * chrome reads as bright polished metal. Matte and painted materials are left alone.
 */
import * as THREE from 'three'

let shared: THREE.DataTexture | null = null

/** Equirectangular sky (zenith → bright horizon) over a dark ground, shared by every model. */
export function reflectionEnvironmentTexture(): THREE.DataTexture {
  if (shared) return shared
  const width = 128,
    height = 64,
    data = new Uint8Array(width * height * 4)
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t)
  const zenith = [70, 120, 200],
    horizon = [235, 240, 245],
    ground = [95, 92, 88],
    earth = [55, 52, 50]
  for (let y = 0; y < height; y++) {
    const elevation = (0.5 - (y + 0.5) / height) * Math.PI
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
  for (const material of materials) {
    material.envMap = texture
    material.envMapIntensity = intensity
    material.needsUpdate = true
  }
  let current = intensity
  return {
    materials: [...materials],
    setLevel(level: number) {
      const next = intensity * Math.max(0, level)
      if (next === current) return
      current = next
      for (const material of materials) material.envMapIntensity = next
    },
  }
}
