import * as THREE from 'three'
import type { QuatTuple, Vec3Tuple } from '../../math/frame/vectors.js'
import { EARTH_RADIUS, type GeoPoint } from '../../math/geo/sphere.js'
import { CATCH_FLOOR_DEPTH, CATCH_FLOOR_RADIUS } from '../../planet/catch-floor.js'

const STEP = 100
const LINE_WIDTH = 0.3
const AXIS_WIDTH = 0.9
const BLACK = [0.02, 0.02, 0.02]
/** Same as the editor axes: X red, Z blue. */
const X_AXIS = [1, 0, 0]
const Z_AXIS = [0, 0, 1]

/** Flat gray disk. The sea sheet is curved; this one is a plane. */
export class CatchFloor {
  readonly mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>
  private readonly grid: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  private gridKey = ''
  constructor() {
    const geometry = new THREE.CircleGeometry(CATCH_FLOOR_RADIUS, 96)
    geometry.rotateX(-Math.PI / 2)
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: '#8b8e91',
        roughness: 0.95,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    )
    this.mesh.name = 'Catch floor'
    this.mesh.receiveShadow = true
    this.mesh.visible = false
    this.grid = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    )
    this.grid.name = 'Catch floor grid'
    this.grid.renderOrder = 1
    this.mesh.add(this.grid)
  }
  show(position: Vec3Tuple, rotation: QuatTuple, renderOrigin: THREE.Vector3): void {
    this.mesh.visible = true
    this.mesh.position.fromArray(position).sub(renderOrigin)
    this.mesh.quaternion.set(rotation[0], rotation[1], rotation[2], rotation[3])
    this.layout(position, rotation)
  }
  /** Editor preview: the same disk, 30 m under the sea, under the camera. */
  showUnder(
    origin: GeoPoint,
    eye: THREE.Vector3,
    level: number,
    renderOrigin: THREE.Vector3,
  ): void {
    const earth = new THREE.Vector3(0, -EARTH_RADIUS - origin.altitude, 0)
    const radial = eye.clone().sub(earth)
    if (radial.lengthSq() < 1) return
    radial.normalize()
    const top = earth.addScaledVector(radial, EARTH_RADIUS + level - CATCH_FLOOR_DEPTH)
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial)
    const pose = top.toArray() as Vec3Tuple
    const turn: QuatTuple = [rotation.x, rotation.y, rotation.z, rotation.w]
    this.mesh.visible = true
    this.mesh.position.copy(top).sub(renderOrigin)
    this.mesh.quaternion.copy(rotation)
    this.layout(pose, turn)
  }
  private layout(position: Vec3Tuple, rotation: QuatTuple): void {
    const key = [...position, ...rotation].map((n) => Math.round(n * 50) / 50).join(',')
    if (key === this.gridKey) return
    this.gridKey = key
    this.grid.geometry.dispose()
    this.grid.geometry = catchFloorGrid(position, rotation, CATCH_FLOOR_RADIUS)
  }
  hide(): void {
    this.mesh.visible = false
  }
  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.grid.geometry.dispose()
    this.grid.material.dispose()
  }
}

/** World-locked stripes on the disk. 100 m black grid, one hectare; the origin cross is thicker, X red and Z blue. */
export function catchFloorGrid(
  position: Vec3Tuple,
  rotation: QuatTuple,
  radius: number,
): THREE.BufferGeometry {
  const center = new THREE.Vector3().fromArray(position)
  const orientation = new THREE.Quaternion().set(rotation[0], rotation[1], rotation[2], rotation[3])
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orientation)
  const inverse = orientation.clone().invert()
  const positions: number[] = []
  const colors: number[] = []
  const toLocal = (world: THREE.Vector3) => world.sub(center).applyQuaternion(inverse)
  const add = (axis: 'x' | 'z') => {
    const across = axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1)
    const dir = new THREE.Vector3().crossVectors(up, across)
    if (dir.lengthSq() < 1e-8) return
    dir.normalize()
    const side = new THREE.Vector3().crossVectors(up, dir).normalize()
    const fixed = axis === 'x' ? center.x : center.z
    const first = Math.ceil((fixed - radius) / STEP - 1e-9)
    const last = Math.floor((fixed + radius) / STEP + 1e-9)
    for (let i = first; i <= last; i++) {
      const value = i * STEP
      const anchor =
        axis === 'x' ? onPlane(center, up, value, center.z) : onPlane(center, up, center.x, value)
      if (!anchor) continue
      const closest = anchor.addScaledVector(dir, center.clone().sub(anchor).dot(dir))
      const distance = closest.distanceTo(center)
      if (distance >= radius - 0.01) continue
      const half = Math.sqrt(radius * radius - distance * distance)
      const origin = i === 0
      stripe(
        positions,
        colors,
        toLocal,
        closest.clone().addScaledVector(dir, -half),
        closest.clone().addScaledVector(dir, half),
        side,
        up,
        origin ? AXIS_WIDTH : LINE_WIDTH,
        origin ? (axis === 'x' ? Z_AXIS : X_AXIS) : BLACK,
      )
    }
  }
  add('x')
  add('z')
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeBoundingSphere()
  return geometry
}

function onPlane(
  center: THREE.Vector3,
  up: THREE.Vector3,
  x: number,
  z: number,
): THREE.Vector3 | null {
  if (Math.abs(up.y) < 1e-4) return null
  const y = center.y - ((x - center.x) * up.x + (z - center.z) * up.z) / up.y
  return new THREE.Vector3(x, y, z)
}

function stripe(
  positions: number[],
  colors: number[],
  toLocal: (world: THREE.Vector3) => THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  side: THREE.Vector3,
  up: THREE.Vector3,
  width: number,
  color: number[],
): void {
  const half = side.clone().multiplyScalar(width / 2)
  const lift = up.clone().multiplyScalar(0.04)
  const leftA = toLocal(a.clone().sub(half).add(lift))
  const leftB = toLocal(b.clone().sub(half).add(lift))
  const rightB = toLocal(b.clone().add(half).add(lift))
  const rightA = toLocal(a.clone().add(half).add(lift))
  for (const corner of [leftA, leftB, rightB, leftA, rightB, rightA]) {
    positions.push(corner.x, corner.y, corner.z)
    colors.push(color[0], color[1], color[2])
  }
}
