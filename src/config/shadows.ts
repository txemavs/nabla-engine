/** CSM configuration per quality tier. The Studio panel stores the key; the renderer owns the table. */
export interface ShadowTier {
  cascades: number
  mapSize: number
  maxFar: number
  /** Shadow sampling radius for Three.js r186 PCF filtering, in texels. */
  radius: number
  /**
   * Receiver offset along its normal, in texels of each cascade. The renderer multiplies it by the
   * world size of one shadow-map texel (cascade width / map size), so a coarse map gets the larger
   * offset it needs and a sharp one keeps the car's contact shadow attached.
   */
  normalBiasTexels: number
  /** Depth offset toward the sun, in texels of each cascade (converted to metres like the normal bias). */
  depthBiasTexels: number
}

/** Mapping from shadow quality value to CSM configuration. */
export const shadowTiers: Record<number, ShadowTier | null> = {
  0: null, // disabled
  512: {
    cascades: 1,
    mapSize: 512,
    maxFar: 120,
    radius: 3.5,
    normalBiasTexels: 0.3,
    depthBiasTexels: 0.3,
  },
  1024: {
    cascades: 2,
    mapSize: 1024,
    maxFar: 1000,
    radius: 3,
    normalBiasTexels: 0.4,
    depthBiasTexels: 0.3,
  },
  2048: {
    cascades: 3,
    mapSize: 2048,
    maxFar: 4000,
    radius: 2.5,
    normalBiasTexels: 0.5,
    depthBiasTexels: 0.3,
  },
  4096: {
    cascades: 4,
    mapSize: 2048,
    maxFar: 4000,
    radius: 2.5,
    normalBiasTexels: 0.5,
    depthBiasTexels: 0.3,
  },
}

/**
 * Bias limits in metres, before the player's correction factor. The floor keeps the old fixed
 * offsets on very tight frusta; the ceiling stops far cascades (metres-wide texels) from lifting
 * building shadows off their footprint.
 */
export const shadowBiasMetres = Object.freeze({
  normal: { min: 0.04, max: 0.5 },
  depth: { min: 0.02, max: 0.5 },
})

/**
 * Player/host multiplier on the tier's shadow bias («Sombras: corrección de rayas»). 1 is the
 * tuned default; 0 removes the bias (shows acne), larger values trade stripes for detached shadows.
 */
export const shadowBiasRange = Object.freeze({ min: 0, max: 3, default: 1 })

/** Clamp a host or stored bias factor; anything that is not a finite number gives the default. */
export function normalizeShadowBias(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return shadowBiasRange.default
  return Math.min(shadowBiasRange.max, Math.max(shadowBiasRange.min, n))
}

/** Bias of one cascade, in metres, for a shadow-map texel of `texelMetres` and a player factor. */
export function cascadeShadowBias(
  tier: Pick<ShadowTier, 'normalBiasTexels' | 'depthBiasTexels'>,
  texelMetres: number,
  scale: number = shadowBiasRange.default,
): { normal: number; depth: number } {
  const clamp = (value: number, range: { min: number; max: number }) =>
    Math.min(range.max, Math.max(range.min, value))
  return {
    normal: clamp(tier.normalBiasTexels * texelMetres, shadowBiasMetres.normal) * scale,
    depth: clamp(tier.depthBiasTexels * texelMetres, shadowBiasMetres.depth) * scale,
  }
}
