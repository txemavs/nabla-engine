/**
 * Hit capsules on an animated skeleton: one capsule per bone that a {@link HIT_ZONES} entry
 * names, from the bone to the mean of its child bones (a bone without children gets a
 * sphere). Built once per body; positions are read from the live pose at each query.
 */
import * as THREE from 'three'
import { HIT_ZONES, zoneOfBone, type HitZoneId } from '../../simulation/combat/damage.js'

export interface HitCapsule {
  bone: THREE.Object3D
  children: THREE.Object3D[]
  zone: HitZoneId
  radius: number
}

export interface CapsuleHit {
  /** Distance along the ray, m. */
  distance: number
  point: THREE.Vector3
  zone: HitZoneId
  bone: THREE.Object3D
}

const a = new THREE.Vector3()
const b = new THREE.Vector3()
const tmp = new THREE.Vector3()

export class HitVolumes {
  readonly capsules: HitCapsule[] = []
  /** Scale on every radius (tests, bigger or smaller bodies). */
  radiusScale = 1
  constructor(readonly root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object as THREE.Bone).isBone) return
      const zone = zoneOfBone(object.name)
      if (!zone) return
      const children = object.children.filter((child) => (child as THREE.Bone).isBone)
      this.capsules.push({ bone: object, children, zone: zone.id, radius: zone.radius })
    })
  }
  get empty(): boolean {
    return this.capsules.length === 0
  }
  /** Segment ends of a capsule in world space (after the last pose update). */
  segment(capsule: HitCapsule, start: THREE.Vector3, end: THREE.Vector3): void {
    capsule.bone.getWorldPosition(start)
    if (!capsule.children.length) {
      end.copy(start)
      return
    }
    end.set(0, 0, 0)
    for (const child of capsule.children) end.add(child.getWorldPosition(tmp))
    end.divideScalar(capsule.children.length)
    // Head: its child is the skull top end; a hand: its fingers. Both fine as the segment.
  }
  /**
   * The capsule the ray (world, unit `direction`) hits within `far`, or null. Capsules overlap
   * at the joints (the chest reaches the neck), so among the capsules entered within
   * {@link OVERLAP_M} of the first entry, the one whose bone axis the ray passes closest to
   * (relative to its radius) wins: a shot through the neck is a neck hit, not chest.
   */
  raycast(origin: THREE.Vector3, direction: THREE.Vector3, far: number): CapsuleHit | null {
    if (!this.root.visible) return null
    // Broad phase: a 1.3 m sphere around the standing body centre.
    this.root.getWorldPosition(a).y += 0.9
    const along = tmp.subVectors(a, origin).dot(direction)
    if (along < -1.3 || along > far + 1.3) return null
    const t = Math.max(0, along)
    if (b.copy(origin).addScaledVector(direction, t).distanceToSquared(a) > 1.3 * 1.3) return null
    this.root.updateWorldMatrix(true, true)
    const hits: { capsule: HitCapsule; entry: number; ratio: number }[] = []
    for (const capsule of this.capsules) {
      this.segment(capsule, a, b)
      const r = capsule.radius * this.radiusScale
      const entry = rayCapsule(origin, direction, a, b, r)
      if (entry === null || entry > far) continue
      hits.push({
        capsule,
        entry,
        ratio: Math.sqrt(rayAxisDistanceSq(origin, direction, a, b)) / r,
      })
    }
    if (!hits.length) return null
    const first = Math.min(...hits.map((hit) => hit.entry))
    const best = hits
      .filter((hit) => hit.entry <= first + OVERLAP_M)
      .reduce((x, y) => (y.ratio < x.ratio ? y : x))
    return {
      distance: best.entry,
      point: origin.clone().addScaledVector(direction, best.entry),
      zone: best.capsule.zone,
      bone: best.capsule.bone,
    }
  }
}

/** Entries this close behind the first one count as the same spot on the body, m. */
export const OVERLAP_M = 0.2

/** Squared closest distance between a ray and a segment (sampled, then refined). */
function rayAxisDistanceSq(
  o: THREE.Vector3,
  d: THREE.Vector3,
  p: THREE.Vector3,
  q: THREE.Vector3,
): number {
  // Find t first: closestAlongRay reuses the scratch vector.
  const t = closestAlongRay(o, d, p, q)
  return distanceToSegmentSq(tmp.copy(o).addScaledVector(d, t), p, q)
}

/** Ray parameter (t >= 0) of the closest approach to a segment: the distance is convex in t. */
function closestAlongRay(
  o: THREE.Vector3,
  d: THREE.Vector3,
  p: THREE.Vector3,
  q: THREE.Vector3,
): number {
  let lo = 0,
    hi = Math.max(1, o.distanceTo(p) + o.distanceTo(q))
  const at = (t: number) => distanceToSegmentSq(tmp.copy(o).addScaledVector(d, t), p, q)
  for (let i = 0; i < 48; i++) {
    const m1 = lo + (hi - lo) / 3,
      m2 = hi - (hi - lo) / 3
    if (at(m1) < at(m2)) hi = m2
    else lo = m1
  }
  return (lo + hi) / 2
}

/** Zones known to the table, for checks. */
export const HIT_ZONE_IDS: readonly HitZoneId[] = HIT_ZONES.map((zone) => zone.id)

/**
 * Entry distance of a ray (unit `d`) into the capsule `p`–`q` of radius `r`, or null. Exact
 * for the sphere caps and the cylinder (closest-approach sampling refined by bisection).
 */
export function rayCapsule(
  o: THREE.Vector3,
  d: THREE.Vector3,
  p: THREE.Vector3,
  q: THREE.Vector3,
  r: number,
): number | null {
  const r2 = r * r
  const inside = (t: number) => distanceToSegmentSq(tmp.copy(o).addScaledVector(d, t), p, q) <= r2
  const s = closestAlongRay(o, d, p, q)
  if (!inside(s)) return null
  if (inside(0)) return 0
  // Bisection between the ray start (outside) and the closest approach (inside).
  let lo = 0,
    hi = s
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (inside(mid)) hi = mid
    else lo = mid
  }
  return hi
}

function distanceToSegmentSq(x: THREE.Vector3, p: THREE.Vector3, q: THREE.Vector3): number {
  const ux = q.x - p.x,
    uy = q.y - p.y,
    uz = q.z - p.z
  const len = ux * ux + uy * uy + uz * uz
  let t = len > 1e-12 ? ((x.x - p.x) * ux + (x.y - p.y) * uy + (x.z - p.z) * uz) / len : 0
  t = Math.min(1, Math.max(0, t))
  const dx = x.x - (p.x + ux * t),
    dy = x.y - (p.y + uy * t),
    dz = x.z - (p.z + uz * t)
  return dx * dx + dy * dy + dz * dz
}
