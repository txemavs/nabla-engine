/**
 * Dual interior model — rendered (GL) vs css3d (CSS 3D).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/interior.ts
 *
 * A Place can render two ways:
 *   `rendered` — WebGL-rendered 3D world, walk or fly through the mesh
 *   `css3d`    — CSS 3D room with DOM elements, sit or walk inside
 */
import type { Aabb3 } from '../kind/entityAabb.js'
import type { StageCamera } from '../pose.js'
import type { OfficeWorld } from '../office/roomPaint.js'
import { helmInside } from '../office/officeTransforms.js'

/** Render type for the interior. */
export type InteriorRender = 'css3d' | 'rendered'

/** Interior config for one place. */
export interface Interior {
  hostId: string
  render: InteriorRender
  origin: { x: number; y: number; z: number }
  aabb: Aabb3
}

/** Home / shipped place AABB (metres, Y-up). */
export const HOME_INTERIOR_AABB: Aabb3 = {
  min: [-2.5, 0, 0],
  max: [2.5, 3.2, 10],
}

/** Shipped home interior. */
export function homeInterior(hostId = 'world.home'): Interior {
  return {
    hostId,
    render: 'css3d',
    origin: { x: 0, y: 0, z: 0 },
    aabb: HOME_INTERIOR_AABB,
  }
}

/**
 * Determine the interior type for a given host.
 *
 * - Home (`world.home`, containers, etc.) → css3d
 * - Everything else → rendered
 */
export function interiorForHost(
  hostId: string,
  explicitRender?: InteriorRender,
): InteriorRender {
  if (explicitRender) return explicitRender
  if (
    hostId === 'world.home' ||
    hostId.includes('.home.') ||
    hostId.includes('.container.')
  ) {
    return 'css3d'
  }
  return 'rendered'
}

/**
 * Is the camera inside the interior AABB?
 *
 * For css3d uses helmInside; for rendered checks AABB directly.
 */
export function interiorContainsCamera(
  interior: Interior,
  cam: StageCamera,
  office: OfficeWorld,
  viewportW: number,
): boolean {
  if (interior.render === 'css3d') {
    return helmInside(cam, office, viewportW)
  }
  const aabb = interior.aabb
  const x = cam.x / 1000
  const y = -cam.y / 1000
  const z = cam.z / 1000
  if (x < aabb.min[0] || x > aabb.max[0]) return false
  if (y < aabb.min[1] || y > aabb.max[1]) return false
  if (z < aabb.min[2] || z > aabb.max[2]) return false
  return true
}
