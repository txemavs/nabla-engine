/**
 * Portal / window aperture projection (CAVE / Kooima).
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
 *
 * This module provides clearer naming for the aperture API while delegating
 * to the core CAVE math in portal/portalProj.ts.
 *
 * @packageDocumentation
 */
import type { Vec3 } from './glMath.js'
import {
  portalEyeCss,
  portalViewProjParts,
  type PortalViewProj,
} from '../portal/portalProj.js'

export { type PortalViewProj }

/**
 * CSS optical eye position for portal/window projection.
 *
 * CSS `perspective: 1200px` sits that far *in front of* the FPS camera —
 * not at `camera.z`. When computing the CAVE frustum from the seated eye
 * through a window on the glass (z≈0), we need this 1.2m eye position,
 * not the camera's z coordinate directly.
 *
 * @param cam - Camera position in CSS coordinates (1 px = 1 mm)
 * @returns Eye position in CSS space, offset by STAGE_PERSPECTIVE along Z
 */
export function apertureEyeCss(cam: { x: number; y: number; z: number }): Vec3 {
  return portalEyeCss(cam)
}

/**
 * Window/portal aperture corners in CSS world (1 px = 1 mm).
 * Returns bottom-left (pa), bottom-right (pb), top-left (pc) as seen from the seat.
 *
 * These three points define the rectangular aperture plane for CAVE projection.
 * The fourth corner (top-right) is derived: pb + (pc - pa).
 */
export interface ApertureCorners {
  /** Bottom-left corner in CSS mm */
  pa: Vec3
  /** Bottom-right corner in CSS mm */
  pb: Vec3
  /** Top-left corner in CSS mm */
  pc: Vec3
}

/**
 * Result of computing a view-through-aperture projection.
 * Use `mvp` directly for rendering, or `view`/`proj` separately for skybox etc.
 */
export interface ApertureViewProj {
  /** Combined model-view-projection matrix */
  mvp: Float32Array
  /** Projection matrix (asymmetric frustum) */
  proj: Float32Array
  /** View matrix (eye-relative basis) */
  view: Float32Array
  /** Near clip plane distance in GL units */
  near: number
  /** Far clip plane distance in GL units */
  far: number
}

/**
 * Compute head-tracked projection for looking through a window/portal aperture.
 *
 * Given the viewer's eye position and three corners of a rectangular aperture,
 * computes the asymmetric frustum that makes content behind the aperture appear
 * with correct perspective — as if you're looking through a physical window.
 *
 * This is the core CAVE/Kooima projection used for:
 * - CSS3D window into rendered world
 * - Portal mouth showing destination with head-tracked perspective
 *
 * All inputs are in CSS coordinates (1 px = 1 mm, +Y down).
 * The aperture is defined by three corners: bottom-left (pa), bottom-right (pb),
 * top-left (pc). The fourth corner is derived.
 *
 * @param eyeCss - Eye position in CSS mm (use `apertureEyeCss` for seated camera)
 * @param paCss - Bottom-left corner of aperture in CSS mm
 * @param pbCss - Bottom-right corner of aperture in CSS mm
 * @param pcCss - Top-left corner of aperture in CSS mm
 * @param far - Far clip plane (default 2.5km in mm units)
 * @returns View+projection matrices, or null if eye is on/behind the plane
 */
export function apertureViewProjParts(
  eyeCss: Vec3,
  paCss: Vec3,
  pbCss: Vec3,
  pcCss: Vec3,
  far = 2_500_000,
): ApertureViewProj | null {
  return portalViewProjParts(eyeCss, paCss, pbCss, pcCss, far)
}

/**
 * Compute head-tracked MVP matrix for looking through a window/portal aperture.
 *
 * Convenience wrapper around `apertureViewProjParts` that returns just the
 * combined MVP matrix. Use when you only need the final transform.
 *
 * @param eyeCss - Eye position in CSS mm
 * @param paCss - Bottom-left corner of aperture in CSS mm
 * @param pbCss - Bottom-right corner of aperture in CSS mm
 * @param pcCss - Top-left corner of aperture in CSS mm
 * @param far - Far clip plane (default 2.5km in mm units)
 * @returns Combined MVP matrix, or null if eye is on/behind the plane
 */
export function apertureViewProj(
  eyeCss: Vec3,
  paCss: Vec3,
  pbCss: Vec3,
  pcCss: Vec3,
  far = 2_500_000,
): Float32Array | null {
  return apertureViewProjParts(eyeCss, paCss, pbCss, pcCss, far)?.mvp ?? null
}

/**
 * Convenience: compute window view from a StageCamera (CSS3D helm position).
 *
 * Combines `apertureEyeCss` + `apertureViewProjParts` for the common case
 * of rendering the GL world through a CSS3D room window.
 *
 * @param cam - StageCamera with x/y/z in CSS mm
 * @param aperture - Three corners of the window aperture
 * @param far - Far clip plane (default 2.5km)
 * @returns View+projection matrices, or null if invalid geometry
 */
export function css3dWindowView(
  cam: { x: number; y: number; z: number },
  aperture: ApertureCorners,
  far = 2_500_000,
): ApertureViewProj | null {
  const eye = apertureEyeCss(cam)
  return apertureViewProjParts(eye, aperture.pa, aperture.pb, aperture.pc, far)
}

/**
 * Convenience: compute portal see-through view from viewer eye.
 *
 * Same projection math as `css3dWindowView`, but named for the portal use case.
 * The portal aperture shows the destination with head-tracked perspective;
 * crossing later teleports you seamlessly.
 *
 * Works in **both** worlds (rendered and css3d).
 *
 * @param eyeCss - Viewer eye position in CSS mm (raw, not camera-offset)
 * @param aperture - Three corners of the portal mouth
 * @param far - Far clip plane (default 2.5km)
 * @returns View+projection matrices, or null if invalid geometry
 */
export function portalApertureView(
  eyeCss: Vec3,
  aperture: ApertureCorners,
  far = 2_500_000,
): ApertureViewProj | null {
  return apertureViewProjParts(eyeCss, aperture.pa, aperture.pb, aperture.pc, far)
}
