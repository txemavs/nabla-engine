import * as THREE from 'three'
import { EARTH_RADIUS, type GeoPoint } from '../../math/geo/sphere.js'
import { SURFACE_COLORS } from '../../planet/land/surface.js'
import { waterWaves } from './water-material.js'
export const SEA_ALTITUDE = 0
const rings = 48,
  segments = 128,
  radius = EARTH_RADIUS + SEA_ALTITUDE
/** One bounded draw: dense near the boat, coarse beyond the requested viewing distance.
 * Geometry lies on the same sphere/sea level used by boat buoyancy. Land occludes it.
 */
export function oceanGeometry(reach: number): THREE.BufferGeometry {
  const positions = [0, 0, 0],
    normals = [0, 1, 0],
    indices: number[] = []
  for (let ring = 1; ring <= rings; ring++) {
    const r = 8 * (Math.pow(1 + reach / 8, ring / rings) - 1)
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const x = Math.cos(angle) * r,
        z = Math.sin(angle) * r
      // Stable sagitta, avoiding subtraction of nearly equal Earth radii.
      const y = (-r * r) / (radius + Math.sqrt(radius * radius - r * r))
      positions.push(x, y, z)
      normals.push(x / radius, (radius + y) / radius, z / radius)
      const current = 1 + (ring - 1) * segments + i
      const next = 1 + (ring - 1) * segments + ((i + 1) % segments)
      if (ring === 1) indices.push(0, next, current)
      else {
        const previous = current - segments,
          previousNext = next - segments
        indices.push(previous, next, current, previous, previousNext, next)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}
export class OceanSheet {
  private readonly time = { value: 0 }
  private readonly offset = { value: new THREE.Vector3() }
  private readonly texture: THREE.Texture
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private reach = 0
  private level = 0
  setLevel(metres: number): void {
    if (!Number.isFinite(metres)) return
    this.level = Math.max(-5, Math.min(50, metres))
  }
  private readonly up = new THREE.Vector3(0, 1, 0)
  constructor(changed: () => void = () => {}) {
    this.texture = new THREE.TextureLoader().load('/geography/water-normal.png', changed)
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.surface())
    this.mesh.name = 'Sea'
    this.mesh.receiveShadow = true
    this.mesh.renderOrder = -1
  }
  surface(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
      color: SURFACE_COLORS.water,
      roughness: 0.3,
      metalness: 0.15,
      side: THREE.DoubleSide,
    })
    waterWaves(material, this.texture, this.time, this.offset)
    return material
  }
  update(
    origin: GeoPoint,
    eye: THREE.Vector3,
    renderOrigin: THREE.Vector3,
    distance: number,
    now: number,
  ): void {
    this.time.value = now / 1000
    this.offset.value.copy(renderOrigin)
    const reach = Math.max(2000, Math.min(120000, Math.ceil(distance / 1000) * 1000 + 2000))
    if (reach !== this.reach) {
      this.reach = reach
      this.mesh.geometry.dispose()
      this.mesh.geometry = oceanGeometry(reach)
    }
    const center = new THREE.Vector3(0, -EARTH_RADIUS - origin.altitude, 0)
    const radial = eye.clone().sub(center).normalize()
    this.mesh.position
      .copy(radial)
      .multiplyScalar(radius + this.level)
      .add(center)
      .sub(renderOrigin)
    this.mesh.scale.setScalar((radius + this.level) / radius)
    this.mesh.quaternion.setFromUnitVectors(this.up, radial)
  }
  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.texture.dispose()
  }
}
