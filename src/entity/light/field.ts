import { z } from 'zod'

const intensity = z.number().finite().min(0).max(10000)

/** Emissive payload. `highway` is the default mast; `globe` is the neighbourhood head. */
export const lightField = z
  .object({
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    intensity,
    distance: z.number().finite().min(1).max(100),
    enabled: z.boolean(),
    nightOnly: z.boolean(),
    shape: z.enum(['highway', 'globe']).optional(),
  })
  .strict()
