import { z } from 'zod'

/** Aperture link. `pairId` is null until another mouth points back. */
export const portalField = z
  .object({
    pairId: z.string().min(1).max(128).nullable(),
    mode: z.enum(['closed', 'window', 'open']),
    clearsRamp: z.boolean().optional(),
  })
  .strict()
