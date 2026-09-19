/**
 * Portal / window aperture projection (CAVE / Kooima).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/portal/portalProj.ts
 *
 * When inside the **css3d** world, some planes can show the **rendered** world
 * (WebGL scene) through head-tracked perspective — like looking through a
 * physical window. The same math applies to **portal mouths**: a plane that
 * shows the destination with correct perspective from the viewer's eye.
 *
 * This is first-class Engine behavior, not a side hack:
 * - Look through portal/window → see destination with head-tracked projection
 * - Walk through portal → seamless mode/place flip (css3d ↔ rendered)
 *
 * The projection works in **both** worlds (rendered and css3d). When you
 * cross the portal, you arrive as if there was no portal — seamless
 * continuation of place.
 */
import type { OfficeWorld } from '../office/roomPaint.js'
import type { Vec3 } from '../gl/glMath.js'
import { cssToGl, frustum, mul4 } from '../gl/glMath.js'
import { roomHalfPx } from '../office/officeTransforms.js'
import { STAGE_PERSPECTIVE } from '../pose.js'

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/**
 * CSS optical eye. `perspective: 1200px` sits that far *in front of*
 * the FPS camera — not at `camera.z`. This is the 1.2m eye the CSS
 * helm already uses.
 */
export function portalEyeCss(cam: { x: number; y: number; z: number }): Vec3 {
  return [cam.x, cam.y, cam.z + STAGE_PERSPECTIVE]
}

/** Port opening in CSS world (1 px = 1 mm). BL, BR, TL as seen from the seat. */
export function portWindowCss(
  office: OfficeWorld,
  viewportW: number,
): { pa: Vec3; pb: Vec3; pc: Vec3 } {
  const hw = roomHalfPx(office, viewportW)
  const z = office.skyZ
  const top = office.skyY
  const bot = office.skyY + office.skyH
  return {
    pa: [-hw, bot, z],
    pb: [hw, bot, z],
    pc: [-hw, top, z],
  }
}

export interface PortalViewProj {
  mvp: Float32Array
  proj: Float32Array
  view: Float32Array
  near: number
  far: number
}

/**
 * View-projection so a texture on `pa–pb–pc` matches rays from `eyeCss`.
 * Returns `null` when the eye is on/behind the plane or too close.
 */
export function portalViewProjParts(
  eyeCss: Vec3,
  paCss: Vec3,
  pbCss: Vec3,
  pcCss: Vec3,
  far = 2_500_000,
): PortalViewProj | null {
  const pe = cssToGl(eyeCss)
  const pa = cssToGl(paCss)
  const pb = cssToGl(pbCss)
  const pc = cssToGl(pcCss)
  const vr = norm(sub(pb, pa))
  const vu = norm(sub(pc, pa))
  const vn = norm(cross(vr, vu))
  const va = sub(pa, pe)
  const d = -dot(va, vn)
  if (!(d > 40)) return null
  const n = Math.max(1, Math.min(d - 20, d * 0.98))
  if (!(n > 1) || n >= d) return null
  const vb = sub(pb, pe)
  const vc = sub(pc, pe)
  const l = (dot(vr, va) * n) / d
  const r = (dot(vr, vb) * n) / d
  const b = (dot(vu, va) * n) / d
  const t = (dot(vu, vc) * n) / d
  if (!(r > l) || !(t > b)) return null
  const view = new Float32Array([
    vr[0], vu[0], vn[0], 0,
    vr[1], vu[1], vn[1], 0,
    vr[2], vu[2], vn[2], 0,
    -dot(vr, pe), -dot(vu, pe), -dot(vn, pe), 1,
  ])
  const proj = frustum(l, r, b, t, n, far)
  return { mvp: mul4(proj, view), proj, view, near: n, far }
}

export function portalViewProj(
  eyeCss: Vec3,
  paCss: Vec3,
  pbCss: Vec3,
  pcCss: Vec3,
  far = 2_500_000,
): Float32Array | null {
  return portalViewProjParts(eyeCss, paCss, pbCss, pcCss, far)?.mvp ?? null
}
