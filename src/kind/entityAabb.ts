/**
 * Local mesh AABB (GLB metres) and the wire that shows it in walk-GL.
 * Pick aims at this box, not the file origin (A3 is nose-origin).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/entityAabb.ts
 */
import { metersYupModel, type GlbPrimitive, type RoomMeshPose } from '../gl/glbMesh.js'
import type { DebugLine } from '../vehicle/vehicleDebug.js'

export type Aabb3 = {
  min: [number, number, number]
  max: [number, number, number]
}

/** Exterior pick planes of the posed AABB. */
export type EntityFace = '+x' | '-x' | '+y' | '-y' | '+z' | '-z'

export const ENTITY_FACES: EntityFace[] = ['+x', '-x', '+y', '-y', '+z', '-z']

const aabbById = new Map<string, Aabb3>()

export function isEntityFace(value: unknown): value is EntityFace {
  return value === '+x' || value === '-x' || value === '+y' || value === '-y' || value === '+z' || value === '-z'
}

export function rememberEntityAabb(id: string, aabb: Aabb3 | null): boolean {
  if (!id) return false
  if (!aabb) {
    if (!aabbById.has(id)) return false
    aabbById.delete(id)
    return true
  }
  const prev = aabbById.get(id)
  if (
    prev &&
    prev.min[0] === aabb.min[0] &&
    prev.min[1] === aabb.min[1] &&
    prev.min[2] === aabb.min[2] &&
    prev.max[0] === aabb.max[0] &&
    prev.max[1] === aabb.max[1] &&
    prev.max[2] === aabb.max[2]
  ) {
    return false
  }
  aabbById.set(id, {
    min: [aabb.min[0], aabb.min[1], aabb.min[2]],
    max: [aabb.max[0], aabb.max[1], aabb.max[2]],
  })
  return true
}

export function rememberedAabb(id: string): Aabb3 | null {
  return aabbById.get(id) ?? null
}

/** Local-metre quad, CCW from outside. */
export function aabbFaceCorners(
  aabb: Aabb3,
  face: EntityFace,
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const [x0, y0, z0] = aabb.min
  const [x1, y1, z1] = aabb.max
  if (face === '+x') return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]
  if (face === '-x') return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]
  if (face === '+y') return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]
  if (face === '-y') return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]
  if (face === '+z') return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]
}

export function posedFaceCorners(
  pose: RoomMeshPose,
  aabb: Aabb3,
  face: EntityFace,
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const m = metersYupModel(pose)
  return aabbFaceCorners(aabb, face).map((p) => mulPoint(m, p[0], p[1], p[2])) as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
}

function fitOpening(span: number, want: number): number {
  if (span <= 0.2) return Math.max(0, span)
  const margin = Math.min(0.08, span * 0.04)
  return Math.min(want, Math.max(0.2, span - 2 * margin))
}

/** Inset rect on a face — marco opening, not the full AABB. */
export function aabbOpeningCorners(
  aabb: Aabb3,
  face: EntityFace,
  openingW: number,
  openingH: number,
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const [x0, y0, z0] = aabb.min
  const [x1, y1, z1] = aabb.max
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const cz = (z0 + z1) / 2
  if (face === '+z' || face === '-z') {
    const ow = fitOpening(x1 - x0, openingW)
    const oh = fitOpening(y1 - y0, openingH)
    const xa = cx - ow / 2
    const xb = cx + ow / 2
    const ya = cy - oh / 2
    const yb = cy + oh / 2
    const z = face === '+z' ? z1 : z0
    if (face === '+z') return [[xa, ya, z], [xb, ya, z], [xb, yb, z], [xa, yb, z]]
    return [[xb, ya, z], [xa, ya, z], [xa, yb, z], [xb, yb, z]]
  }
  if (face === '+x' || face === '-x') {
    const ow = fitOpening(z1 - z0, openingW)
    const oh = fitOpening(y1 - y0, openingH)
    const za = cz - ow / 2
    const zb = cz + ow / 2
    const ya = cy - oh / 2
    const yb = cy + oh / 2
    const x = face === '+x' ? x1 : x0
    if (face === '+x') return [[x, ya, zb], [x, ya, za], [x, yb, za], [x, yb, zb]]
    return [[x, ya, za], [x, ya, zb], [x, yb, zb], [x, yb, za]]
  }
  const ow = fitOpening(x1 - x0, openingW)
  const od = fitOpening(z1 - z0, openingH)
  const xa = cx - ow / 2
  const xb = cx + ow / 2
  const za = cz - od / 2
  const zb = cz + od / 2
  const y = face === '+y' ? y1 : y0
  if (face === '+y') return [[xa, y, zb], [xb, y, zb], [xb, y, za], [xa, y, za]]
  return [[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]]
}

export function posedOpeningCorners(
  pose: RoomMeshPose,
  aabb: Aabb3,
  face: EntityFace,
  openingW: number,
  openingH: number,
): [[number, number, number], [number, number, number], [number, number, number], [number, number, number]] {
  const m = metersYupModel(pose)
  return aabbOpeningCorners(aabb, face, openingW, openingH).map((p) => mulPoint(m, p[0], p[1], p[2])) as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ]
}

export function aabbFaceCenter(aabb: Aabb3, face: EntityFace): { x: number; y: number; z: number } {
  const [x0, y0, z0] = aabb.min
  const [x1, y1, z1] = aabb.max
  const x = (x0 + x1) / 2
  const y = (y0 + y1) / 2
  const z = (z0 + z1) / 2
  if (face === '+x') return { x: x1, y, z }
  if (face === '-x') return { x: x0, y, z }
  if (face === '+y') return { x, y: y1, z }
  if (face === '-y') return { x, y: y0, z }
  if (face === '+z') return { x, y, z: z1 }
  return { x, y, z: z0 }
}

/** Local yaw (rad) so portal +Z walks into the box. Y faces keep 0. */
export function aabbFaceInYaw(face: EntityFace): number {
  if (face === '+z') return Math.PI
  if (face === '-x') return Math.PI / 2
  if (face === '+x') return -Math.PI / 2
  return 0
}

export function primsAabbM(prims: GlbPrimitive[]): Aabb3 | null {
  let minX = Infinity
  let minY = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let maxZ = -Infinity
  let any = false
  for (const prim of prims) {
    const p = prim.positions
    for (let i = 0; i < p.length; i += 3) {
      any = true
      const x = p[i]
      const y = p[i + 1]
      const z = p[i + 2]
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (z < minZ) minZ = z
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
      if (z > maxZ) maxZ = z
    }
  }
  if (!any || !Number.isFinite(minX)) return null
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
}

export function invertAffine(m: Float32Array): Float32Array | null {
  const a00 = m[0]
  const a01 = m[4]
  const a02 = m[8]
  const a10 = m[1]
  const a11 = m[5]
  const a12 = m[9]
  const a20 = m[2]
  const a21 = m[6]
  const a22 = m[10]
  const det =
    a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)
  if (Math.abs(det) < 1e-12) return null
  const i00 = (a11 * a22 - a12 * a21) / det
  const i01 = (a02 * a21 - a01 * a22) / det
  const i02 = (a01 * a12 - a02 * a11) / det
  const i10 = (a12 * a20 - a10 * a22) / det
  const i11 = (a00 * a22 - a02 * a20) / det
  const i12 = (a02 * a10 - a00 * a12) / det
  const i20 = (a10 * a21 - a11 * a20) / det
  const i21 = (a01 * a20 - a00 * a21) / det
  const i22 = (a00 * a11 - a01 * a10) / det
  const tx = m[12]
  const ty = m[13]
  const tz = m[14]
  return new Float32Array([
    i00, i10, i20, 0,
    i01, i11, i21, 0,
    i02, i12, i22, 0,
    -(i00 * tx + i01 * ty + i02 * tz),
    -(i10 * tx + i11 * ty + i12 * tz),
    -(i20 * tx + i21 * ty + i22 * tz),
    1,
  ])
}

function mulPoint(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ]
}

function mulDir(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z,
    m[1] * x + m[5] * y + m[9] * z,
    m[2] * x + m[6] * y + m[10] * z,
  ]
}

/** Slab. ``d`` is not required to be unit. ``t`` is in the same units as ``o``. */
export function rayHitsAabb(
  o: [number, number, number],
  d: [number, number, number],
  box: Aabb3,
): number | null {
  let tmin = 0
  let tmax = Infinity
  for (let i = 0; i < 3; i++) {
    const di = d[i]
    if (Math.abs(di) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return null
      continue
    }
    const t1 = (box.min[i] - o[i]) / di
    const t2 = (box.max[i] - o[i]) / di
    const lo = Math.min(t1, t2)
    const hi = Math.max(t1, t2)
    if (lo > tmin) tmin = lo
    if (hi < tmax) tmax = hi
    if (tmin > tmax) return null
  }
  if (tmax < 0) return null
  return tmin >= 0 ? tmin : 0
}

/** Camera ray (GL mm) vs local-metre AABB posed by ``metersYupModel``. */
export function rayHitsPosedAabb(
  originMm: [number, number, number],
  dirMm: [number, number, number],
  pose: RoomMeshPose,
  aabbM: Aabb3,
): number | null {
  const inv = invertAffine(metersYupModel(pose))
  if (!inv) return null
  const o = mulPoint(inv, originMm[0], originMm[1], originMm[2])
  const d = mulDir(inv, dirMm[0], dirMm[1], dirMm[2])
  return rayHitsAabb(o, d, aabbM)
}

export function aabbWireLines(
  pose: RoomMeshPose,
  aabb: Aabb3,
  rgb: [number, number, number],
): DebugLine[] {
  const m = metersYupModel(pose)
  const [x0, y0, z0] = aabb.min
  const [x1, y1, z1] = aabb.max
  const c = [
    mulPoint(m, x0, y0, z0),
    mulPoint(m, x1, y0, z0),
    mulPoint(m, x1, y1, z0),
    mulPoint(m, x0, y1, z0),
    mulPoint(m, x0, y0, z1),
    mulPoint(m, x1, y0, z1),
    mulPoint(m, x1, y1, z1),
    mulPoint(m, x0, y1, z1),
  ]
  const edges: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ]
  return edges.map(([i, j]) => ({ a: c[i], b: c[j], rgb }))
}

/** File origin — the old pick point. White so it reads against the box. */
export function poseOriginLines(pose: RoomMeshPose): DebugLine[] {
  const m = metersYupModel(pose)
  const o = mulPoint(m, 0, 0, 0)
  const arm = 180
  const rgb: [number, number, number] = [1, 1, 1]
  return [
    { a: [o[0] - arm, o[1], o[2]], b: [o[0] + arm, o[1], o[2]], rgb },
    { a: [o[0], o[1] - arm, o[2]], b: [o[0], o[1] + arm, o[2]], rgb },
    { a: [o[0], o[1], o[2] - arm], b: [o[0], o[1], o[2] + arm], rgb },
  ]
}
