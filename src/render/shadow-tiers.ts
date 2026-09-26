/** CSM configuration per quality tier. The Studio panel stores the key; the renderer owns the table. */
export interface ShadowTier {
  cascades: number
  mapSize: number
  maxFar: number
  /** Shadow sampling radius for Three.js r186 PCF filtering. */
  radius: number
  /** Normal bias to reduce shadow acne on curved surfaces (metres). */
  normalBias: number
}

/** Mapping from shadow quality value to CSM configuration. */
export const shadowTiers: Record<number, ShadowTier | null> = {
  0: null, // disabled
  512: { cascades: 1, mapSize: 512, maxFar: 40, radius: 2.5, normalBias: 0.08 },
  1024: { cascades: 2, mapSize: 1024, maxFar: 1000, radius: 2, normalBias: 0.06 },
  2048: { cascades: 3, mapSize: 2048, maxFar: 4000, radius: 1.5, normalBias: 0.04 },
  4096: { cascades: 4, mapSize: 2048, maxFar: 4000, radius: 1.5, normalBias: 0.04 },
}
