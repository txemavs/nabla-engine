import { z } from 'zod'

/** Ground material painted on a draped solid. The names match `planet/land/surface.ts`. */
export const landcoverField = z
  .object({
    surface: z.enum([
      'grass',
      'forest',
      'farmland',
      'sand',
      'scrub',
      'water',
      'wetland',
      'rock',
      'residential',
      'industrial',
      'default',
    ]),
    isWater: z.boolean(),
  })
  .strict()
