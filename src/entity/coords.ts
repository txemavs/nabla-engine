import { z } from 'zod'

/** Metres. A local vector stays inside a tile; a world vector can span the Earth. */
export const finite = z.number().finite()
export const coordinate = finite.min(-100000).max(100000)
export const vector = z.tuple([coordinate, coordinate, coordinate])
export const rotation = z
  .tuple([finite, finite, finite, finite])
  .refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-5, 'Rotation must be a unit quaternion')
export const size = z.tuple([
  finite.min(0.01).max(10000),
  finite.min(0.01).max(10000),
  finite.min(0.01).max(10000),
])
const worldVector = z.tuple([
  finite.min(-100000000).max(100000000),
  finite.min(-100000000).max(100000000),
  finite.min(-100000000).max(100000000),
])
export const transform = z.object({ position: worldVector, rotation }).strict()
export const boxCollider = z.object({ size, transform }).strict()
