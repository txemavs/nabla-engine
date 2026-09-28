import { z } from 'zod'

/** Billboard on a nonphysical group. The url is a site path to a png. */
export const spriteField = z
  .object({
    url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.png$/),
    target: z.boolean().optional(),
    upright: z.boolean().optional(),
    saturation: z.number().finite().min(0).max(1).optional(),
    groundShadow: z.boolean().optional(),
  })
  .strict()
