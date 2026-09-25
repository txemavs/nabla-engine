import { z } from 'zod'
import { finite, vector } from '../coords.js'

/** Centre lines draped on a terrain entity. A bridge or tunnel may be profiled. */
export const roadField = z
  .object({
    paths: z.array(z.array(vector).min(2).max(8192)).min(1).max(8192),
    width: finite.min(0.5).max(30),
    terrainId: z.string(),
    renderSuppressed: z.boolean().optional(),
    mode: z.enum(['raw', 'smooth-float']).optional(),
    elevation: z.enum(['terrain', 'bridge', 'tunnel']).optional(),
    profiled: z.boolean().optional(),
    layer: z.number().int().min(-5).max(5).optional(),
  })
  .strict()
