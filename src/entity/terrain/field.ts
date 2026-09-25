import { z } from 'zod'
import { coordinate, finite } from '../coords.js'

/** Heightfield samples. `colors` paints one vertex each, when present. */
export const terrainField = z
  .object({
    columns: z.number().int().min(2).max(129),
    rows: z.number().int().min(2).max(129),
    spacing: finite.min(0.25).max(100),
    heights: z.array(coordinate).min(4).max(16641),
    colors: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
      .min(4)
      .max(16641)
      .optional(),
  })
  .strict()
