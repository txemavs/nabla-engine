/**
 * One image covers the six room faces. World size stays; this is the
 * source net (golden ratio) so the skins are pieces of the same sheet.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/roomSkin.ts
 *
 * φ = (1+√5)/2. Unit `H` = wall height. Room width `W` = φH.
 * Depth `D` = φW = φ²H. Floor is a 1×φ rectangle; front is φ×1.
 *
 * Horizontal sheet (spine): BACK | FLOOR | FRONT | TOP
 * Shared vertical axis = room X (down the image). Floor's −Z edge
 * (toward the port) is the left edge of FRONT — one fold, the horizon.
 *
 *     x:  0    H        H+D      H+D+H     2H+2D
 *   y=0        ┌─────────────────┐
 *              │      LEFT       │  D × H
 *   y=H ┌──────┼─────────────────┼─────────┬──────────┐
 *       │ BACK │      FLOOR      │  FRONT  │   TOP    │
 *       │ H×W  │      D × W      │  H × W  │  D × W   │
 * y=H+W └──────┼─────────────────┼─────────┴──────────┘
 *              │      RIGHT      │  D × H
 * y=2H+W       └─────────────────┘
 *
 * Paint in this orientation. The helm port (alpha) is FRONT.
 * LEFT / RIGHT / BACK / TOP / FLOOR are the opaque hull.
 */
export const PHI = (1 + Math.sqrt(5)) / 2

/** Wall height in the source. */
export const SKIN_H = 1000
export const SKIN_W = Math.round(PHI * SKIN_H)
export const SKIN_D = Math.round(PHI * SKIN_W)

export type SkinFace = 'left' | 'right' | 'floor' | 'front' | 'back' | 'top'

export interface SkinRect {
  face: SkinFace
  x: number
  y: number
  w: number
  h: number
}

export function roomSkinRects(): Record<SkinFace, SkinRect> {
  const H = SKIN_H
  const W = SKIN_W
  const D = SKIN_D
  return {
    left: { face: 'left', x: H, y: 0, w: D, h: H },
    back: { face: 'back', x: 0, y: H, w: H, h: W },
    floor: { face: 'floor', x: H, y: H, w: D, h: W },
    front: { face: 'front', x: H + D, y: H, w: H, h: W },
    top: { face: 'top', x: H + D + H, y: H, w: D, h: W },
    right: { face: 'right', x: H, y: H + W, w: D, h: H },
  }
}

export function roomSkinSize(): { width: number; height: number } {
  return { width: 2 * SKIN_H + 2 * SKIN_D, height: SKIN_W + 2 * SKIN_H }
}

/** CSS % position: the X% point of the image sits on the X% of the box. */
function spriteAlign(origin: number, span: number, sheet: number): number {
  const den = sheet - span
  if (den <= 0) return 0
  return (origin / den) * 100
}

/** Sprite crop: one atlas, this face fills the quad. */
export function roomSkinFaceCss(face: SkinFace): {
  backgroundSize: string
  backgroundPosition: string
  backgroundRepeat: 'no-repeat'
} {
  const r = roomSkinRects()[face]
  const sheet = roomSkinSize()
  return {
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${(sheet.width / r.w) * 100}% ${(sheet.height / r.h) * 100}%`,
    backgroundPosition: `${spriteAlign(r.x, r.w, sheet.width)}% ${spriteAlign(r.y, r.h, sheet.height)}%`,
  }
}

/** In-plane UV turn (degrees). Geometry stays. */
export const ROOM_SKIN_TURN: Partial<Record<SkinFace, 90 | -90>> = {
  floor: 90,
  back: 90,
  top: 90,
}

export function roomSkinTurn(face: SkinFace): 0 | 90 | -90 {
  return ROOM_SKIN_TURN[face] ?? 0
}

/** How the pixels sit on the world (artist notes, not CSS). */
export const ROOM_SKIN_AXES: Record<SkinFace, string> = {
  floor: 'image → : room +Z (back) to −Z (port). image ↓ : room −X to +X',
  front: 'image → : room +Y (floor) to −Y (ceil). image ↓ : room −X to +X',
  back: 'image → : room −Y (ceil) to +Y (floor) — right edge is the sill. image ↓ : −X to +X',
  top: 'image → : room −X to +X. image ↓ : room −Z (port) to +Z (back) — 90° on the ridge',
  left: 'image → : room +Z to −Z. image ↓ : −Y (ceil) to +Y (floor) — bottom edge is the sill',
  right: 'image → : room +Z to −Z. image ↓ : +Y (floor) to −Y (ceil) — top edge is the sill',
}
