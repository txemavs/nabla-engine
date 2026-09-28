import { z } from 'zod'

/**
 * Where a generated entity came from.
 * OpenStreetMap ids are `way|node|relation` plus digits.
 * GeoEuskadi ids need a dataset name and a 64-character revision.
 */
export const sourceField = z
  .object({
    provider: z.enum(['openstreetmap', 'geoeuskadi']),
    dataset: z.string().optional(),
    revision: z.string().optional(),
    id: z.string().min(1).max(160),
    retrievedAt: z.string(),
    tags: z.record(z.string(), z.string()),
  })
  .strict()
  .refine(
    (source) =>
      source.provider === 'openstreetmap'
        ? /^(way|node|relation)\/\d+$/.test(source.id)
        : !!source.dataset && /^[a-f0-9]{64}$/.test(source.revision ?? ''),
    'Invalid provider provenance',
  )
